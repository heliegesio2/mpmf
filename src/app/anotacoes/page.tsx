"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

type Anotacao = {
  id: number;
  texto: string;
  data_alerta: string | null;
  concluida: boolean;
  criado_em: string;
};

const FILTROS = [
  { valor: "abertas", rotulo: "Abertas" },
  { valor: "concluidas", rotulo: "Concluídas" },
  { valor: "todas", rotulo: "Todas" },
];

function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA");
}
/** classificação do alerta: 'atrasado' | 'hoje' | 'futuro' | null */
function sinalAlerta(iso: string | null): "atrasado" | "hoje" | "futuro" | null {
  if (!iso) return null;
  const hoje = hojeISO();
  if (iso < hoje) return "atrasado";
  if (iso === hoje) return "hoje";
  return "futuro";
}

export default function Anotacoes() {
  const [itens, setItens] = useState<Anotacao[]>([]);
  const [filtro, setFiltro] = useState("abertas");
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [dataAlerta, setDataAlerta] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const { ouvir, parar, ouvindoCampo, disponivel } = useVoz({
    aoFinalizar: (fala) => {
      setTexto((t) => (t.trim() ? `${t.trim()} ${capitalizar(fala)}` : capitalizar(fala)));
      setErro(false);
      setAviso("");
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  const carregar = useCallback(async (situacao: string) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/anotacoes?situacao=${situacao}`);
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setItens(dados.itens);
    } catch {
      setErro(true);
      setAviso("Não foi possível carregar as anotações.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar(filtro);
  }, [filtro, carregar]);

  async function salvar() {
    if (texto.trim().length < 2) return;
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/anotacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: texto.trim(), dataAlerta: dataAlerta || undefined }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");
      setAviso("Anotação salva.");
      setTexto("");
      setDataAlerta("");
      setFiltro("abertas");
      await carregar("abertas");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarConcluida(a: Anotacao) {
    try {
      const r = await fetch(`/api/anotacoes/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concluida: !a.concluida }),
      });
      if (!r.ok) throw new Error();
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível salvar.");
    }
  }

  async function mudarAlerta(a: Anotacao, iso: string) {
    try {
      const r = await fetch(`/api/anotacoes/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataAlerta: iso || null }),
      });
      if (!r.ok) throw new Error();
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível salvar.");
    }
  }

  async function excluir(a: Anotacao) {
    if (!confirm("Excluir esta anotação? Essa ação não tem volta.")) return;
    try {
      const r = await fetch(`/api/anotacoes/${a.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível excluir.");
    }
  }

  return (
    <main className="tela">
      <header className="marca">
        Anotações <span>•</span> {itens.length} na lista
      </header>

      <section className="cartao">
        <h2 className="titulo-cartao">Nova anotação</h2>

        <div className="campo-anotacao">
          <textarea
            ref={areaRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: pedir mais gelo pro fornecedor; pagar o aluguel dia 5…"
            rows={3}
          />
          <button
            type="button"
            className="microfone"
            data-ouvindo={ouvindoCampo === "texto"}
            disabled={!disponivel}
            onClick={() => (ouvindoCampo === "texto" ? parar() : ouvir("texto"))}
            aria-label="Falar a anotação"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="grade-form">
          <label className="rotulo">
            Me alertar em (opcional)
            <span className="entrada">
              <input
                type="date"
                value={dataAlerta}
                min={hojeISO()}
                onChange={(e) => setDataAlerta(e.target.value)}
              />
            </span>
          </label>
        </div>

        <div className="acoes">
          <button
            className="botao primario"
            onClick={salvar}
            disabled={salvando || texto.trim().length < 2}
          >
            {salvando ? "Salvando…" : "Salvar anotação"}
          </button>
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>

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

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">Nenhuma anotação aqui.</p>
      ) : (
        <ul className="lista">
          {itens.map((a) => {
            const sinal = a.concluida ? null : sinalAlerta(a.data_alerta);
            return (
              <li key={a.id} className="anotacao" data-concluida={a.concluida} data-sinal={sinal ?? ""}>
                <label className="anotacao-check">
                  <input
                    type="checkbox"
                    checked={a.concluida}
                    onChange={() => alternarConcluida(a)}
                    aria-label="Concluir"
                  />
                </label>

                <span className="rotulo-item">
                  <span className="anotacao-texto">{a.texto}</span>
                  <span className="sub anotacao-rodape">
                    {(sinal === "atrasado" || sinal === "hoje") && (
                      <span className="anotacao-alerta" data-sinal={sinal}>
                        {sinal === "atrasado" ? "⏰ atrasado" : "⏰ hoje"}
                      </span>
                    )}
                    <label>
                      alerta:{" "}
                      <input
                        type="date"
                        className="anotacao-data"
                        value={a.data_alerta ?? ""}
                        onChange={(e) => mudarAlerta(a, e.target.value)}
                        aria-label="Data do alerta"
                      />
                    </label>
                  </span>
                </span>

                <button className="botao mini perigo" onClick={() => excluir(a)}>
                  Excluir
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
