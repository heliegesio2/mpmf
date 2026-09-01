"use client";

import { useCallback, useEffect, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import CampoTelefone from "@/components/CampoTelefone";
import { useVoz } from "@/lib/useVoz";
import { capitalizar, numeroFalado } from "@/lib/voz";
import { linkWhatsapp } from "@/lib/whatsapp";

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

const IconeZap = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.99.55 3.85 1.5 5.44L2 22l4.79-1.25a9.9 9.9 0 0 0 5.25 1.5h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.06c-.24.68-1.4 1.3-1.93 1.35-.53.05-1.02.24-3.44-.72-2.9-1.14-4.73-4.14-4.87-4.33-.14-.19-1.16-1.55-1.16-2.95 0-1.4.73-2.09.99-2.37.26-.28.57-.35.76-.35h.55c.18 0 .42-.07.65.5.24.58.81 2 .88 2.14.07.14.12.31.02.5-.09.19-.14.31-.28.47-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.19-.28.37-.23.63-.14.26.09 1.65.78 1.93.92.28.14.47.21.53.33.07.12.07.68-.17 1.36z" />
  </svg>
);

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
                <span className="linha-com-zap">
                  {c.responsavel}
                  {c.telefone_whatsapp && linkWhatsapp(c.telefone) && (
                    <a
                      className="zap-link"
                      href={linkWhatsapp(c.telefone)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Enviar mensagem no WhatsApp para ${c.responsavel}`}
                      title="Enviar mensagem no WhatsApp"
                    >
                      {IconeZap}
                    </a>
                  )}
                </span>
                <span className="sub">
                  {[
                    `${c.quantidade} casco(s)`,
                    c.telefone,
                    c.endereco,
                    c.devolvido
                      ? `devolvido em ${data.format(new Date(c.devolvido_em!))}`
                      : `desde ${data.format(new Date(c.criado_em))}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
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
