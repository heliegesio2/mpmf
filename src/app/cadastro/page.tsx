"use client";

import { useState } from "react";
import Link from "next/link";

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

export default function Cadastro() {
  const [form, setForm] = useState<Form>(VAZIO);
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const campo = (k: keyof Form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm({ ...form, [k]: e.target.value }),
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
            Sua empresa entrou na fila de aprovação. Assim que for liberada, você
            poderá entrar com o e-mail e a senha que acabou de cadastrar.
          </p>
          <Link className="botao primario grande" href="/login">
            Voltar para o login
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="tela-login">
      <section className="cartao-login largo">
        <h1 className="titulo-cartao">Cadastrar empresa</h1>

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

          <label className="rotulo">
            E-mail de acesso
            <input {...campo("email")} type="email" placeholder="voce@empresa.com" />
          </label>

          <label className="rotulo">
            Senha
            <input {...campo("senha")} type="password" placeholder="mínimo 8 caracteres" />
          </label>
        </div>

        {erro && <p className="dica" data-erro="true">{erro}</p>}

        <button className="botao primario grande" onClick={enviar} disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar cadastro"}
        </button>

        <p className="rodape-login">
          Já tem conta? <Link href="/login">Entrar</Link>
        </p>
      </section>
    </main>
  );
}
