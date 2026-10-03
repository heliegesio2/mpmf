"use client";

import { useEffect, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import CampoTelefone from "@/components/CampoTelefone";
import CampoLogo from "@/components/CampoLogo";
import CampoCores from "@/components/CampoCores";
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
  inscricaoEstadual: string;
  regimeTributario: string;
  numero: string;
  complemento: string;
  uf: string;
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
  inscricaoEstadual: "",
  regimeTributario: "",
  numero: "",
  complemento: "",
  uf: "",
};

const REGIMES_TRIBUTARIOS = [
  { valor: "1", rotulo: "Simples Nacional" },
  { valor: "2", rotulo: "Simples Nacional — excesso de sublimite" },
  { valor: "3", rotulo: "Regime normal (Lucro Presumido/Real)" },
  { valor: "4", rotulo: "MEI" },
];

export default function Configuracoes() {
  const [form, setForm] = useState<Config>(VAZIO);
  const [cores, setCores] = useState<string[]>([]);
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
  const [fnConectado, setFnConectado] = useState<boolean | null>(null);
  const [fnAmbiente, setFnAmbiente] = useState<"producao" | "homologacao">("homologacao");
  const [fnTemProducao, setFnTemProducao] = useState(false);
  const [certificado, setCertificado] = useState<File | null>(null);
  const [senhaCertificado, setSenhaCertificado] = useState("");
  const [conectandoFn, setConectandoFn] = useState(false);
  const [desconectandoFn, setDesconectandoFn] = useState(false);
  const [salvandoAmbiente, setSalvandoAmbiente] = useState(false);

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
          inscricaoEstadual: e.inscricao_estadual ?? "",
          regimeTributario: e.regime_tributario ? String(e.regime_tributario) : "",
          numero: e.numero ?? "",
          complemento: e.complemento ?? "",
          uf: e.uf ?? "",
        });
        setCores(Array.isArray(e.cores) ? e.cores : []);
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

  useEffect(() => {
    fetch("/api/notafiscal")
      .then((r) => r.json())
      .then((d) => {
        setFnConectado(Boolean(d?.conectado));
        setFnAmbiente(d?.ambiente === "producao" ? "producao" : "homologacao");
        setFnTemProducao(Boolean(d?.temProducao));
      })
      .catch(() => setFnConectado(false));
  }, []);

  async function conectarFocusNFe() {
    if (!certificado) {
      setErro(true);
      setAviso("Escolha o arquivo do certificado (.pfx ou .p12).");
      return;
    }
    setConectandoFn(true);
    setErro(false);
    try {
      const dados = new FormData();
      dados.append("certificado", certificado);
      dados.append("senha", senhaCertificado);
      const r = await fetch("/api/notafiscal/conectar", { method: "POST", body: dados });
      const d = await r.json();
      if (!r.ok) throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — ") || "Não foi possível conectar.");
      setFnConectado(true);
      setCertificado(null);
      setSenhaCertificado("");
      setAviso("Focus NFe conectado — comece testando em homologação.");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível conectar.");
    } finally {
      setConectandoFn(false);
    }
  }

  async function desconectarFn() {
    if (!confirm("Desconectar o Focus NFe? Você para de conseguir emitir NFC-e até reconectar.")) return;
    setDesconectandoFn(true);
    try {
      await fetch("/api/notafiscal", { method: "DELETE" });
      setFnConectado(false);
    } catch {
      setErro(true);
      setAviso("Não foi possível desconectar.");
    } finally {
      setDesconectandoFn(false);
    }
  }

  async function alternarAmbienteFn(ambiente: "producao" | "homologacao") {
    setSalvandoAmbiente(true);
    setErro(false);
    try {
      const r = await fetch("/api/notafiscal", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ambiente }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro || "Não foi possível trocar o ambiente.");
      setFnAmbiente(ambiente);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível trocar o ambiente.");
    } finally {
      setSalvandoAmbiente(false);
    }
  }

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
        body: JSON.stringify({ ...form, cores }),
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

            <div className="rotulo logo-cores" style={{ marginTop: 12 }}>
              <div className="logo-cores-cores">
                <CampoCores valor={cores} aoMudar={setCores} />
                <p className="campo-foto-dica">
                  Dica: no seletor de cor, use o conta-gotas pra pegar as cores da sua logo ao lado.
                </p>
              </div>
              <div className="logo-cores-logo">
                <CampoLogo
                  rotulo={salvandoLogo ? "Logo da empresa (salvando…)" : "Logo da empresa"}
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
            </div>
          </section>

          <section className="cartao">
            <h2 className="titulo-cartao">Dados fiscais</h2>
            <p className="ajuda-voz">
              Usados pra emitir NFC-e. Número e complemento completam o endereço acima
              (que aqui vira a rua/logradouro).
            </p>
            <div className="grade-form">
              <CampoVoz rotulo="Inscrição Estadual" placeholder="Só números" {...comum("inscricaoEstadual")} />
              <label className="rotulo">
                Regime tributário
                <select
                  value={form.regimeTributario}
                  onChange={(e) => setForm((f) => ({ ...f, regimeTributario: e.target.value }))}
                >
                  <option value="">Selecione</option>
                  {REGIMES_TRIBUTARIOS.map((r) => (
                    <option key={r.valor} value={r.valor}>
                      {r.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <CampoVoz rotulo="Número" placeholder="123" {...comum("numero")} />
              <CampoVoz rotulo="Complemento" placeholder="Loja 2, fundos…" {...comum("complemento")} />
              <label className="rotulo">
                UF
                <input
                  value={form.uf}
                  maxLength={2}
                  placeholder="SP"
                  onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value.toUpperCase() }))}
                />
              </label>
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

          <section className="cartao">
            <h2 className="titulo-cartao">Nota fiscal (NFC-e)</h2>
            <p className="ajuda-voz">
              Emite a nota do consumidor pelo Focus NFe, usando o certificado digital da
              SUA empresa — preencha os dados fiscais acima antes de conectar.
            </p>
            {fnConectado === null ? (
              <p className="vazio">Carregando…</p>
            ) : fnConectado ? (
              <>
                <div className="acoes" style={{ flexDirection: "column", alignItems: "stretch" }}>
                  <button
                    type="button"
                    className="botao pagamento"
                    data-escolhido={fnAmbiente === "homologacao"}
                    disabled={salvandoAmbiente}
                    onClick={() => alternarAmbienteFn("homologacao")}
                  >
                    Testando (homologação) — não emite nota de verdade
                  </button>
                  <button
                    type="button"
                    className="botao pagamento"
                    data-escolhido={fnAmbiente === "producao"}
                    disabled={salvandoAmbiente || !fnTemProducao}
                    onClick={() => alternarAmbienteFn("producao")}
                    title={fnTemProducao ? undefined : "Aguardando liberação das credenciais de produção no Focus NFe"}
                  >
                    Produção — emite nota de verdade
                  </button>
                </div>
                <div className="acoes">
                  <span className="selo" data-situacao="aprovada">Conectado</span>
                  <button
                    type="button"
                    className="botao neutro"
                    onClick={desconectarFn}
                    disabled={desconectandoFn}
                  >
                    {desconectandoFn ? "Desconectando…" : "Desconectar"}
                  </button>
                </div>
              </>
            ) : (
              <div className="grade-form">
                <label className="rotulo largo">
                  Certificado digital (.pfx ou .p12)
                  <input
                    type="file"
                    accept=".pfx,.p12"
                    onChange={(e) => setCertificado(e.target.files?.[0] ?? null)}
                  />
                </label>
                <label className="rotulo">
                  Senha do certificado
                  <input
                    type="password"
                    value={senhaCertificado}
                    autoComplete="new-password"
                    onChange={(e) => setSenhaCertificado(e.target.value)}
                  />
                </label>
                <div className="acoes" style={{ gridColumn: "1 / -1" }}>
                  <button
                    type="button"
                    className="botao primario"
                    onClick={conectarFocusNFe}
                    disabled={conectandoFn}
                  >
                    {conectandoFn ? "Conectando…" : "Conectar Focus NFe"}
                  </button>
                </div>
              </div>
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
