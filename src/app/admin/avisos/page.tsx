"use client";

import { useEffect, useRef, useState } from "react";
import CampoFoto from "@/components/CampoFoto";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

type EmpresaResumo = { id: number; nome: string };

function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

export default function EnviarNotificacao() {
  const [texto, setTexto] = useState("");
  const [foto, setFoto] = useState("");
  const [paraTodos, setParaTodos] = useState(true);
  const [buscaLoja, setBuscaLoja] = useState("");
  const [opcoesLoja, setOpcoesLoja] = useState<EmpresaResumo[]>([]);
  const [lojaEscolhida, setLojaEscolhida] = useState<EmpresaResumo | null>(null);
  const [enviarAgora, setEnviarAgora] = useState(true);
  const [dataEnvio, setDataEnvio] = useState(hojeISO());
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

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

  useEffect(() => {
    if (paraTodos || lojaEscolhida) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          `/api/empresas?situacao=aprovada&q=${encodeURIComponent(buscaLoja)}`
        );
        const d = await r.json();
        setOpcoesLoja(r.ok ? (d.itens ?? []).slice(0, 8) : []);
      } catch {
        setOpcoesLoja([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [buscaLoja, paraTodos, lojaEscolhida]);

  async function enviar() {
    if (texto.trim().length < 2) return;
    if (!paraTodos && !lojaEscolhida) {
      setErro(true);
      setAviso("Escolha a loja, ou marque \"enviar para todos os clientes\".");
      return;
    }
    setEnviando(true);
    setErro(false);
    setAviso("");
    try {
      const r = await fetch("/api/admin/avisos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: texto.trim(),
          foto: foto || undefined,
          empresaId: paraTodos ? null : lojaEscolhida!.id,
          imediato: enviarAgora,
          dataEnvio: enviarAgora ? undefined : dataEnvio,
        }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível enviar.");
      setAviso(
        `Enviado para ${dados.totalLojas} loja(s)${
          enviarAgora ? " agora" : ` — vai aparecer em ${dataEnvio.split("-").reverse().join("/")}`
        }.`
      );
      setTexto("");
      setFoto("");
      setLojaEscolhida(null);
      setBuscaLoja("");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="tela">
      <header className="marca">Enviar notificação</header>

      <section className="cartao">
        <h2 className="titulo-cartao">Mensagem</h2>
        <p className="ajuda-voz">
          Pode ser texto simples ou um bloco de HTML (negrito, link, lista…) — a loja recebe
          renderizado.
        </p>
        <div className="campo-anotacao">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: Nova funcionalidade liberada: comércios grandes já lê preço por PDF…"
            rows={4}
          />
          <button
            type="button"
            className="microfone"
            data-ouvindo={ouvindoCampo === "texto"}
            disabled={!disponivel}
            onClick={() => (ouvindoCampo === "texto" ? parar() : ouvir("texto"))}
            aria-label="Falar a notificação"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="rotulo" style={{ marginTop: 12 }}>
          <CampoFoto
            rotulo="Imagem (opcional)"
            semCaptura
            preview={foto}
            aoEscolher={setFoto}
            aoRemover={foto ? () => setFoto("") : undefined}
            aoErro={(m) => {
              setErro(true);
              setAviso(m);
            }}
          />
        </div>
      </section>

      <section className="cartao">
        <h2 className="titulo-cartao">Quem recebe</h2>
        <label className="rotulo largo">
          <input
            type="checkbox"
            checked={paraTodos}
            onChange={(e) => {
              setParaTodos(e.target.checked);
              if (e.target.checked) setLojaEscolhida(null);
            }}
          />{" "}
          Enviar para todos os clientes
        </label>

        {!paraTodos && (
          <div style={{ marginTop: 10 }}>
            {lojaEscolhida ? (
              <p className="dica">
                Loja escolhida: <strong>{lojaEscolhida.nome}</strong>{" "}
                <button
                  type="button"
                  className="botao mini neutro"
                  onClick={() => setLojaEscolhida(null)}
                >
                  Trocar
                </button>
              </p>
            ) : (
              <>
                <label className="rotulo largo">
                  Buscar a loja
                  <span className="entrada">
                    <input
                      value={buscaLoja}
                      onChange={(e) => setBuscaLoja(e.target.value)}
                      placeholder="Nome da loja…"
                    />
                  </span>
                </label>
                {opcoesLoja.length > 0 && (
                  <ul className="lista" style={{ marginTop: 8 }}>
                    {opcoesLoja.map((e) => (
                      <li
                        key={e.id}
                        className="lista-clicavel"
                        role="button"
                        tabIndex={0}
                        onClick={() => setLojaEscolhida(e)}
                        onKeyDown={(ev) => ev.key === "Enter" && setLojaEscolhida(e)}
                      >
                        <span className="rotulo-item">{e.nome}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </section>

      <section className="cartao">
        <h2 className="titulo-cartao">Quando</h2>
        <label className="rotulo largo">
          <input
            type="checkbox"
            checked={enviarAgora}
            onChange={(e) => setEnviarAgora(e.target.checked)}
          />{" "}
          Aviso imediato
        </label>
        {!enviarAgora && (
          <label className="rotulo" style={{ maxWidth: 220, marginTop: 10 }}>
            Data do aviso
            <span className="entrada">
              <input
                type="date"
                value={dataEnvio}
                min={hojeISO()}
                onChange={(e) => setDataEnvio(e.target.value)}
              />
            </span>
          </label>
        )}
      </section>

      <div className="acoes">
        <button
          className="botao primario"
          onClick={enviar}
          disabled={enviando || texto.trim().length < 2}
        >
          {enviando ? "Enviando…" : "Enviar notificação"}
        </button>
      </div>

      <p className="dica" data-erro={erro} role="status" aria-live="polite">
        {aviso}
      </p>
    </main>
  );
}
