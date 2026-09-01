"use client";

import { useId, useRef, useState } from "react";
import { comprimirParaDataURL } from "@/lib/imagemCliente";

type Props = {
  rotulo?: string;
  /** URL ou data URL da foto atual; "" quando não há. */
  preview: string;
  /** Recebe o data URL já reduzido da foto escolhida. */
  aoEscolher: (dataUrl: string) => void;
  /** Quando presente, mostra a opção de tirar a foto. */
  aoRemover?: () => void;
  aoErro?: (mensagem: string) => void;
};

/**
 * Quadradinho de foto do produto: tira pela câmera (ou galeria), mostra a
 * miniatura e deixa trocar/remover. A imagem é reduzida no navegador antes de
 * sair daqui (ver comprimirParaDataURL).
 */
export default function CampoFoto({ rotulo = "Foto", preview, aoEscolher, aoRemover, aoErro }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [ocupado, setOcupado] = useState(false);

  async function selecionado(arquivo: File | undefined) {
    if (!arquivo) return;
    setOcupado(true);
    try {
      aoEscolher(await comprimirParaDataURL(arquivo));
    } catch {
      aoErro?.("Não consegui usar essa foto. Tente outra.");
    } finally {
      setOcupado(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="campo-foto">
      <span className="campo-foto-rotulo">{rotulo}</span>

      <input
        ref={input}
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => selecionado(e.target.files?.[0])}
      />

      {preview ? (
        <div className="campo-foto-tem">
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
        <label htmlFor={id} className="campo-foto-vazio" data-ocupado={ocupado}>
          <span aria-hidden="true">📷</span>
          {ocupado ? "Abrindo…" : "Tirar foto"}
        </label>
      )}
    </div>
  );
}
