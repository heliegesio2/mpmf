"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Fiado = {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  valor: string;
  descricao: string | null;
  pago: boolean;
  pago_em: string | null;
  criado_em: string;
};

const FILTROS = [
  { valor: "abertas", rotulo: "Em aberto" },
  { valor: "pagas", rotulo: "Pagas" },
  { valor: "todas", rotulo: "Todas" },
];

const moeda = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export default function Contas() {
  const [itens, setItens] = useState<Fiado[]>([]);
  const [filtro, setFiltro] = useState("abertas");
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async (situacao: string) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/fiado?situacao=${situacao}`);
      const d = await r.json();
      if (!r.ok) throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — "));
      setItens(d.itens);
      setErro(false);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar(filtro);
  }, [filtro, carregar]);

  const grupos = useMemo(() => {
    const m = new Map<number, { nome: string; lancamentos: Fiado[] }>();
    for (const f of itens) {
      if (!m.has(f.cliente_id)) m.set(f.cliente_id, { nome: f.cliente_nome, lancamentos: [] });
      m.get(f.cliente_id)!.lancamentos.push(f);
    }
    return [...m.entries()].map(([clienteId, g]) => ({
      clienteId,
      nome: g.nome,
      lancamentos: g.lancamentos,
      aberto: g.lancamentos.filter((l) => !l.pago).reduce((s, l) => s + Number(l.valor), 0),
    }));
  }, [itens]);

  async function marcarPago(id: number) {
    try {
      const r = await fetch(`/api/fiado/${id}`, { method: "PATCH" });
      if (!r.ok) throw new Error();
      setAviso("Lançamento quitado.");
      setErro(false);
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível quitar.");
    }
  }

  async function quitarCliente(clienteId: number, nome: string) {
    if (!confirm(`Marcar todo o fiado em aberto de "${nome}" como pago?`)) return;
    try {
      const r = await fetch("/api/fiado/quitar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteId }),
      });
      if (!r.ok) throw new Error();
      setAviso("Cliente quitado.");
      setErro(false);
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível quitar.");
    }
  }

  const totalAberto = grupos.reduce((s, g) => s + g.aberto, 0);

  return (
    <main className="tela">
      <header className="marca">
        Contas a receber
        {totalAberto > 0 && (
          <>
            {" "}
            <span>•</span> R$ {moeda.format(totalAberto)} em aberto
          </>
        )}
      </header>

      <div className="abas">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            className="botao aba"
            data-ativo={filtro === f.valor}
            onClick={() => setFiltro(f.valor)}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      <p className="dica" data-erro={erro} role="status" aria-live="polite">
        {aviso}
      </p>

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : grupos.length === 0 ? (
        <p className="vazio">Nada por aqui.</p>
      ) : (
        grupos.map((g) => (
          <section className="cartao" key={g.clienteId}>
            <h2 className="titulo-cartao">
              {g.nome}
              {g.aberto > 0 && <span className="sub"> · deve R$ {moeda.format(g.aberto)}</span>}
            </h2>

            <ul className="lista">
              {g.lancamentos.map((l) => (
                <li key={l.id}>
                  <span className="rotulo-item">
                    {l.descricao || "Fiado"}
                    <span className="sub">
                      {data.format(new Date(l.criado_em))}
                      {l.pago && l.pago_em ? ` · pago em ${data.format(new Date(l.pago_em))}` : ""}
                    </span>
                  </span>
                  <span className="preco">R$ {moeda.format(Number(l.valor))}</span>
                  {!l.pago && (
                    <button className="botao mini" onClick={() => marcarPago(l.id)}>
                      Marcar pago
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {g.aberto > 0 && (
              <div className="acoes">
                <button className="botao neutro" onClick={() => quitarCliente(g.clienteId, g.nome)}>
                  Quitar tudo — R$ {moeda.format(g.aberto)}
                </button>
              </div>
            )}
          </section>
        ))
      )}
    </main>
  );
}
