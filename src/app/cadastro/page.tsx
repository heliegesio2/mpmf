"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import BotoesSociais from "@/components/BotoesSociais";
import { CampoVoz } from "@/components/CampoVoz";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

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

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const campo = campoAtual.current as keyof Form | null;
      if (!campo) return;
      const soDigitos = campo === "documento" || campo === "telefone";
      setForm((f) => ({ ...f, [campo]: soDigitos ? texto.replace(/\D/g, "") : capitalizar(texto) }));
      setErro("");
    },
    aoErrar: (m) => setErro(m),
  });

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

  const comum = (k: keyof Form) => ({
    campo: k as string,
    valor: form[k],
    aoMudar: (v: string) => setForm((f) => ({ ...f, [k]: v })),
    ouvindo: ouvindoCampo === k,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

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

        <p className="ajuda-voz" data-erro={!disponivel}>
          {disponivel
            ? "Toque no microfone do campo e fale."
            : "Este navegador não reconhece fala. Abra no Chrome ou no Edge para usar os microfones."}
        </p>

        <div className="grade-form">
          <CampoVoz rotulo="Nome da empresa" placeholder="Mercadinho do Bairro" largo {...comum("nome")} />
          <CampoVoz rotulo="CNPJ ou CPF" placeholder="Só números" numerico {...comum("documento")} />
          <CampoVoz rotulo="Telefone" placeholder="11989902144" numerico {...comum("telefone")} />
          <CampoVoz rotulo="Cidade" placeholder="São Paulo" largo {...comum("cidade")} />
          <CampoVoz rotulo="Responsável" placeholder="Seu nome" largo {...comum("responsavel")} />

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
