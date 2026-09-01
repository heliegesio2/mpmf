"use client";

import { useEffect, useState } from "react";
import { Estatistica, GraficoColunas, GraficoBarrasHorizontais, GraficoLinha, formatarMes } from "@/components/Graficos";

type Relatorios = {
  estoque: { produtosAtivos: number; valorVenda: number; valorCompra: number; lucroPotencial: number };
  porCategoria: { categoria: string; quantidade: number; valor: number }[];
  prejuizo: { id: number; nome: string; preco: number; preco_compra: number; estoque: number }[];
  estoqueBaixo: { id: number; nome: string; preco: number; preco_compra: number; estoque: number }[];
  porBeneficiario: { beneficiario: string; valor: number }[];
  porMes: { mes: string; valor: number }[];
  gastoMesAtual: number;
  caixa: { data: string; valor: number }[];
  cascos: {
    emprestados: number;
    quantidadeTotal: number;
    maisAntigos: { id: number; responsavel: string; quantidade: number; criado_em: string }[];
  };
};

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/** Numero cheio nao cabe no card de KPI — "R$ 102,6 mil" em vez de "R$ 102.614". */
function moedaCompacta(v: number): string {
  const abs = Math.abs(v);
  if (abs < 1000) return moeda.format(v);
  const sinal = v < 0 ? "-" : "";
  return `${sinal}R$ ${(abs / 1000).toFixed(1).replace(".", ",")} mil`;
}

const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

export default function Relatorios() {
  const [dados, setDados] = useState<Relatorios | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/relatorios");
        const json = await r.json();
        if (!r.ok) throw new Error(json?.erro ?? "Não foi possível carregar.");
        setDados(json);
      } catch (e) {
        setErro(true);
        setAviso(e instanceof Error ? e.message : "Não foi possível carregar os relatórios.");
      } finally {
        setCarregando(false);
      }
    })();
  }, []);

  if (carregando) {
    return (
      <main className="tela">
        <header className="marca">Relatórios</header>
        <p className="vazio">Carregando…</p>
      </main>
    );
  }

  if (erro || !dados) {
    return (
      <main className="tela">
        <header className="marca">Relatórios</header>
        <p className="dica" data-erro="true">
          {aviso}
        </p>
      </main>
    );
  }

  const { estoque, porCategoria, prejuizo, estoqueBaixo, porBeneficiario, porMes, gastoMesAtual, caixa, cascos } =
    dados;

  return (
    <main className="tela">
      <header className="marca">Relatórios</header>

      <div className="grade-kpi">
        <Estatistica rotulo="Produtos ativos" valor={String(estoque.produtosAtivos)} />
        <Estatistica rotulo="Valor em estoque" valor={moedaCompacta(estoque.valorVenda)} sub="preço de venda" />
        <Estatistica rotulo="Capital investido" valor={moedaCompacta(estoque.valorCompra)} sub="preço de compra" />
        <Estatistica
          rotulo="Lucro potencial"
          valor={moedaCompacta(estoque.lucroPotencial)}
          sub="se vender tudo o que tem"
          negativo={estoque.lucroPotencial < 0}
        />
        <Estatistica rotulo="Gastos este mês" valor={moedaCompacta(gastoMesAtual)} />
        <Estatistica
          rotulo="Cascos emprestados"
          valor={String(cascos.emprestados)}
          sub={`${cascos.quantidadeTotal} unidades no total`}
        />
      </div>

      <section className="cartao">
        <h2 className="titulo-cartao">Caixa — últimos 30 dias</h2>
        <p className="ajuda-voz">
          Aproxima a receita diária pelo fechamento de caixa (não existe registro de venda item a item ainda).
        </p>
        <GraficoLinha dados={caixa} />
        {caixa.length > 0 && (
          <details className="tabela-detalhe">
            <summary>Ver tabela</summary>
            <table>
              <tbody>
                {caixa.map((d, i) => (
                  <tr key={i}>
                    <td>{dataCurta.format(new Date(d.data + "T00:00:00"))}</td>
                    <td>{moeda.format(d.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>

      <section className="cartao">
        <h2 className="titulo-cartao">Gastos por mês</h2>
        <GraficoColunas dados={porMes.map((m) => ({ rotulo: formatarMes(m.mes), valor: m.valor }))} />
      </section>

      <section className="cartao">
        <h2 className="titulo-cartao">Maiores gastos (90 dias)</h2>
        <GraficoBarrasHorizontais
          dados={porBeneficiario.map((b) => ({ rotulo: b.beneficiario, valor: b.valor }))}
        />
      </section>

      <section className="cartao">
        <h2 className="titulo-cartao">Estoque por categoria</h2>
        <p className="ajuda-voz">Valor parado (estoque × preço de venda) por categoria.</p>
        <GraficoColunas dados={porCategoria.map((c) => ({ rotulo: c.categoria, valor: c.valor }))} />
      </section>

      {prejuizo.length > 0 && (
        <section className="cartao">
          <h2 className="titulo-cartao">⚠️ Vendendo no prejuízo</h2>
          <p className="ajuda-voz">Preço de venda abaixo do preço de compra — cada venda desses dá prejuízo.</p>
          {prejuizo.map((p) => (
            <div className="alerta-item" key={p.id}>
              <span className="rotulo-item">
                {p.nome}
                <span className="sub">
                  venda {moeda.format(p.preco)} · compra {moeda.format(p.preco_compra)}
                </span>
              </span>
              <span className="valor-alerta">-{moeda.format(p.preco_compra - p.preco)}</span>
            </div>
          ))}
        </section>
      )}

      {estoqueBaixo.length > 0 && (
        <section className="cartao">
          <h2 className="titulo-cartao">📉 Estoque baixo</h2>
          <p className="ajuda-voz">3 unidades ou menos — considere repor.</p>
          {estoqueBaixo.map((p) => (
            <div className="alerta-item" key={p.id}>
              <span className="rotulo-item">{p.nome}</span>
              <span className="valor-alerta">{p.estoque}</span>
            </div>
          ))}
        </section>
      )}

      {cascos.maisAntigos.length > 0 && (
        <section className="cartao">
          <h2 className="titulo-cartao">📦 Cascos emprestados há mais tempo</h2>
          {cascos.maisAntigos.map((c) => (
            <div className="alerta-item" key={c.id}>
              <span className="rotulo-item">
                {c.responsavel}
                <span className="sub">{c.quantidade} un. · desde {dataCurta.format(new Date(c.criado_em))}</span>
              </span>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
