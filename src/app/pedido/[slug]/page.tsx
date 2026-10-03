"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useVoz } from "@/lib/useVoz";
import { linhasDePreco, opcoesDePedido, rotuloUnidade } from "@/lib/fornecedorProduto";
import { precoAplicavel, reaisPedido as reais, type UnidadePedido } from "@/lib/pedido";

type Produto = {
  id: number;
  nome: string;
  categoria: string;
  tipo_venda: string;
  preco_unidade: number | null;
  preco_desconto: number | null;
  desconto_qtd_min: number | null;
  desconto_pct: number | null;
  preco_caixa: number | null;
  caixa_qtd: number | null;
  permite_unidade: boolean;
  aceita_urgencia: boolean;
  taxa_urgencia: number | null;
  tem_foto: boolean;
};
type Linha = { qtd: string; unidade: UnidadePedido };

const FLASH = "mpmf.pedidoFlash";

/** Unidade pré-selecionada: a em que o produto é vendido (primeira opção). */
function unidadePadrao(p: Produto): UnidadePedido {
  return opcoesDePedido(p)[0]?.codigo ?? "un";
}

export default function MontarPedido() {
  const router = useRouter();
  const slug = String(useParams().slug ?? "");

  const [fornecedor, setFornecedor] = useState<{ id: number; nome: string; observacao: string | null } | null>(null);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [linhas, setLinhas] = useState<Record<number, Linha>>({});
  const [obs, setObs] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  const { ouvir, parar, ouvindoCampo, disponivel } = useVoz({
    aoFinalizar: (t) => setObs((o) => (o ? o + " " : "") + t),
    aoErrar: (m) => setErro(m),
  });

  const carregar = useCallback(async () => {
    try {
      const r = await fetch(`/api/pedidos/catalogo/${slug}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não foi possível carregar.");
      setFornecedor(d.fornecedor);
      setProdutos(d.produtos ?? []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, [slug]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function setLinha(id: number, patch: Partial<Linha>) {
    setLinhas((l) => {
      const p = produtos.find((x) => x.id === id);
      const atual: Linha = l[id] ?? { qtd: "", unidade: p ? unidadePadrao(p) : "un" };
      return { ...l, [id]: { ...atual, ...patch } };
    });
  }

  const carrinho = useMemo(() => {
    const itens: { produto: Produto; qtd: number; unidade: UnidadePedido; preco: number; subtotal: number }[] = [];
    for (const p of produtos) {
      const l = linhas[p.id];
      const qtd = Math.round(Number(l?.qtd));
      if (!l || !Number.isInteger(qtd) || qtd <= 0) continue;
      const preco = precoAplicavel(p, l.unidade, qtd);
      if (preco == null) continue;
      itens.push({ produto: p, qtd, unidade: l.unidade, preco, subtotal: Math.round(preco * qtd * 100) / 100 });
    }
    const subtotal = Math.round(itens.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
    // urgência vale pro pedido todo e só se TODOS os itens aceitam; cobra a maior taxa, uma vez
    const podeUrgencia = itens.length > 0 && itens.every((i) => i.produto.aceita_urgencia);
    const semUrgencia = itens.filter((i) => !i.produto.aceita_urgencia).map((i) => i.produto.nome);
    const taxa = Math.max(0, ...itens.map((i) => i.produto.taxa_urgencia ?? 0));
    const urgenteValendo = urgente && podeUrgencia;
    const taxaCobrada = urgenteValendo ? taxa : 0;
    const total = Math.round((subtotal + taxaCobrada) * 100) / 100;
    return { itens, subtotal, total, podeUrgencia, semUrgencia, taxa, urgenteValendo, taxaCobrada };
  }, [produtos, linhas, urgente]);

  async function enviar() {
    if (carrinho.itens.length === 0) {
      setErro("Escolha a quantidade de pelo menos um produto.");
      return;
    }
    setEnviando(true);
    setErro("");
    try {
      const r = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorPublicoId: fornecedor?.id,
          observacao: obs,
          urgente: carrinho.urgenteValendo,
          itens: carrinho.itens.map((i) => ({
            fornecedorProdutoId: i.produto.id,
            unidade: i.unidade,
            qtd: i.qtd,
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não foi possível enviar.");
      try {
        sessionStorage.setItem(FLASH, `Pedido enviado pra ${fornecedor?.nome}. ${reais(d.total)}.`);
      } catch {
        /* sem sessionStorage */
      }
      router.push("/pedidos");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <main className="tela">
        <p className="vazio">Carregando…</p>
      </main>
    );
  }

  return (
    <main className="tela">
      <header className="marca">
        Solicitar produto <span>•</span> {fornecedor?.nome}
      </header>
      {fornecedor?.observacao && <p className="dica">{fornecedor.observacao}</p>}

      {produtos.length === 0 ? (
        <p className="vazio">Este fornecedor ainda não tem produtos no catálogo.</p>
      ) : (
        <ul className="lista lista-forn-produtos">
          {produtos.map((p) => {
            const opcoes = opcoesDePedido(p);
            const l = linhas[p.id] ?? { qtd: "", unidade: unidadePadrao(p) };
            const qtd = Math.round(Number(l.qtd)) || 0;
            const preco = qtd > 0 ? precoAplicavel(p, l.unidade, qtd) : null;
            const unidadeSel = rotuloUnidade(l.unidade, 1);
            return (
              <li className="forn-produto" key={p.id}>
                <div className="forn-produto-info">
                  <div className="forn-produto-topo">
                    <div>
                      <strong className="forn-produto-nome">{p.nome}</strong>
                      {p.categoria && <span className="sub">{p.categoria}</span>}
                      <span className="sub">{linhasDePreco(p).join(" · ")}</span>
                    </div>
                  </div>

                  <div className="pedir-linha">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className="pedir-qtd"
                      value={l.qtd}
                      onChange={(e) => setLinha(p.id, { qtd: e.target.value })}
                      aria-label={`Quantidade de ${p.nome}`}
                    />
                    <select
                      value={l.unidade}
                      onChange={(e) => setLinha(p.id, { unidade: e.target.value as UnidadePedido })}
                      aria-label="Unidade"
                    >
                      {opcoes.map((o) => (
                        <option key={o.codigo} value={o.codigo}>
                          {rotuloUnidade(o.codigo, 1)}
                          {o.codigo === "caixa" && p.caixa_qtd ? ` (${p.caixa_qtd} un)` : ""}
                        </option>
                      ))}
                    </select>
                    <span className="pedir-preco">
                      {preco != null ? `${reais(preco)}/${unidadeSel} · ${reais(preco * qtd)}` : "—"}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <section className="cartao pedido-fechamento">
        <label className="rotulo largo">
          Observação (opcional)
          <span className="entrada" data-ouvindo={ouvindoCampo === "obs"}>
            <input
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              placeholder="Ex.: entregar na quinta de manhã"
            />
            <button
              type="button"
              className="mic-campo"
              data-ouvindo={ouvindoCampo === "obs"}
              disabled={!disponivel}
              onClick={() => (ouvindoCampo === "obs" ? parar() : ouvir("obs"))}
              aria-label="Falar a observação"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
          </span>
        </label>

        <label className="rotulo largo check-whatsapp">
          <input
            type="checkbox"
            checked={urgente}
            disabled={!carrinho.podeUrgencia}
            onChange={(e) => setUrgente(e.target.checked)}
          />
          ⚡ Pedido com urgência
        </label>
        {carrinho.itens.length > 0 && !carrinho.podeUrgencia && (
          <p className="dica">
            Urgência indisponível: {carrinho.semUrgencia.join(", ")}{" "}
            {carrinho.semUrgencia.length === 1 ? "não aceita" : "não aceitam"} pedido urgente.
          </p>
        )}
        {carrinho.urgenteValendo && (
          <p className="dica">
            {carrinho.taxa > 0
              ? `Pedido urgente: o fornecedor cobra uma taxa de urgência de ${reais(carrinho.taxa)}, somada ao total.`
              : "Pedido urgente: o fornecedor não cobra taxa."}
          </p>
        )}

        <div className="linha-total">
          <span>{carrinho.itens.length} item(ns)</span>
          <strong>{reais(carrinho.total)}</strong>
        </div>

        {erro && <p className="dica" data-erro="true">{erro}</p>}

        <div className="acoes">
          <button className="botao primario grande" onClick={enviar} disabled={enviando}>
            {enviando ? "Enviando…" : "Enviar pedido"}
          </button>
        </div>
      </section>
    </main>
  );
}
