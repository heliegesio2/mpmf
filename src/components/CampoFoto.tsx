"use client";

import { useId, useRef, useState } from "react";
import { comprimirParaDataURL } from "@/lib/imagemCliente";

type Props = {
  rotulo?: string;
  /** URL ou data URL da foto atual; "" quando não há. */
  preview: string;
  /** Recebe o data URL já reduzido da foto escolhida. */
  aoEscolher: (dataUrl: string) => void;
  /** Quando presente, mostra a opção de remover a foto. */
  aoRemover?: () => void;
  aoErro?: (mensagem: string) => void;
  /**
   * Quando presente, manda a foto pra IA identificar o produto e devolve o
   * nome sugerido (só chama se vier nome; falha é silenciosa).
   */
  aoIdentificarNome?: (nome: string) => void;
  /**
   * Por padrão o seletor sugere a câmera (`capture`). Passe `semCaptura` pra
   * abrir o seletor normal (galeria + câmera) — útil pra foto de perfil.
   */
  semCaptura?: boolean;
};

/**
 * Quadradinho de foto do produto: tira pela câmera (ou galeria), mostra a
 * miniatura e deixa trocar/remover. A imagem é reduzida no navegador antes de
 * sair daqui (ver comprimirParaDataURL).
 */
export default function CampoFoto({
  rotulo = "Foto",
  preview,
  aoEscolher,
  aoRemover,
  aoErro,
  aoIdentificarNome,
  semCaptura,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [ocupado, setOcupado] = useState(false);
  const [identificando, setIdentificando] = useState(false);

  async function selecionado(arquivo: File | undefined) {
    if (!arquivo) return;
    setOcupado(true);
    let dataUrl = "";
    try {
      dataUrl = await comprimirParaDataURL(arquivo);
      aoEscolher(dataUrl);
    } catch {
      aoErro?.("Não consegui usar essa foto. Tente outra.");
      setOcupado(false);
      if (input.current) input.current.value = "";
      return;
    }
    setOcupado(false);
    if (input.current) input.current.value = "";

    if (aoIdentificarNome && dataUrl) {
      setIdentificando(true);
      try {
        const r = await fetch("/api/produtos/identificar-foto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ foto: dataUrl }),
        });
        const dados = await r.json();
        if (r.ok && typeof dados.nome === "string" && dados.nome.trim()) {
          aoIdentificarNome(dados.nome.trim());
        }
      } catch {
        /* identificação é um plus; sem ela o lojista digita o nome */
      } finally {
        setIdentificando(false);
      }
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
        {...(semCaptura ? {} : { capture: "environment" as const })}
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
          {ocupado ? "Abrindo…" : semCaptura ? "Tirar ou enviar foto" : "Tirar foto"}
        </label>
      )}

      {identificando && <span className="campo-foto-dica">Lendo a foto pra sugerir o nome…</span>}
    </div>
  );
}
