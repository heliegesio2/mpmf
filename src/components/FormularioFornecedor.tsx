"use client";

import { useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import CampoTelefone from "@/components/CampoTelefone";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

type Form = {
  nome: string;
  documento: string;
  telefone: string;
  whatsapp: boolean;
  endereco: string;
  observacao: string;
  pixChave: string;
};

const VAZIO: Form = {
  nome: "",
  documento: "",
  telefone: "",
  whatsapp: false,
  endereco: "",
  observacao: "",
  pixChave: "",
};

type Props = {
  /** Recebe o fornecedor recém-criado. */
  aoSalvar: (fornecedor: { id: number; nome: string }) => void;
  aoCancelar?: () => void;
  /** Pré-preenche o formulário (ex.: dados lidos da foto do boleto). */
  inicial?: Partial<Pick<Form, "nome" | "documento" | "telefone" | "endereco">>;
};

/** Cadastro de fornecedor — usado em /fornecedores e no /contas-pagar. */
export default function FormularioFornecedor({ aoSalvar, aoCancelar, inicial }: Props) {
  const [form, setForm] = useState<Form>({ ...VAZIO, ...inicial });
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const campo = campoAtual.current as keyof Form | null;
      if (!campo) return;
      const soDigitos = campo === "documento" || campo === "telefone";
      const cru = campo === "pixChave";
      setForm((f) => ({
        ...f,
        [campo]: soDigitos
          ? texto.replace(/\D/g, "")
          : cru
            ? texto.replace(/\s/g, "")
            : capitalizar(texto),
      }));
      setErro(false);
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  const comum = (k: keyof Form) => ({
    campo: k as string,
    valor: String(form[k]),
    aoMudar: (v: string) => setForm((f) => ({ ...f, [k]: v })),
    ouvindo: ouvindoCampo === k,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  async function salvar() {
    if (form.nome.trim().length < 2) {
      setErro(true);
      setAviso("Informe o nome do fornecedor.");
      return;
    }
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/fornecedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome,
          documento: form.documento,
          telefone: form.telefone,
          telefoneWhatsapp: form.whatsapp,
          endereco: form.endereco,
          observacao: form.observacao,
          pixChave: form.pixChave,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — ") || "Não foi possível salvar.");
      }
      setForm(VAZIO);
      aoSalvar({ id: d.item.id, nome: d.item.nome });
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <div className="grade-form">
        <CampoVoz rotulo="Nome" placeholder="Distribuidora Silva" largo {...comum("nome")} />
        <CampoVoz rotulo="CNPJ ou CPF" placeholder="Só números" numerico {...comum("documento")} />
        <CampoTelefone
          rotulo="Telefone"
          {...comum("telefone")}
          ehWhatsapp={form.whatsapp}
          aoMudarWhatsapp={(v) => setForm((f) => ({ ...f, whatsapp: v }))}
        />
        <CampoVoz rotulo="Endereço" placeholder="Rua, número, bairro" largo {...comum("endereco")} />
        <CampoVoz
          rotulo="Chave Pix"
          placeholder="CNPJ, celular, e-mail ou aleatória"
          largo
          {...comum("pixChave")}
        />
        <CampoVoz
          rotulo="Observação"
          placeholder="Dias de entrega, contato, condições…"
          largo
          {...comum("observacao")}
        />
      </div>

      <div className="acoes">
        <button className="botao primario" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar fornecedor"}
        </button>
        {aoCancelar && (
          <button className="botao neutro" onClick={aoCancelar} disabled={salvando}>
            Cancelar
          </button>
        )}
      </div>

      <p className="dica" data-erro={erro} role="status" aria-live="polite">
        {aviso}
      </p>
    </>
  );
}
