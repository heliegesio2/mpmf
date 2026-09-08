"use client";

import { useEffect, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import CampoTelefone from "@/components/CampoTelefone";
import CampoFoto from "@/components/CampoFoto";
import BotaoCopiar from "@/components/BotaoCopiar";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

type Config = {
  nome: string;
  documento: string;
  telefone: string;
  telefoneWhatsapp: boolean;
  cidade: string;
  bairro: string;
  cep: string;
  endereco: string;
  horario: string;
  pixChave: string;
  pixNome: string;
};

const VAZIO: Config = {
  nome: "",
  documento: "",
  telefone: "",
  telefoneWhatsapp: false,
  cidade: "",
  bairro: "",
  cep: "",
  endereco: "",
  horario: "",
  pixChave: "",
  pixNome: "",
};

export default function Configuracoes() {
  const [form, setForm] = useState<Config>(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [logoPreview, setLogoPreview] = useState("");
  const [salvandoLogo, setSalvandoLogo] = useState(false);
  const [mpConectado, setMpConectado] = useState<boolean | null>(null);
  const [mpAtivo, setMpAtivo] = useState(false);
  const [desconectandoMp, setDesconectandoMp] = useState(false);
  const [salvandoMpAtivo, setSalvandoMpAtivo] = useState(false);

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const campo = campoAtual.current as keyof Config | null;
      if (!campo) return;
      const cru = campo === "telefone" || campo === "cep" || campo === "pixChave" || campo === "documento";
      setForm((f) => ({ ...f, [campo]: cru ? texto : capitalizar(texto) }));
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
        const r = await fetch("/api/empresa");
        const d = await r.json();
        if (!r.ok) throw new Error(d?.erro ?? "Não foi possível carregar.");
        const e = d.item;
        setForm({
          nome: e.nome ?? "",
          documento: e.documento ?? "",
          telefone: e.telefone ?? "",
          telefoneWhatsapp: Boolean(e.telefone_whatsapp),
          cidade: e.cidade ?? "",
          bairro: e.bairro ?? "",
          cep: e.cep ?? "",
          endereco: e.endereco ?? "",
          horario: e.horario ?? "",
          pixChave: e.pix_chave ?? "",
          pixNome: e.pix_nome ?? "",
        });
        if (e.tem_logo) setLogoPreview("/api/empresa/logo");
      } catch (e) {
        setErro(true);
        setAviso(e instanceof Error ? e.message : "Não foi possível carregar.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  useEffect(() => {
    fetch("/api/mercadopago")
      .then((r) => r.json())
      .then((d) => {
        setMpConectado(Boolean(d?.conectado));
        setMpAtivo(Boolean(d?.ativo));
      })
      .catch(() => setMpConectado(false));

    const params = new URLSearchParams(window.location.search);
    if (params.get("mp") === "conectado") {
      setAviso("Mercado Pago conectado — o Pix agora confirma sozinho.");
      setErro(false);
    } else if (params.get("mpErro")) {
      setErro(true);
      setAviso("Não foi possível conectar o Mercado Pago. Tente de novo.");
    }
  }, []);

  async function desconectarMp() {
    if (!confirm("Desconectar o Mercado Pago? O Pix volta a ser confirmado na mão.")) return;
    setDesconectandoMp(true);
    try {
      await fetch("/api/mercadopago", { method: "DELETE" });
      setMpConectado(false);
      setMpAtivo(false);
    } catch {
      setErro(true);
      setAviso("Não foi possível desconectar.");
    } finally {
      setDesconectandoMp(false);
    }
  }

  async function alternarMpAtivo(ativo: boolean) {
    setSalvandoMpAtivo(true);
    setMpAtivo(ativo);
    try {
      await fetch("/api/mercadopago", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ativo }),
      });
    } catch {
      setErro(true);
      setAviso("Não foi possível salvar a escolha do Pix.");
      setMpAtivo(!ativo);
    } finally {
      setSalvandoMpAtivo(false);
    }
  }

  async function mudarLogo(dataUrl: string) {
    setSalvandoLogo(true);
    setErro(false);
    try {
      const r = await fetch("/api/empresa/logo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo: dataUrl }),
      });
      if (!r.ok) throw new Error();
      setLogoPreview(dataUrl);
      setAviso("Logo salva.");
    } catch {
      setErro(true);
      setAviso("Não foi possível salvar a logo.");
    } finally {
      setSalvandoLogo(false);
    }
  }

  async function removerLogo() {
    setSalvandoLogo(true);
    try {
      const r = await fetch("/api/empresa/logo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logo: "" }),
      });
      if (!r.ok) throw new Error();
      setLogoPreview("");
    } catch {
      setErro(true);
      setAviso("Não foi possível remover a logo.");
    } finally {
      setSalvandoLogo(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/empresa", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — ") || "Não foi possível salvar.");
      }
      setAviso("Configurações salvas.");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const comum = (k: keyof Config) => ({
    campo: k as string,
    valor: String(form[k]),
    aoMudar: (v: string) => setForm((f) => ({ ...f, [k]: v })),
    ouvindo: ouvindoCampo === k,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  return (
    <main className="tela">
      <header className="marca">Configurações da empresa</header>

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : (
        <>
          <section className="cartao">
            <h2 className="titulo-cartao">Dados da empresa</h2>
            <div className="grade-form">
              <CampoVoz rotulo="Nome" placeholder="Mercado Mãe e Filho" largo {...comum("nome")} />
              <CampoVoz rotulo="CNPJ" placeholder="00.000.000/0000-00" {...comum("documento")} />
              <CampoTelefone
                rotulo="Telefone"
                {...comum("telefone")}
                ehWhatsapp={form.telefoneWhatsapp}
                aoMudarWhatsapp={(v) => setForm((f) => ({ ...f, telefoneWhatsapp: v }))}
              />
              <CampoVoz rotulo="Cidade" placeholder="São Paulo" {...comum("cidade")} />
              <CampoVoz rotulo="Bairro" placeholder="Centro" {...comum("bairro")} />
              <CampoVoz rotulo="CEP" placeholder="00000-000" numerico {...comum("cep")} />
              <CampoVoz rotulo="Endereço" placeholder="Rua, número, bairro" largo {...comum("endereco")} />
              <CampoVoz
                rotulo="Horário de funcionamento"
                placeholder="Seg a sáb, 7h às 20h"
                largo
                {...comum("horario")}
              />
            </div>

            <div className="rotulo" style={{ marginTop: 12 }}>
              <CampoFoto
                rotulo={salvandoLogo ? "Logo da empresa (salvando…)" : "Logo da empresa"}
                semCaptura
                preview={logoPreview}
                aoEscolher={mudarLogo}
                aoRemover={logoPreview ? removerLogo : undefined}
                aoErro={(m) => {
                  setErro(true);
                  setAviso(m);
                }}
              />
              <p className="campo-foto-dica">
                Aparece pros outros lojistas no módulo Comércios grandes, quando você compartilhar
                um levantamento de preço.
              </p>
            </div>
          </section>

          <section className="cartao">
            <h2 className="titulo-cartao">Pix</h2>
            <p className="ajuda-voz">
              A chave abaixo gera o QR na tela de venda. Pode ser CPF/CNPJ, celular
              (+55…), e-mail ou chave aleatória.
            </p>
            <div className="grade-form">
              <div className="rotulo largo">
                <CampoVoz rotulo="Chave Pix" placeholder="Sua chave" largo {...comum("pixChave")} />
                {form.pixChave.trim() && (
                  <span className="contato-acoes">
                    <BotaoCopiar texto={form.pixChave.trim()} titulo="Copiar chave Pix" rotulo="Copiar Pix" />
                  </span>
                )}
              </div>
              <CampoVoz
                rotulo="Nome do recebedor"
                placeholder="Como aparece pra quem paga"
                largo
                {...comum("pixNome")}
              />
            </div>
          </section>

          <section className="cartao">
            <h2 className="titulo-cartao">Pix automático</h2>
            <p className="ajuda-voz">
              Conecte sua conta Mercado Pago pra o Pix da venda confirmar sozinho — o
              dinheiro cai direto na SUA conta, não passa pela plataforma.
            </p>
            {mpConectado === null ? (
              <p className="vazio">Carregando…</p>
            ) : mpConectado ? (
              <>
                <div className="acoes" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <button
                    type="button"
                    className="botao pagamento"
                    data-escolhido={mpAtivo}
                    disabled={salvandoMpAtivo}
                    onClick={() => alternarMpAtivo(true)}
                  >
                    Via Mercado Pago — confirma sozinho, cobra taxa
                  </button>
                  <button
                    type="button"
                    className="botao pagamento"
                    data-escolhido={!mpAtivo}
                    disabled={salvandoMpAtivo}
                    onClick={() => alternarMpAtivo(false)}
                  >
                    Pix direto — sem taxa, confirmação manual
                  </button>
                </div>
                <div className="acoes">
                  <span className="selo" data-situacao="aprovada">Conectado</span>
                  <button
                    type="button"
                    className="botao neutro"
                    onClick={desconectarMp}
                    disabled={desconectandoMp}
                  >
                    {desconectandoMp ? "Desconectando…" : "Desconectar"}
                  </button>
                </div>
              </>
            ) : (
              <a href="/api/mercadopago/conectar" className="botao primario">
                Conectar Mercado Pago
              </a>
            )}
          </section>

          <div className="acoes">
            <button className="botao primario" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar configurações"}
            </button>
          </div>

          <p className="dica" data-erro={erro} role="status" aria-live="polite">
            {aviso}
          </p>
        </>
      )}
    </main>
  );
}
