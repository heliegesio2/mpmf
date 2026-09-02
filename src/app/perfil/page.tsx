"use client";

import { useEffect, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

export default function Perfil() {
  const [nome, setNome] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  const { ouvir, parar, ouvindoCampo, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      setNome(capitalizar(texto));
      setErro(false);
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/auth/sessao");
        const d = await r.json();
        setNome(d.sessao?.nome ?? "");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/auth/perfil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não foi possível salvar.");
      setAviso("Nome atualizado.");
      // o nome aparece no menu a partir do token da sessão — recarrega pra refletir
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="tela">
      <header className="marca">Meu perfil</header>

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : (
        <section className="cartao">
          <h2 className="titulo-cartao">Nome</h2>
          <p className="ajuda-voz" data-erro={!disponivel}>
            É o nome que aparece no menu e nas telas. Toque no microfone e fale, ou digite.
          </p>
          <div className="grade-form">
            <CampoVoz
              rotulo="Seu nome"
              placeholder="Como você quer ser chamado"
              largo
              campo="nome"
              valor={nome}
              aoMudar={setNome}
              ouvindo={ouvindoCampo === "nome"}
              temVoz={disponivel}
              aoOuvir={ouvir}
              aoParar={parar}
            />
          </div>
          <div className="acoes">
            <button
              className="botao primario"
              onClick={salvar}
              disabled={salvando || nome.trim().length < 2}
            >
              {salvando ? "Salvando…" : "Salvar nome"}
            </button>
          </div>
          <p className="dica" data-erro={erro} role="status" aria-live="polite">
            {aviso}
          </p>
        </section>
      )}
    </main>
  );
}
