"use client";

import { useRef, useState } from "react";
import VisorCamera from "@/components/VisorCamera";

type Props = {
  fotos: File[];
  aoMudar: (fotos: File[]) => void;
  /** máximo de fotos (default 6). */
  max?: number;
  aoErro?: (mensagem: string) => void;
};

/**
 * Grade de fotos com um quadradinho "＋" que abre a CÂMERA do aparelho e tira a
 * foto ali mesmo (não abre seletor de arquivo). "ou escolher um arquivo" fica
 * como alternativa embaixo.
 */
export default function CameraFoto({ fotos, aoMudar, max = 6, aoErro }: Props) {
  const [aberta, setAberta] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const cheio = fotos.length >= max;

  function daGaleria(fl: FileList | null) {
    if (!fl) return;
    aoMudar([...fotos, ...Array.from(fl)].slice(0, max));
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="camera-foto">
      <div className="camera-tiles">
        {fotos.map((f, i) => (
          <span className="camera-tile" key={i}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={URL.createObjectURL(f)} alt="" />
            <button
              type="button"
              className="camera-tile-x"
              aria-label="Remover foto"
              onClick={() => aoMudar(fotos.filter((_, k) => k !== i))}
            >
              ✕
            </button>
          </span>
        ))}
        {!cheio && !aberta && (
          <button type="button" className="camera-tile camera-add" onClick={() => setAberta(true)}>
            <span aria-hidden="true">＋</span>
            <small>tirar foto</small>
          </button>
        )}
      </div>

      {aberta && (
        <VisorCamera
          cheio={cheio}
          aoErro={(m) => {
            setAberta(false);
            aoErro?.(m);
            inputRef.current?.click();
          }}
          aoTirar={(f) => aoMudar([...fotos, f].slice(0, max))}
          aoFechar={() => setAberta(false)}
        />
      )}

      <button type="button" className="camera-arquivo" onClick={() => inputRef.current?.click()}>
        ou escolher um arquivo
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => daGaleria(e.target.files)}
      />
    </div>
  );
}
