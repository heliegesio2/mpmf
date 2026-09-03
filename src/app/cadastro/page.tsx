"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import BotoesSociais from "@/components/BotoesSociais";
import Logo from "@/components/Logo";
import { CampoVoz } from "@/components/CampoVoz";
import CampoTelefone from "@/components/CampoTelefone";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

type Tipo = "empresa" | "fornecedor";

type Form = {
  nome: string;
  documento: string;
  telefone: string;
  telefoneWhatsapp: boolean;
  cidade: string;
  horario: string;
  endereco: string;
  observacao: string;
  pixChave: string;
  pixNome: string;
  responsavel: string;
  email: string;
  senha: string;
};

const VAZIO: Form = {
  nome: "",
  documento: "",
  telefone: "",
  telefoneWhatsapp: false,
  cidade: "",
  horario: "",
  endereco: "",
  observacao: "",
  pixChave: "",
  pixNome: "",
  responsavel: "",
  email: "",
  senha: "",
};

const CIDADE_PADRAO = "Conselheiro Lafaiete";
type Bairro = { id: number; nome: string };

type Social = { email: string; nome: string; provedor: "google" | "facebook" } | null;

function Conteudo() {
  const modoSocial = useSearchParams().get("social") === "1";
  const [tipo, setTipo] = useState<Tipo>("empresa");
  const [form, setForm] = useState<Form>({ ...VAZIO, cidade: "" });
  const [social, setSocial] = useState<Social>(null);
  const [carregandoSocial, setCarregandoSocial] = useState(modoSocial);
  const [erro, setErro] = useState("");
  const [enviado, setEnviado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  // bairros (só no cadastro de fornecedor)
  const [bairros, setBairros] = useState<Bairro[]>([]);
  const [bairrosSel, setBairrosSel] = useState<Set<number>>(new Set());

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const campo = campoAtual.current as keyof Form | null;
      if (!campo) return;
      const soDigitos = campo === "documento" || campo === "telefone";
      const cru = campo === "pixChave" || campo === "horario";
      setForm((f) => ({
        ...f,
        [campo]: soDigitos ? texto.replace(/\D/g, "") : cru ? texto : capitalizar(texto),
      }));
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

  useEffect(() => {
    if (tipo !== "fornecedor" || bairros.length > 0) return;
    fetch(`/api/bairros?cidade=${encodeURIComponent(CIDADE_PADRAO)}`)
      .then((r) => r.json())
      .then((d) => setBairros(d.itens ?? []))
      .catch(() => setBairros([]));
  }, [tipo, bairros.length]);

  const comum = (k: keyof Form) => ({
    campo: k as string,
    valor: String(form[k]),
    aoMudar: (v: string) => setForm((f) => ({ ...f, [k]: v })),
    ouvindo: ouvindoCampo === k,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  const campo = (k: keyof Form) => ({
    value: String(form[k]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }),
  });

  function alternarBairro(id: number) {
    setBairrosSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
    setErro("");
  }

  async function enviar() {
    setEnviando(true);
    setErro("");
    try {
      if (tipo === "fornecedor") {
        const r = await fetch("/api/fornecedores/cadastro", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nome: form.nome,
            documento: form.documento,
            telefone: form.telefone,
            telefoneWhatsapp: form.telefoneWhatsapp,
            endereco: form.endereco,
            observacao: form.observacao,
            pixChave: form.pixChave,
            email: form.email,
            senha: form.senha,
            cidade: form.cidade || CIDADE_PADRAO,
            bairroIds: [...bairrosSel],
          }),
        });
        const dados = await r.json();
        if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível cadastrar.");
        setEnviado(true);
        return;
      }

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
            {tipo === "fornecedor"
              ? "Seu cadastro de fornecedor entrou na fila de aprovação. Assim que for liberado, você poderá entrar com o e-mail e a senha que acabou de cadastrar."
              : social
                ? `Sua empresa entrou na fila de aprovação. Assim que for liberada, você poderá entrar com o ${social.provedor === "google" ? "Google" : "Facebook"}.`
                : "Sua empresa entrou na fila de aprovação. Assim que for liberada, você poderá entrar com o e-mail e a senha que acabou de cadastrar."}
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

  const ehFornecedor = tipo === "fornecedor";

  return (
    <main className="tela-login">
      <section className="cartao-login largo">
        <Logo className="grande logo-login" />
        <h1 className="titulo-cartao">
          {ehFornecedor ? "Cadastrar fornecedor" : "Cadastrar empresa"}
        </h1>

        {!social && (
          <>
            <div className="abas-cadastro" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tipo === "empresa"}
                className="aba-cadastro"
                data-ativo={tipo === "empresa"}
                onClick={() => { setTipo("empresa"); setErro(""); }}
              >
                Empresa
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tipo === "fornecedor"}
                className="aba-cadastro"
                data-ativo={tipo === "fornecedor"}
                onClick={() => { setTipo("fornecedor"); setErro(""); }}
              >
                Fornecedor
              </button>
            </div>
            <p className="dica">
              {ehFornecedor
                ? "Você abastece as lojas — informe os bairros que atende."
                : "Mercadinho / loja que vai usar o PDV."}
            </p>
          </>
        )}

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
          <CampoVoz
            rotulo={ehFornecedor ? "Nome / razão social" : "Nome da empresa"}
            placeholder={ehFornecedor ? "Distribuidora do Zé" : "Mercadinho do Bairro"}
            largo
            {...comum("nome")}
          />
          <CampoVoz rotulo="CNPJ ou CPF" placeholder="Só números" numerico {...comum("documento")} />
          <CampoTelefone
            rotulo="Telefone"
            {...comum("telefone")}
            ehWhatsapp={form.telefoneWhatsapp}
            aoMudarWhatsapp={(v) => setForm((f) => ({ ...f, telefoneWhatsapp: v }))}
          />

          {ehFornecedor ? (
            <>
              <CampoVoz rotulo="Endereço" placeholder="Rua, número, bairro" largo {...comum("endereco")} />
              <CampoVoz rotulo="Cidade que atende" placeholder={CIDADE_PADRAO} largo {...comum("cidade")} />
              <CampoVoz
                rotulo="Chave Pix (opcional)"
                placeholder="CPF/CNPJ, celular, e-mail ou aleatória"
                largo
                {...comum("pixChave")}
              />
              <CampoVoz
                rotulo="Observação (opcional)"
                placeholder="Dias de entrega, pedido mínimo…"
                largo
                {...comum("observacao")}
              />

              <div className="rotulo largo">
                <span className="campo-foto-rotulo">Bairros que você atende</span>
                {bairros.length === 0 ? (
                  <p className="dica">Carregando bairros de {form.cidade || CIDADE_PADRAO}…</p>
                ) : (
                  <div className="bairros-grade">
                    {bairros.map((b) => (
                      <label key={b.id} className="bairro-opcao" data-ativo={bairrosSel.has(b.id)}>
                        <input
                          type="checkbox"
                          checked={bairrosSel.has(b.id)}
                          onChange={() => alternarBairro(b.id)}
                        />
                        {b.nome}
                      </label>
                    ))}
                  </div>
                )}
                <p className="dica">{bairrosSel.size} bairro(s) selecionado(s)</p>
              </div>
            </>
          ) : (
            <>
              <CampoVoz rotulo="Cidade" placeholder="São Paulo" largo {...comum("cidade")} />
              <CampoVoz
                rotulo="Horário de funcionamento"
                placeholder="Seg a sáb, 7h às 20h"
                largo
                {...comum("horario")}
              />
              <CampoVoz rotulo="Chave Pix" placeholder="CPF/CNPJ, celular, e-mail ou aleatória" largo {...comum("pixChave")} />
              <CampoVoz rotulo="Nome do recebedor no Pix" placeholder="Como aparece pra quem paga" largo {...comum("pixNome")} />
              <CampoVoz rotulo="Responsável" placeholder="Seu nome" largo {...comum("responsavel")} />
            </>
          )}

          {!social && (
            <>
              <label className="rotulo">
                E-mail de acesso
                <input {...campo("email")} type="email" placeholder="voce@exemplo.com" />
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

        {!social && !ehFornecedor && <BotoesSociais rotulo="Cadastrar" />}

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
