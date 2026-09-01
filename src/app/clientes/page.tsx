"use client";

import { useCallback, useEffect, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import CampoFoto from "@/components/CampoFoto";
import FotoAmpliavel from "@/components/FotoAmpliavel";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

type Cliente = {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  whatsapp: boolean;
  endereco: string;
  cep: string | null;
  saldo_fiado?: number;
};

type Form = {
  nome: string;
  cpf: string;
  telefone: string;
  whatsapp: boolean;
  endereco: string;
  cep: string;
};

const VAZIO: Form = { nome: "", cpf: "", telefone: "", whatsapp: false, endereco: "", cep: "" };

const moeda = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Clientes() {
  const [itens, setItens] = useState<Cliente[]>([]);
  const [filtro, setFiltro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<Form>(VAZIO);
  const [foto, setFoto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

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

  const carregar = useCallback(async (q: string) => {
    try {
      const r = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro);
      setItens(d.itens);
      setErro(false);
    } catch {
      setErro(true);
      setAviso("Não foi possível carregar os clientes.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => carregar(filtro), 250);
    return () => clearTimeout(t);
  }, [filtro, carregar]);

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
      setAviso(
        !foto ? "A foto do cliente é obrigatória." : "Preencha o nome e o endereço."
      );
      return;
    }
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/clientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, foto }),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — ") || "Não foi possível salvar.");
      }
      setAviso("Cliente cadastrado.");
      setForm(VAZIO);
      setFoto("");
      await carregar(filtro);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(c: Cliente) {
    if (!confirm(`Excluir "${c.nome}"? Os fiados dele também somem. Essa ação não tem volta.`)) return;
    try {
      const r = await fetch(`/api/clientes/${c.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro);
      setAviso("Cliente excluído.");
      setErro(false);
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível excluir.");
    }
  }

  return (
    <main className="tela">
      <header className="marca">
        Clientes <span>•</span> {itens.length} cadastrados
      </header>

      <section className="cartao">
        <h2 className="titulo-cartao">Novo cliente</h2>
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
          <CampoVoz rotulo="CEP (opcional)" placeholder="00000-000" numerico {...comum("cep")} />
          <CampoVoz rotulo="Endereço (obrigatório)" placeholder="Rua, número, bairro" largo {...comum("endereco")} />
        </div>

        <div className="acoes">
          <button className="botao primario" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Cadastrar cliente"}
          </button>
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>

      <div className="campo simples">
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar por nome ou CPF"
          aria-label="Filtrar clientes"
          autoComplete="off"
        />
      </div>

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">{filtro ? "Nenhum cliente com esse filtro." : "Nenhum cliente cadastrado."}</p>
      ) : (
        <ul className="lista">
          {itens.map((c) => (
            <li key={c.id}>
              <FotoAmpliavel
                className="miniatura-produto"
                src={`/api/clientes/${c.id}/foto`}
                alt={c.nome}
              />
              <span className="rotulo-item">
                {c.nome}
                <span className="sub">
                  {[
                    c.telefone && `${c.telefone}${c.whatsapp ? " (WhatsApp)" : ""}`,
                    c.cpf,
                    c.endereco,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              {c.saldo_fiado ? (
                <span className="estoque-cel" data-critico="true">
                  deve R$ {moeda.format(c.saldo_fiado)}
                </span>
              ) : null}
              <span className="botoes-linha">
                <button className="botao mini perigo" onClick={() => excluir(c)}>
                  Excluir
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
