"use client";

import { useId, useRef, useState } from "react";
import { comprimirParaDataURL } from "@/lib/imagemCliente";

type Props = {
  rotulo?: string;
  /** URL ou data URL da logo atual; "" quando não há. */
  preview: string;
  /** Recebe o data URL já reduzido da logo escolhida. */
  aoEscolher: (dataUrl: string) => void;
  /** Quando presente, mostra a opção de remover a logo. */
  aoRemover?: () => void;
  aoErro?: (mensagem: string) => void;
};

/**
 * Envio de logomarca: um círculo (SVG) escrito "Clique aqui para enviar sua
 * logomarca" que abre o seletor de imagem. Depois de escolhida, o círculo vira
 * a prévia da logo, com "Trocar" e "Remover". A imagem é reduzida no navegador.
 */
export default function CampoLogo({ rotulo = "Logo", preview, aoEscolher, aoRemover, aoErro }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [ocupado, setOcupado] = useState(false);

  async function selecionado(arquivo: File | undefined) {
    if (!arquivo) return;
    setOcupado(true);
    try {
      aoEscolher(await comprimirParaDataURL(arquivo, { maxLado: 600, qualidade: 0.85 }));
    } catch {
      aoErro?.("Não consegui usar essa imagem. Tente outra.");
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="campo-logo">
      <span className="campo-foto-rotulo">{rotulo}</span>

      <input
        ref={input}
        id={id}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => selecionado(e.target.files?.[0])}
      />

      {preview ? (
        <div className="campo-logo-tem">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={rotulo} />
          <div className="campo-foto-acoes">
            <label htmlFor={id} className="botao mini">
              {ocupado ? "Abrindo…" : "Trocar"}
            </label>
            {aoRemover && (
              <button type="button" className="botao mini perigo" onClick={aoRemover}>
                Remover
              </button>
            )}
          </div>
        </div>
      ) : (
        <label htmlFor={id} className="campo-logo-botao" data-ocupado={ocupado} title="Enviar logomarca">
          <svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label="Clique aqui para enviar sua logomarca">
            <circle cx="80" cy="80" r="76" className="campo-logo-circulo" />
            <g className="campo-logo-icone" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M62 52h8l4-6h12l4 6h8a6 6 0 0 1 6 6v22a6 6 0 0 1-6 6H62a6 6 0 0 1-6-6V58a6 6 0 0 1 6-6z" />
              <circle cx="80" cy="69" r="7" />
            </g>
            <text x="80" y="108" textAnchor="middle" className="campo-logo-titulo">
              {ocupado ? "Abrindo…" : "Clique aqui"}
            </text>
            <text x="80" y="124" textAnchor="middle" className="campo-logo-texto">
              para enviar sua
            </text>
            <text x="80" y="138" textAnchor="middle" className="campo-logo-texto">
              logomarca
            </text>
          </svg>
        </label>
      )}
    </div>
  );
}
