"use client";

import { useEffect, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import CampoFoto from "@/components/CampoFoto";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

export default function Perfil() {
  const [nome, setNome] = useState("");
  // "" sem foto; um data URL foto nova; "/api/auth/foto" a foto que já está salva
  const [foto, setFoto] = useState("");
  const [fotoMexida, setFotoMexida] = useState(false);
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
        const r = await fetch("/api/auth/perfil");
        const d = await r.json();
        setNome(d.nome ?? "");
        if (d.temFoto) setFoto(`/api/auth/foto?v=${Date.now()}`);
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const corpo: { nome: string; foto?: string } = { nome };
      if (fotoMexida) corpo.foto = foto.startsWith("data:image/") ? foto : "";

      const r = await fetch("/api/auth/perfil", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não foi possível salvar.");
      setAviso("Perfil atualizado.");
      // nome e foto aparecem no menu — recarrega pra refletir
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
          <p className="ajuda-voz" data-erro={!disponivel}>
            Nome e foto aparecem no menu de conta (canto superior direito).
          </p>
          <div className="grade-form">
            <div className="rotulo largo">
              <CampoFoto
                rotulo="Sua foto"
                preview={foto}
                aoEscolher={(d) => {
                  setFoto(d);
                  setFotoMexida(true);
                  setErro(false);
                }}
                aoRemover={
                  foto
                    ? () => {
                        setFoto("");
                        setFotoMexida(true);
                      }
                    : undefined
                }
                aoErro={(m) => {
                  setErro(true);
                  setAviso(m);
                }}
              />
            </div>

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
              {salvando ? "Salvando…" : "Salvar perfil"}
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
