"use client";

import { useCallback, useEffect, useState } from "react";

type Pagamento = { forma: string; valor: number };
type Venda = {
  id: number;
  data: string;
  criado_em: string;
  total: number;
  qtd_itens: number;
  pagamentos: Pagamento[];
};

const ROTULO_FORMA: Record<string, string> = {
  dinheiro: "Dinheiro",
  debito: "Débito",
  credito: "Crédito",
  pix: "Pix",
  fiado: "Fiado",
};

const moeda = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dataCurta = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });

/** data local de hoje no formato YYYY-MM-DD (pro <input type="date"> e pro filtro). */
function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** "2026-09-02" -> Date local (sem virar o dia por fuso). */
function paraDataLocal(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

export default function Vendas() {
  const [de, setDe] = useState(hojeISO);
  const [ate, setAte] = useState(hojeISO);
  const [itens, setItens] = useState<Venda[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async (d: string, a: string) => {
    setCarregando(true);
    setErro("");
    try {
      const r = await fetch(`/api/vendas?de=${d}&ate=${a}`);
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível carregar as vendas.");
      setItens(dados.itens);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as vendas.");
      setItens([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => carregar(de, ate), 200);
    return () => clearTimeout(t);
  }, [de, ate, carregar]);

  const total = itens.reduce((s, v) => s + v.total, 0);
  const umDiaSo = de === ate;

  return (
    <main className="tela">
      <header className="marca">
        Vendas <span>•</span> {itens.length} no período
      </header>

      <section className="cartao">
        <div className="grade-form">
          <label className="rotulo">
            De
            <span className="entrada">
              <input type="date" value={de} max={ate} onChange={(e) => setDe(e.target.value)} />
            </span>
          </label>
          <label className="rotulo">
            Até
            <span className="entrada">
              <input
                type="date"
                value={ate}
                min={de}
                max={hojeISO()}
                onChange={(e) => setAte(e.target.value)}
              />
            </span>
          </label>
        </div>

        <div className="resumo-vendas">
          <span>
            {itens.length} {itens.length === 1 ? "venda" : "vendas"}
          </span>
          <strong>R$ {moeda.format(total)}</strong>
        </div>
      </section>

      {erro && (
        <p className="dica" data-erro="true" role="status">
          {erro}
        </p>
      )}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">Nenhuma venda nesse período.</p>
      ) : (
        <ul className="lista">
          {itens.map((v) => (
            <li key={v.id}>
              <span className="rotulo-item">
                {umDiaSo
                  ? hora.format(new Date(v.criado_em))
                  : `${dataCurta.format(paraDataLocal(v.data))} ${hora.format(new Date(v.criado_em))}`}
                <span className="sub">
                  {v.qtd_itens} {v.qtd_itens === 1 ? "item" : "itens"}
                  {" · "}
                  {v.pagamentos.length === 0
                    ? "—"
                    : v.pagamentos
                        .map(
                          (p) =>
                            `${ROTULO_FORMA[p.forma] ?? p.forma} R$ ${moeda.format(p.valor)}`
                        )
                        .join(" + ")}
                </span>
              </span>
              <span className="preco">R$ {moeda.format(v.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
