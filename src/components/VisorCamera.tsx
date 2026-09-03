"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  /** Recebe cada foto tirada como File JPEG. */
  aoTirar: (foto: File) => void;
  aoFechar: () => void;
  aoErro?: (mensagem: string) => void;
  /** Desliga o botão de tirar (ex.: já chegou no limite de fotos). */
  cheio?: boolean;
};

const LADO_MAX = 1600;

/**
 * Visor da câmera do aparelho (getUserMedia, traseira por padrão): preview ao
 * vivo + "Tirar foto" que devolve um File. Cuida de ligar/desligar o stream.
 */
export default function VisorCamera({ aoTirar, aoFechar, aoErro, cheio }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [frontal, setFrontal] = useState(false);
  const [pronto, setPronto] = useState(false);

  const desligar = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const ligar = useCallback(
    async (usarFrontal: boolean) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        aoErro?.("Este navegador não abre a câmera.");
        aoFechar();
        return;
      }
      desligar();
      setPronto(false);
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: usarFrontal ? "user" : { ideal: "environment" } },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPronto(true);
      } catch {
        aoErro?.("Não consegui abrir a câmera. Libere a permissão ou escolha um arquivo.");
        aoFechar();
      }
    },
    [aoErro, aoFechar, desligar]
  );

  useEffect(() => {
    ligar(false);
    return () => desligar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tirar() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const escala = Math.min(1, LADO_MAX / Math.max(v.videoWidth, v.videoHeight));
    const w = Math.round(v.videoWidth * escala);
    const h = Math.round(v.videoHeight * escala);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (blob) aoTirar(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9
    );
  }

  return (
    <div className="camera-visor">
      <video ref={videoRef} playsInline muted />
      <div className="camera-acoes">
        <button type="button" className="botao primario" onClick={tirar} disabled={!pronto || cheio}>
          📷 Tirar foto
        </button>
        <button
          type="button"
          className="botao mini"
          onClick={() => {
            const p = !frontal;
            setFrontal(p);
            ligar(p);
          }}
        >
          Virar câmera
        </button>
        <button
          type="button"
          className="botao mini perigo"
          onClick={() => {
            desligar();
            aoFechar();
          }}
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
