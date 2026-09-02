"use client";

import { useEffect, useState } from "react";

export default function TrocarSenha() {
  const [temSenha, setTemSenha] = useState<boolean | null>(null);
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  useEffect(() => {
    fetch("/api/auth/senha")
      .then((r) => r.json())
      .then((d) => setTemSenha(Boolean(d.temSenha)))
      .catch(() => setTemSenha(true));
  }, []);

  async function salvar() {
    setErro(false);
    if (nova !== confirma) {
      setErro(true);
      setAviso("A confirmação não bate com a nova senha.");
      return;
    }
    setSalvando(true);
    try {
      const r = await fetch("/api/auth/senha", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atual, nova }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não foi possível salvar.");
      setAviso("Senha alterada.");
      setAtual("");
      setNova("");
      setConfirma("");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="tela">
      <header className="marca">Trocar senha</header>

      {temSenha === null ? (
        <p className="vazio">Carregando…</p>
      ) : !temSenha ? (
        <section className="cartao">
          <p className="dica">
            Esta conta entra pelo Google ou Facebook e não usa senha. Para trocar,
            use a conta do provedor.
          </p>
        </section>
      ) : (
        <section className="cartao">
          <h2 className="titulo-cartao">Nova senha</h2>
          <div className="grade-form">
            <label className="rotulo largo">
              Senha atual
              <input
                type="password"
                value={atual}
                onChange={(e) => setAtual(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label className="rotulo largo">
              Nova senha (mínimo 8 caracteres)
              <input
                type="password"
                value={nova}
                onChange={(e) => setNova(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="rotulo largo">
              Repita a nova senha
              <input
                type="password"
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                autoComplete="new-password"
              />
            </label>
          </div>
          <div className="acoes">
            <button
              className="botao primario"
              onClick={salvar}
              disabled={salvando || !atual || nova.length < 8 || !confirma}
            >
              {salvando ? "Salvando…" : "Trocar senha"}
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
