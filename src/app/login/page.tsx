"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function Formulario() {
  const router = useRouter();
  const de = useSearchParams().get("de");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  async function entrar() {
    setEntrando(true);
    setErro("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, senha }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível entrar.");

      router.replace(dados.destino === "/" ? de || "/" : dados.destino);
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível entrar.");
      setEntrando(false);
    }
  }

  return (
    <main className="tela-login">
      <section className="cartao-login">
        <div className="menu-marca">
          Mercadinho
          <span>balcão</span>
        </div>

        <h1 className="titulo-cartao">Entrar</h1>

        <label className="rotulo largo">
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
            autoComplete="username"
            placeholder="voce@empresa.com"
          />
        </label>

        <label className="rotulo largo">
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
            autoComplete="current-password"
            placeholder="••••••••"
          />
        </label>

        {erro && <p className="dica" data-erro="true">{erro}</p>}

        <button className="botao primario grande" onClick={entrar} disabled={entrando}>
          {entrando ? "Entrando…" : "Entrar"}
        </button>

        <p className="rodape-login">
          Ainda não tem conta? <Link href="/cadastro">Cadastre sua empresa</Link>
        </p>
      </section>
    </main>
  );
}

export default function Login() {
  return (
    <Suspense fallback={<main className="tela-login"><p className="vazio">Carregando…</p></main>}>
      <Formulario />
    </Suspense>
  );
}
