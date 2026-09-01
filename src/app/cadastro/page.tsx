"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import BotoesSociais from "@/components/BotoesSociais";

type Form = {
  nome: string;
  documento: string;
  telefone: string;
  cidade: string;
  responsavel: string;
  email: string;
  senha: string;
};

const VAZIO: Form = {
  nome: "",
  documento: "",
  telefone: "",
  cidade: "",
  responsavel: "",
  email: "",
  senha: "",
};

type Social = { email: string; nome: string; provedor: "google" | "facebook" } | null;

function Conteudo() {
  const modoSocial = useSearchParams().get("social") === "1";
  const [form, setForm] = useState<Form>(VAZIO);
  const [social, setSocial] = useState<Social>(null);
  const [carregandoSocial, setCarregandoSocial] = useState(modoSocial);
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!modoSocial) return;
    (async () => {
      try {
        const r = await fetch("/api/auth/social/pendente");
        const d = await r.json();
        if (d.pendente) {
          setSocial(d.pendente);
          setForm((f) => ({ ...f, responsavel: d.pendente.nome, email: d.pendente.email }));
        }
      } catch {
        /* trata como expirado */
      } finally {
        setCarregandoSocial(false);
      }
    })();
  }, [modoSocial]);

  const campo = (k: keyof Form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  async function enviar() {
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch("/api/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível cadastrar.");
      setEnviado(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível cadastrar.");
    } finally {
      setEnviando(false);
    }
  }

  if (enviado) {
    return (
      <main className="tela-login">
        <section className="cartao-login">
          <h1 className="titulo-cartao">Cadastro enviado</h1>
          <p className="pix-status">
            Sua empresa entrou na fila de aprovação. Assim que for liberada, você poderá entrar
            {social ? ` com o ${social.provedor === "google" ? "Google" : "Facebook"}.` : " com o e-mail e a senha que acabou de cadastrar."}
          </p>
          <Link className="botao primario grande" href="/login">
            Voltar para o login
          </Link>
        </section>
      </main>
    );
  }

  if (modoSocial && !carregandoSocial && !social) {
    return (
      <main className="tela-login">
        <section className="cartao-login">
          <h1 className="titulo-cartao">Sessão expirada</h1>
          <p className="pix-status">A confirmação do login social expirou. Tente de novo.</p>
          <BotoesSociais rotulo="Continuar" />
          <p className="rodape-login">
            <Link href="/login">Voltar para o login</Link>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="tela-login">
      <section className="cartao-login largo">
        <h1 className="titulo-cartao">Cadastrar empresa</h1>

        {social && (
          <p className="dica">
            Você vai entrar com <strong>{social.provedor === "google" ? "Google" : "Facebook"}</strong> ({social.email}).
            Complete os dados da loja abaixo.
          </p>
        )}

        <div className="grade-form">
          <label className="rotulo largo">
            Nome da empresa
            <input {...campo("nome")} placeholder="Mercadinho do Bairro" />
          </label>

          <label className="rotulo">
            CNPJ ou CPF
            <input {...campo("documento")} inputMode="numeric" placeholder="Só números" />
          </label>

          <label className="rotulo">
            Telefone
            <input {...campo("telefone")} inputMode="tel" placeholder="11989902144" />
          </label>

          <label className="rotulo largo">
            Cidade
            <input {...campo("cidade")} placeholder="São Paulo" />
          </label>

          <label className="rotulo largo">
            Responsável
            <input {...campo("responsavel")} placeholder="Seu nome" />
          </label>

          {!social && (
            <>
              <label className="rotulo">
                E-mail de acesso
                <input {...campo("email")} type="email" placeholder="voce@empresa.com" />
              </label>

              <label className="rotulo">
                Senha
                <input {...campo("senha")} type="password" placeholder="mínimo 8 caracteres" />
              </label>
            </>
          )}
        </div>

        {erro && <p className="dica" data-erro="true">{erro}</p>}

        <button className="botao primario grande" onClick={enviar} disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar cadastro"}
        </button>

        {!social && <BotoesSociais rotulo="Cadastrar" />}

        <p className="rodape-login">
          Já tem conta? <Link href="/login">Entrar</Link>
        </p>
      </section>
    </main>
  );
}

export default function Cadastro() {
  return (
    <Suspense fallback={<main className="tela-login"><p className="vazio">Carregando…</p></main>}>
      <Conteudo />
    </Suspense>
  );
}
