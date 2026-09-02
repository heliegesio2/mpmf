"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SeletorCliente, { type ClienteLite } from "@/components/SeletorCliente";
import { CampoVoz } from "@/components/CampoVoz";
import { useVoz } from "@/lib/useVoz";
import { mascararMoeda, moedaParaNumero, paraMoeda } from "@/lib/moeda";
import { capitalizar, numeroFalado } from "@/lib/voz";

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
  const [filtro, setFiltro] = useState("todas");
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  // nova conta a receber
  const [novaAberta, setNovaAberta] = useState(false);
  const [cliente, setCliente] = useState<ClienteLite | null>(null);
  const [valor, setValor] = useState("");
  const [descricao, setDescricao] = useState("");
  const [salvando, setSalvando] = useState(false);

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      if (campoAtual.current === "valor") {
        const n = numeroFalado(texto);
        if (n !== null) setValor(paraMoeda(n));
      } else if (campoAtual.current === "descricao") {
        setDescricao(capitalizar(texto));
      }
    },
    aoErrar: () => {},
  });

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

  async function salvarNova() {
    if (!cliente || moedaParaNumero(valor) <= 0) {
      setErro(true);
      setAviso("Escolha o cliente e informe o valor.");
      return;
    }
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/fiado", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clienteId: cliente.id,
          valor: moedaParaNumero(valor),
          descricao: descricao || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — ") || "Não foi possível salvar.");
      }
      setAviso("Conta a receber lançada.");
      setCliente(null);
      setValor("");
      setDescricao("");
      setNovaAberta(false);
      await carregar(filtro);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
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

      <div className="acoes">
        <button
          type="button"
          className="botao primario"
          onClick={() => setNovaAberta((v) => !v)}
        >
          {novaAberta ? "Fechar" : "+ Nova conta a receber"}
        </button>
      </div>

      {novaAberta && (
        <section className="cartao">
          <h2 className="titulo-cartao">Nova conta a receber (fiado)</h2>
          <div className="grade-form">
            <SeletorCliente valor={cliente} aoEscolher={setCliente} />
            <CampoVoz
              rotulo="Valor"
              placeholder="0,00"
              campo="valor"
              valor={valor}
              aoMudar={(v) => setValor(mascararMoeda(v))}
              ouvindo={ouvindoCampo === "valor"}
              temVoz={disponivel}
              aoOuvir={ouvir}
              aoParar={parar}
            />
            <CampoVoz
              rotulo="Descrição"
              placeholder="Compras da semana, marmita…"
              largo
              campo="descricao"
              valor={descricao}
              aoMudar={setDescricao}
              ouvindo={ouvindoCampo === "descricao"}
              temVoz={disponivel}
              aoOuvir={ouvir}
              aoParar={parar}
            />
          </div>
          <div className="acoes">
            <button
              className="botao primario"
              onClick={salvarNova}
              disabled={salvando || !cliente || moedaParaNumero(valor) <= 0}
            >
              {salvando ? "Salvando…" : "Lançar conta a receber"}
            </button>
          </div>
        </section>
      )}

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
