"use client";

import { useVoz } from "@/lib/useVoz";

type Props = {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  "aria-label"?: string;
};

/** Campo de filtro de lista com microfone — padrão do projeto. */
export default function FiltroVoz({ valor, aoMudar, placeholder, ...resto }: Props) {
  const { ouvir, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      if (campoAtual.current === "filtro") aoMudar(texto);
    },
    aoErrar: () => {},
  });

  return (
    <div className="campo simples">
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={placeholder}
        aria-label={resto["aria-label"] ?? placeholder}
        autoComplete="off"
      />
      <button
        type="button"
        className="mic-campo"
        data-ouvindo={ouvindoCampo === "filtro"}
        disabled={!disponivel}
        onClick={() => ouvir("filtro")}
        aria-label="Falar o filtro"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
