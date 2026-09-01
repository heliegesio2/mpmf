"use client";

import { useEffect, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

type Config = {
  nome: string;
  documento: string;
  telefone: string;
  cidade: string;
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
  cidade: "",
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
          cidade: e.cidade ?? "",
          cep: e.cep ?? "",
          endereco: e.endereco ?? "",
          horario: e.horario ?? "",
          pixChave: e.pix_chave ?? "",
          pixNome: e.pix_nome ?? "",
        });
      } catch (e) {
        setErro(true);
        setAviso(e instanceof Error ? e.message : "Não foi possível carregar.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

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
    valor: form[k],
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
              <CampoVoz rotulo="Telefone" placeholder="11989902144" numerico {...comum("telefone")} />
              <CampoVoz rotulo="Cidade" placeholder="São Paulo" {...comum("cidade")} />
              <CampoVoz rotulo="CEP" placeholder="00000-000" numerico {...comum("cep")} />
              <CampoVoz rotulo="Endereço" placeholder="Rua, número, bairro" largo {...comum("endereco")} />
              <CampoVoz
                rotulo="Horário de funcionamento"
                placeholder="Seg a sáb, 7h às 20h"
                largo
                {...comum("horario")}
              />
            </div>
          </section>

          <section className="cartao">
            <h2 className="titulo-cartao">Pix</h2>
            <p className="ajuda-voz">
              A chave abaixo gera o QR na tela de venda. Pode ser CPF/CNPJ, celular
              (+55…), e-mail ou chave aleatória.
            </p>
            <div className="grade-form">
              <CampoVoz rotulo="Chave Pix" placeholder="Sua chave" largo {...comum("pixChave")} />
              <CampoVoz
                rotulo="Nome do recebedor"
                placeholder="Como aparece pra quem paga"
                largo
                {...comum("pixNome")}
              />
            </div>
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
