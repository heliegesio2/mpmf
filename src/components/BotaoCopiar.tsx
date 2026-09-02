"use client";

import { useState } from "react";

type Props = {
  texto: string;
  /** Texto do aria-label / title (ex.: "Copiar telefone"). */
  titulo?: string;
  /** Mostra um rótulo ao lado do ícone. */
  rotulo?: string;
};

const IconeCopiar = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const IconeOk = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 13l4 4 10-11" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Botãozinho de copiar para a área de transferência, com feedback rápido. */
export default function BotaoCopiar({ texto, titulo = "Copiar", rotulo }: Props) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      /* clipboard bloqueado — o usuário seleciona na mão */
    }
  }

  return (
    <button
      type="button"
      className="botao-copiar"
      data-copiado={copiado}
      onClick={copiar}
      aria-label={titulo}
      title={titulo}
    >
      {copiado ? IconeOk : IconeCopiar}
      {rotulo && <span>{copiado ? "Copiado!" : rotulo}</span>}
    </button>
  );
}
