"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import BotoesSociais from "@/components/BotoesSociais";
import Logo from "@/components/Logo";

const ERROS_OAUTH: Record<string, string> = {
  "provedor-nao-configurado": "Esse login social ainda não está configurado.",
  "provedor-invalido": "Provedor de login inválido.",
  "acesso-negado": "Você cancelou o acesso.",
  "sessao-expirada": "A tentativa de login expirou. Tente de novo.",
  "falha-no-provedor": "O Google/Facebook não respondeu. Tente de novo.",
};

type Aba = "empresa" | "fornecedor";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const de = params.get("de");
  const erroUrl = params.get("erro");
  const [aba, setAba] = useState<Aba>("empresa");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(
    erroUrl ? ERROS_OAUTH[erroUrl] ?? decodeURIComponent(erroUrl) : ""
  );
  const [entrando, setEntrando] = useState(false);
  const ehFornecedor = aba === "fornecedor";

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
        <Logo className="grande logo-login" />

        <h1 className="titulo-cartao">Entrar</h1>

        <div className="abas-cadastro" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={aba === "empresa"}
            className="aba-cadastro"
            data-ativo={aba === "empresa"}
            onClick={() => { setAba("empresa"); setErro(""); }}
          >
            Empresa
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={aba === "fornecedor"}
            className="aba-cadastro"
            data-ativo={aba === "fornecedor"}
            onClick={() => { setAba("fornecedor"); setErro(""); }}
          >
            Fornecedor
          </button>
        </div>
        <p className="dica">
          {ehFornecedor
            ? "Entre com o e-mail e a senha do seu cadastro de fornecedor."
            : "Entre com o e-mail e a senha da sua loja."}
        </p>

        <label className="rotulo largo">
          E-mail
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && entrar()}
            autoComplete="username"
            placeholder={ehFornecedor ? "voce@fornecedor.com" : "voce@empresa.com"}
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

        {!ehFornecedor && <BotoesSociais rotulo="Entrar" />}

        <p className="rodape-login">
          {ehFornecedor ? (
            <>Ainda não é cadastrado? <Link href="/cadastro?tipo=fornecedor">Cadastre-se como fornecedor</Link></>
          ) : (
            <>Ainda não tem conta? <Link href="/cadastro">Cadastre sua empresa</Link></>
          )}
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
