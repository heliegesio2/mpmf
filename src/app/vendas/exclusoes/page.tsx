"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Exclusao = {
  id: number;
  venda_id: number;
  venda_data: string | null;
  venda_criado_em: string | null;
  total: number;
  itens: { nome: string; quantidade: number; preco_unit: number; tipo_venda: string }[];
  pagamentos: { forma: string; valor: number }[];
  fiados: { cliente: string; valor: number; pago: boolean }[];
  usuario_nome: string;
  excluido_em: string;
};

const ROTULO_FORMA: Record<string, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
  fiado: "Fiado",
};

const moeda = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qtd = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });
const dataHora = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export default function ExclusoesVenda() {
  const [itens, setItens] = useState<Exclusao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aberta, setAberta] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/vendas/exclusoes");
        const dados = await r.json();
        if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível carregar o log.");
        setItens(dados.itens);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível carregar o log.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  return (
    <main className="tela">
      <header className="marca">
        Vendas excluídas <span>•</span> {itens.length}
      </header>

      <p className="dica">
        <Link href="/vendas">← Voltar para as vendas</Link>
      </p>

      {erro && (
        <p className="dica" data-erro="true" role="status">
          {erro}
        </p>
      )}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">Nenhuma venda foi excluída.</p>
      ) : (
        <ul className="lista">
          {itens.map((x) => (
            <li key={x.id}>
              <span className="rotulo-item">
                Excluída em {dataHora.format(new Date(x.excluido_em))} por {x.usuario_nome}
                <span className="sub">
                  Venda de{" "}
                  {x.venda_criado_em ? dataHora.format(new Date(x.venda_criado_em)) : (x.venda_data ?? "—")}
                  {" · "}
                  {x.itens.length} {x.itens.length === 1 ? "item" : "itens"}
                  {" · "}
                  {x.pagamentos.length === 0
                    ? "—"
                    : x.pagamentos
                        .map((p) => `${ROTULO_FORMA[p.forma] ?? p.forma} R$ ${moeda.format(p.valor)}`)
                        .join(" + ")}
                </span>
                {x.fiados.length > 0 && (
                  <span className="sub">
                    Fiado apagado:{" "}
                    {x.fiados
                      .map((f) => `${f.cliente} R$ ${moeda.format(f.valor)}${f.pago ? " (já estava pago)" : ""}`)
                      .join(", ")}
                  </span>
                )}
                {aberta === x.id && (
                  <span className="sub">
                    {x.itens.map((i, n) => (
                      <span key={n} style={{ display: "block" }}>
                        {qtd.format(i.quantidade)}
                        {i.tipo_venda === "quilo" ? " kg" : "×"} {i.nome} — R$ {moeda.format(i.preco_unit)}
                      </span>
                    ))}
                  </span>
                )}
              </span>
              <span className="preco">R$ {moeda.format(x.total)}</span>
              <span className="botoes-linha">
                <button className="botao mini" onClick={() => setAberta(aberta === x.id ? null : x.id)}>
                  {aberta === x.id ? "Ocultar" : "Itens"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
