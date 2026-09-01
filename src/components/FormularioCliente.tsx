"use client";

import { useEffect, useRef, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import CampoFoto from "@/components/CampoFoto";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

type Form = {
  nome: string;
  cpf: string;
  telefone: string;
  whatsapp: boolean;
  endereco: string;
  cep: string;
  nota: string;
};

const VAZIO: Form = {
  nome: "",
  cpf: "",
  telefone: "",
  whatsapp: false,
  endereco: "",
  cep: "",
  nota: "",
};

const NOTAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

type Props = {
  aoSalvar: (cliente: { id: number; nome: string }) => void;
  aoCancelar?: () => void;
};

/** Cadastro de cliente reaproveitado na tela de Clientes e no fiado da venda. */
export default function FormularioCliente({ aoSalvar, aoCancelar }: Props) {
  const [form, setForm] = useState<Form>(VAZIO);
  const [foto, setFoto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [reputacao, setReputacao] = useState<{ media: number | null; avaliacoes: number } | null>(null);
  const ultimoCpf = useRef("");

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const campo = campoAtual.current as keyof Form | null;
      if (!campo) return;
      const cru = campo === "cpf" || campo === "telefone" || campo === "cep";
      setForm((f) => ({ ...f, [campo]: cru ? texto.replace(/\D/g, "") : capitalizar(texto) }));
      setErro(false);
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  // reputação pelo CPF (cruza todas as empresas)
  useEffect(() => {
    const digitos = form.cpf.replace(/\D/g, "");
    if (digitos.length < 11) {
      setReputacao(null);
      return;
    }
    if (digitos === ultimoCpf.current) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/clientes/reputacao?cpf=${digitos}`);
        const d = await r.json();
        ultimoCpf.current = digitos;
        setReputacao({ media: d.media, avaliacoes: d.avaliacoes });
      } catch {
        /* ignora */
      }
    }, 350);
    return () => clearTimeout(t);
  }, [form.cpf]);

  const comum = (k: keyof Form) => ({
    campo: k as string,
    valor: String(form[k]),
    aoMudar: (v: string) => setForm((f) => ({ ...f, [k]: v })),
    ouvindo: ouvindoCampo === k,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  const valido =
    form.nome.trim().length >= 2 && form.endereco.trim().length >= 2 && foto.startsWith("data:image/");

  async function salvar() {
    if (!valido) {
      setErro(true);
      setAviso(!foto ? "A foto do cliente é obrigatória." : "Preencha o nome e o endereço.");
      return;
    }
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, nota: form.nota || null, foto }),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — ") || "Não foi possível salvar.");
      }
      setForm(VAZIO);
      setFoto("");
      setReputacao(null);
      ultimoCpf.current = "";
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
      <p className="ajuda-voz" data-erro={!disponivel}>
        Foto e endereço são obrigatórios. Toque no microfone do campo e fale.
      </p>

      <div className="grade-form">
        <div className="rotulo largo">
          <CampoFoto
            rotulo="Foto do cliente (obrigatória)"
            preview={foto}
            aoEscolher={(d) => {
              setFoto(d);
              setErro(false);
            }}
            aoRemover={foto ? () => setFoto("") : undefined}
            aoErro={(m) => {
              setErro(true);
              setAviso(m);
            }}
          />
        </div>

        <CampoVoz rotulo="Nome" placeholder="Nome do cliente" largo {...comum("nome")} />
        <CampoVoz rotulo="Telefone" placeholder="11989902144" numerico {...comum("telefone")} />

        <label className="rotulo">
          <span className="entrada" style={{ padding: "12px 14px" }}>
            <input
              type="checkbox"
              checked={form.whatsapp}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.checked }))}
            />
            <span style={{ marginLeft: 8, fontWeight: 500, textTransform: "none", letterSpacing: 0 }}>
              Esse número é WhatsApp
            </span>
          </span>
        </label>

        <CampoVoz rotulo="CPF" placeholder="000.000.000-00" numerico {...comum("cpf")} />

        {reputacao && (
          <p className="ajuda-voz largo-linha" data-erro={reputacao.media !== null && reputacao.media < 5}>
            {reputacao.media === null
              ? "Esse CPF ainda não tem nota no sistema."
              : `Nota no sistema: ${reputacao.media.toFixed(1)} (${reputacao.avaliacoes} ${
                  reputacao.avaliacoes === 1 ? "avaliação" : "avaliações"
                }, contando todas as lojas).`}
          </p>
        )}

        <CampoVoz rotulo="CEP (opcional)" placeholder="00000-000" numerico {...comum("cep")} />
        <CampoVoz rotulo="Endereço (obrigatório)" placeholder="Rua, número, bairro" largo {...comum("endereco")} />

        <div className="rotulo largo">
          Nota do cliente (1 a 10)
          <div className="pagamentos" style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
            {NOTAS.map((n) => (
              <button
                key={n}
                type="button"
                className="botao pagamento"
                data-escolhido={form.nota === String(n)}
                onClick={() => setForm((f) => ({ ...f, nota: f.nota === String(n) ? "" : String(n) }))}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="acoes">
        <button className="botao primario" onClick={salvar} disabled={salvando}>
          {salvando ? "Salvando…" : "Cadastrar cliente"}
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
