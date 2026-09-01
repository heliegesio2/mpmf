"use client";

import { useState } from "react";

/** "1234" -> "1,2 mil" | "89" -> "89" — mantem o rotulo curto embaixo da coluna. */
function compacto(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(1).replace(".", ",")} mil`;
  return Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",");
}

const moeda = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function Estatistica({
  rotulo,
  valor,
  sub,
  negativo,
}: {
  rotulo: string;
  valor: string;
  sub?: string;
  negativo?: boolean;
}) {
  return (
    <div className="estatistica">
      <p className="rotulo-kpi">{rotulo}</p>
      <p className="valor-kpi" data-negativo={negativo}>
        {valor}
      </p>
      {sub && <p className="sub-kpi">{sub}</p>}
    </div>
  );
}

/** Colunas verticais — uma serie, valor sempre visivel em cima da barra. */
export function GraficoColunas({
  dados,
  formatarValor = (v) => "R$ " + compacto(v),
}: {
  dados: { rotulo: string; valor: number }[];
  formatarValor?: (v: number) => string;
}) {
  if (dados.length === 0) return <p className="vazio">Sem dados no período.</p>;
  const max = Math.max(...dados.map((d) => d.valor), 1);
  // colunas estreitas demais pro numero nao quebrar em cima da barra — com
  // muita categoria o rotulo direto fica so no hover (title), como manda a
  // regra de nao rotular tudo quando nao cabe.
  const mostrarValores = dados.length <= 6;
  return (
    <div className="colunas">
      {dados.map((d, i) => (
        <div className="coluna" key={i} title={`${d.rotulo}: ${formatarValor(d.valor)}`}>
          {mostrarValores && (
            <span className="valor-coluna">{d.valor > 0 ? formatarValor(d.valor) : ""}</span>
          )}
          <div className="barra" style={{ height: `${Math.max((d.valor / max) * 100, 2)}%` }} />
          <span className="rotulo-coluna">{d.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

/** Ranking horizontal — nome a esquerda, barra proporcional, valor a direita. */
export function GraficoBarrasHorizontais({
  dados,
  formatarValor = (v) => moeda.format(v),
}: {
  dados: { rotulo: string; valor: number }[];
  formatarValor?: (v: number) => string;
}) {
  if (dados.length === 0) return <p className="vazio">Sem dados no período.</p>;
  const max = Math.max(...dados.map((d) => d.valor), 1);
  return (
    <div className="barras-h">
      {dados.map((d, i) => (
        <div className="barra-h-linha" key={i}>
          <span className="barra-h-nome" title={d.rotulo}>
            {d.rotulo}
          </span>
          <div className="barra-h-trilha">
            <div className="barra-h-fill" style={{ width: `${Math.max((d.valor / max) * 100, 2)}%` }} />
          </div>
          <span className="barra-h-valor">{formatarValor(d.valor)}</span>
        </div>
      ))}
    </div>
  );
}

const LARGURA = 600;
const ALTURA = 200;
const MARGEM = 24;

/** Linha de tendencia (caixa por dia) com cursor + tooltip — muitos pontos pra rotular direto. */
export function GraficoLinha({ dados }: { dados: { data: string; valor: number }[] }) {
  const [ativo, setAtivo] = useState<number | null>(null);

  if (dados.length === 0) return <p className="vazio">Nenhum fechamento de caixa no período.</p>;
  if (dados.length === 1) {
    const unico = dados[0];
    return (
      <p className="vazio">
        Só um fechamento no período: {formatarData(unico.data)} — {moeda.format(unico.valor)}
      </p>
    );
  }

  const valores = dados.map((d) => d.valor);
  const min = Math.min(...valores, 0);
  const max = Math.max(...valores, min + 1);

  const x = (i: number) => MARGEM + (i * (LARGURA - 2 * MARGEM)) / (dados.length - 1);
  const y = (v: number) => ALTURA - MARGEM - ((v - min) / (max - min || 1)) * (ALTURA - 2 * MARGEM);

  const linha = dados.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.valor)}`).join(" ");
  const area = `${linha} L ${x(dados.length - 1)} ${ALTURA - MARGEM} L ${x(0)} ${ALTURA - MARGEM} Z`;

  function moverPonteiro(clientX: number, svg: SVGSVGElement) {
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * LARGURA;
    let melhor = 0;
    let menorDist = Infinity;
    dados.forEach((_, i) => {
      const dist = Math.abs(x(i) - relX);
      if (dist < menorDist) {
        menorDist = dist;
        melhor = i;
      }
    });
    setAtivo(melhor);
  }

  const ponto = ativo !== null ? dados[ativo] : null;

  return (
    <div className="grafico-caixa">
      <svg
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        width="100%"
        height={ALTURA}
        onMouseMove={(e) => moverPonteiro(e.clientX, e.currentTarget)}
        onMouseLeave={() => setAtivo(null)}
        onTouchMove={(e) => e.touches[0] && moverPonteiro(e.touches[0].clientX, e.currentTarget)}
        onTouchEnd={() => setAtivo(null)}
      >
        <line
          x1={MARGEM}
          y1={ALTURA - MARGEM}
          x2={LARGURA - MARGEM}
          y2={ALTURA - MARGEM}
          stroke="var(--verde-linha)"
          strokeWidth={1}
        />
        <path d={area} fill="var(--ambar)" opacity={0.1} stroke="none" />
        <path d={linha} fill="none" stroke="var(--ambar)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {ativo !== null && (
          <>
            <line
              x1={x(ativo)}
              y1={MARGEM}
              x2={x(ativo)}
              y2={ALTURA - MARGEM}
              stroke="var(--creme-fraco)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle
              cx={x(ativo)}
              cy={y(dados[ativo].valor)}
              r={5}
              fill="var(--ambar)"
              stroke="var(--verde-superficie)"
              strokeWidth={2}
            />
          </>
        )}
      </svg>
      {ponto && (
        <div
          className="tooltip-grafico"
          style={{ left: `${(x(ativo!) / LARGURA) * 100}%`, top: `${(y(ponto.valor) / ALTURA) * 100}%` }}
        >
          <span className="rotulo-tt">{formatarData(ponto.data)}</span>{" "}
          <span className="valor">{moeda.format(ponto.valor)}</span>
        </div>
      )}
    </div>
  );
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

export function formatarMes(aaaaMM: string): string {
  const [ano, mes] = aaaaMM.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(mes) - 1]}/${ano.slice(2)}`;
}
