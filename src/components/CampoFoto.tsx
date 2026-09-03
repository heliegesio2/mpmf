"use client";

import { useId, useRef, useState } from "react";
import VisorCamera from "@/components/VisorCamera";
import { comprimirFotoCatalogo, comprimirParaDataURL } from "@/lib/imagemCliente";

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
  /** Endpoint de identificação de nome (padrão: da loja). */
  urlIdentificar?: string;
  /**
   * Por padrão o seletor sugere a câmera (`capture`). Passe `semCaptura` pra
   * abrir o seletor normal (galeria + câmera) — útil pra foto de perfil.
   */
  semCaptura?: boolean;
  /** Guarda a foto em resolução/qualidade altas (catálogo do fornecedor). */
  alta?: boolean;
  /**
   * Abre a CÂMERA do aparelho (getUserMedia) em vez do seletor de arquivo. O
   * link "ou escolher um arquivo" continua como alternativa.
   */
  camera?: boolean;
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
  urlIdentificar = "/api/produtos/identificar-foto",
  semCaptura,
  alta,
  camera,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const [ocupado, setOcupado] = useState(false);
  const [identificando, setIdentificando] = useState(false);
  const [visor, setVisor] = useState(false);

  async function selecionado(arquivo: File | undefined) {
    if (!arquivo) return;
    setOcupado(true);
    let dataUrl = "";
    try {
      dataUrl = alta ? await comprimirFotoCatalogo(arquivo) : await comprimirParaDataURL(arquivo);
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
        const r = await fetch(urlIdentificar, {
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
            {camera ? (
              <button type="button" className="botao mini" onClick={() => setVisor(true)}>
                {ocupado ? "Abrindo…" : "Trocar"}
              </button>
            ) : (
              <label htmlFor={id} className="botao mini">
                {ocupado ? "Abrindo…" : "Trocar"}
              </label>
            )}
            {aoRemover && (
              <button type="button" className="botao mini perigo" onClick={aoRemover}>
                Remover
              </button>
            )}
          </div>
        </div>
      ) : camera ? (
        <button
          type="button"
          className="campo-foto-vazio"
          data-ocupado={ocupado}
          onClick={() => setVisor(true)}
        >
          <span aria-hidden="true">📷</span>
          {ocupado ? "Abrindo…" : "Tirar foto"}
        </button>
      ) : (
        <label htmlFor={id} className="campo-foto-vazio" data-ocupado={ocupado}>
          <span aria-hidden="true">📷</span>
          {ocupado ? "Abrindo…" : semCaptura ? "Tirar ou enviar foto" : "Tirar foto"}
        </label>
      )}

      {camera && (
        <button type="button" className="camera-arquivo" onClick={() => input.current?.click()}>
          ou escolher um arquivo
        </button>
      )}

      {visor && (
        <VisorCamera
          aoErro={(m) => {
            setVisor(false);
            aoErro?.(m);
          }}
          aoTirar={(f) => {
            setVisor(false);
            selecionado(f);
          }}
          aoFechar={() => setVisor(false)}
        />
      )}

      {identificando && <span className="campo-foto-dica">Lendo a foto…</span>}
    </div>
  );
}
