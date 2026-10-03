"use client";

import { MAX_CORES } from "@/lib/cores";

type Props = {
  rotulo?: string;
  valor: string[];
  aoMudar: (cores: string[]) => void;
};

const COR_INICIAL = "#1d4ed8";

/**
 * Lista de cores preferenciais: cada cor é um quadradinho clicável (seletor de
 * cor do aparelho), com "✕" pra tirar, e "+ Adicionar cor" pra incluir outra.
 */
export default function CampoCores({ rotulo = "Cores preferenciais", valor, aoMudar }: Props) {
  function trocar(i: number, cor: string) {
    aoMudar(valor.map((c, k) => (k === i ? cor.toLowerCase() : c)));
  }

  return (
    <div className="campo-cores">
      <span className="campo-foto-rotulo">{rotulo}</span>
      <ul className="campo-cores-lista">
        {valor.map((cor, i) => (
          <li key={i} className="campo-cores-item">
            <input
              type="color"
              value={cor}
              onChange={(e) => trocar(i, e.target.value)}
              aria-label={`Cor ${i + 1}`}
              title="Clique para escolher a cor"
            />
            <code>{cor}</code>
            <button
              type="button"
              className="botao mini perigo"
              onClick={() => aoMudar(valor.filter((_, k) => k !== i))}
              aria-label={`Remover cor ${i + 1}`}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {valor.length < MAX_CORES && (
        <button type="button" className="botao mini" onClick={() => aoMudar([...valor, COR_INICIAL])}>
          + Adicionar cor
        </button>
      )}
      {valor.length === 0 && <p className="dica">Nenhuma cor escolhida (opcional).</p>}
    </div>
  );
}
