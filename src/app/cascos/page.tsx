"use client";

import { useCallback, useEffect, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import CampoTelefone from "@/components/CampoTelefone";
import DadosContato from "@/components/DadosContato";
import { useVoz } from "@/lib/useVoz";
import { capitalizar, numeroFalado } from "@/lib/voz";

type Casco = {
  id: number;
  responsavel: string;
  telefone: string;
  telefone_whatsapp: boolean;
  endereco: string;
  quantidade: number;
  devolvido: boolean;
  devolvido_em: string | null;
  criado_em: string;
};

type NovoCasco = {
  responsavel: string;
  telefone: string;
  whatsapp: boolean;
  endereco: string;
  quantidade: string;
};

const VAZIO: NovoCasco = { responsavel: "", telefone: "", whatsapp: false, endereco: "", quantidade: "" };

const FILTROS = [
  { valor: "emprestados", rotulo: "Emprestados" },
  { valor: "devolvidos", rotulo: "Devolvidos" },
  { valor: "todas", rotulo: "Todas" },
];

const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export default function Cascos() {
  const [itens, setItens] = useState<Casco[]>([]);
  const [filtro, setFiltro] = useState("emprestados");
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState<NovoCasco>(VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  const aplicarFala = useCallback((campo: string, texto: string) => {
    setErro(false);

    if (campo === "quantidade") {
      const n = numeroFalado(texto);
      if (n === null) {
        setErro(true);
        setAviso(`Não entendi "${texto}" como número.`);
        return;
      }
      setForm((f) => ({ ...f, quantidade: n.replace(",", "") }));
      setAviso("");
      return;
    }

    if (campo === "telefone") {
      setForm((f) => ({ ...f, telefone: texto }));
      setAviso("");
      return;
    }

    setForm((f) => ({ ...f, [campo]: capitalizar(texto) }));
    setAviso("");
  }, []);

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const campo = campoAtual.current;
      if (campo) aplicarFala(campo, texto);
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  const comum = (k: keyof NovoCasco) => ({
    campo: k as string,
    valor: String(form[k]),
    aoMudar: (v: string) => setForm((f) => ({ ...f, [k]: v })),
    ouvindo: ouvindoCampo === k,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  const carregar = useCallback(async (situacao: string) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/cascos?situacao=${situacao}`);
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setItens(dados.itens);
    } catch {
      setErro(true);
      setAviso("Não foi possível carregar os cascos.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar(filtro);
  }, [filtro, carregar]);

  const formularioValido =
    form.responsavel.trim().length >= 2 &&
    form.telefone.trim().length >= 8 &&
    form.endereco.trim().length >= 2 &&
    Number(form.quantidade) > 0;

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/cascos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, quantidade: Number(form.quantidade) }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");

      setAviso("Empréstimo registrado.");
      setForm(VAZIO);
      await carregar(filtro);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function marcarDevolvido(c: Casco) {
    try {
      const r = await fetch(`/api/cascos/${c.id}`, { method: "PATCH" });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setAviso("Marcado como devolvido.");
      setErro(false);
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível salvar.");
    }
  }

  async function excluir(c: Casco) {
    if (!confirm(`Excluir o registro de "${c.responsavel}"? Essa ação não tem volta.`)) return;
    try {
      const r = await fetch(`/api/cascos/${c.id}`, { method: "DELETE" });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setAviso("Registro excluído.");
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
        Cascos <span>•</span> {itens.length} na lista
      </header>

      <section className="cartao">
        <h2 className="titulo-cartao">Novo empréstimo</h2>

        <p className="ajuda-voz" data-erro={!disponivel}>
          {disponivel
            ? "Toque no microfone do campo e fale."
            : "Este navegador não reconhece fala. Abra no Chrome ou no Edge para usar os microfones."}
        </p>

        <div className="grade-form">
          <CampoVoz rotulo="Responsável" placeholder="Nome de quem levou" largo {...comum("responsavel")} />
          <CampoTelefone
            rotulo="Telefone"
            {...comum("telefone")}
            ehWhatsapp={form.whatsapp}
            aoMudarWhatsapp={(v) => setForm((f) => ({ ...f, whatsapp: v }))}
          />
          <CampoVoz rotulo="Quantidade de cascos" placeholder="12" numerico {...comum("quantidade")} />
          <CampoVoz rotulo="Endereço" placeholder="Rua, número, bairro" largo {...comum("endereco")} />
        </div>

        <div className="acoes">
          <button className="botao primario" onClick={salvar} disabled={salvando || !formularioValido}>
            {salvando ? "Salvando…" : "Registrar empréstimo"}
          </button>
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>

      <div className="abas">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            className="botao aba"
            data-ativo={filtro === f.valor}
            onClick={() => setFiltro(f.valor)}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">Nenhum registro nessa situação.</p>
      ) : (
        <ul className="lista">
          {itens.map((c) => (
            <li key={c.id} className="empresa">
              <span className="rotulo-item">
                {c.responsavel}
                <span className="sub">
                  {[
                    `${c.quantidade} casco(s)`,
                    c.devolvido
                      ? `devolvido em ${data.format(new Date(c.devolvido_em!))}`
                      : `desde ${data.format(new Date(c.criado_em))}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <DadosContato
                  telefone={c.telefone}
                  whatsapp={c.telefone_whatsapp}
                  local={c.endereco}
                />
              </span>

              <span className="selo" data-situacao={c.devolvido ? "aprovada" : "pendente"}>
                {c.devolvido ? "devolvido" : "emprestado"}
              </span>

              <span className="botoes-linha">
                {!c.devolvido && (
                  <button className="botao mini" onClick={() => marcarDevolvido(c)}>
                    Marcar devolvido
                  </button>
                )}
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
