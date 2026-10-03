"use client";

import { formatarTelefone, telefoneCompleto } from "@/lib/telefone";
import { useCallback, useEffect, useRef, useState } from "react";
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
  item: string | null;
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
  item: string;
};

const VAZIO: NovoCasco = {
  responsavel: "",
  telefone: "",
  whatsapp: false,
  endereco: "",
  quantidade: "",
  item: "",
};

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
  const [criando, setCriando] = useState(false);
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
      setForm((f) => ({ ...f, telefone: formatarTelefone(texto) }));
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

  /** Campos que ainda faltam (ou estão inválidos), pra dizer ao usuário em vez de só travar o botão. */
  const faltando = [
    form.responsavel.trim().length < 2 && "Responsável",
    !telefoneCompleto(form.telefone) && "Telefone com DDD",
    !(Number.isInteger(Number(form.quantidade)) && Number(form.quantidade) > 0) && "Quantidade (número inteiro)",
    form.endereco.trim().length < 2 && "Endereço",
  ].filter(Boolean) as string[];

  async function salvar() {
    if (faltando.length > 0) {
      setErro(true);
      setAviso(`Preencha: ${faltando.join(", ")}.`);
      return;
    }
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
      setCriando(false);
      // o novo empréstimo está "emprestado": volta pro filtro inicial pra ele aparecer
      if (filtro === "emprestados") await carregar("emprestados");
      else setFiltro("emprestados");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  // toques em +/− por empréstimo ainda em voo (só aplica a resposta do último)
  const emVoo = useRef<Record<number, number>>({});

  /** + / −: salva na hora. Optimista na tela; o servidor soma de forma atômica. */
  async function ajustar(c: Casco, delta: number) {
    if (delta < 0 && c.quantidade + delta < 1) {
      if (!confirm(`Devolveu tudo de "${c.responsavel}"? O empréstimo será marcado como devolvido.`)) return;
    } else {
      setItens((xs) => xs.map((x) => (x.id === c.id ? { ...x, quantidade: x.quantidade + delta } : x)));
    }
    emVoo.current[c.id] = (emVoo.current[c.id] ?? 0) + 1;
    try {
      const r = await fetch(`/api/cascos/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      emVoo.current[c.id] -= 1;
      if (emVoo.current[c.id] > 0) return; // ainda há toques pendentes: espera a última resposta
      const item = dados.item as Casco;
      if (item.devolvido) {
        setAviso(`${item.responsavel} devolveu tudo — marcado como devolvido.`);
        setErro(false);
        await carregar(filtro);
      } else {
        setItens((xs) => xs.map((x) => (x.id === item.id ? { ...x, quantidade: item.quantidade } : x)));
      }
    } catch {
      emVoo.current[c.id] = Math.max(0, (emVoo.current[c.id] ?? 1) - 1);
      setErro(true);
      setAviso("Não foi possível salvar a quantidade.");
      await carregar(filtro);
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
      <div className="cabecalho-tela">
        <header className="marca">
          Empréstimos <span>•</span> {itens.length} na lista
        </header>
        {!criando && (
          <button className="botao mini" onClick={() => { setCriando(true); setForm(VAZIO); setAviso(""); setErro(false); }}>
            + Novo empréstimo
          </button>
        )}
      </div>

      {criando && (
      <section className="cartao">
        <h2 className="titulo-cartao">Novo empréstimo</h2>

        <p className="ajuda-voz" data-erro={!disponivel}>
          {disponivel
            ? "Toque no microfone do campo e fale."
            : "Este navegador não reconhece fala. Abra no Chrome ou no Edge para usar os microfones."}
        </p>

        <div className="grade-form">
          <CampoVoz rotulo="Responsável" placeholder="Nome de quem levou" largo {...comum("responsavel")} />
          <CampoVoz rotulo="Item retirado (opcional)" placeholder="Engradado de cerveja, botijão…" largo {...comum("item")} />
          <CampoTelefone
            rotulo="Telefone"
            {...comum("telefone")}
            ehWhatsapp={form.whatsapp}
            aoMudarWhatsapp={(v) => setForm((f) => ({ ...f, whatsapp: v }))}
          />
          <CampoVoz rotulo="Quantidade" placeholder="12" numerico {...comum("quantidade")} />
          <CampoVoz rotulo="Endereço" placeholder="Rua, número, bairro" largo {...comum("endereco")} />
        </div>

        <div className="acoes">
          <button className="botao primario" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Registrar empréstimo"}
          </button>
          <button className="botao neutro" onClick={() => setCriando(false)} disabled={salvando}>
            Cancelar
          </button>
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>
      )}

      {!criando && aviso && (
        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      )}

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
                    `${c.quantidade}× ${c.item ?? "casco(s)"}`,
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

              {!c.devolvido && (
                <span className="casco-qtd" role="group" aria-label={`Quantidade emprestada: ${c.quantidade}`}>
                  <button
                    type="button"
                    className="botao mini"
                    onClick={() => ajustar(c, -1)}
                    aria-label="Diminuir quantidade (devolveu um)"
                    title="Devolveu um"
                  >
                    −
                  </button>
                  <span className="casco-qtd-valor">
                    <strong>{c.quantidade}</strong>
                    <small>{c.quantidade === 1 ? "emprestado" : "emprestados"}</small>
                  </span>
                  <button
                    type="button"
                    className="botao mini"
                    onClick={() => ajustar(c, 1)}
                    aria-label="Aumentar quantidade (levou mais um)"
                    title="Levou mais um"
                  >
                    +
                  </button>
                </span>
              )}

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
