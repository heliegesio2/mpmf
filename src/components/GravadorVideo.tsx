"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type Quadro = { t: number; dataUrl: string };
export type ResultadoGravacao = { blob: Blob; quadros: Quadro[]; segundos: number };

type Props = {
  maxSegundos: number;
  aoGravar: (r: ResultadoGravacao) => void;
  aoErro: (mensagem: string) => void;
  /** desliga os botões enquanto a página processa o vídeo anterior. */
  ocupado?: boolean;
};

const LADO_QUADRO = 720;
const INTERVALO_QUADRO_MS = 1500;

function mmss(seg: number): string {
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Botão "gravar vídeo" que abre a câmera do aparelho (traseira, com áudio),
 * mostra o preview, grava e — durante a gravação — vai pegando quadros pra
 * virar a foto de cada produto depois. Nada é enviado aqui; devolve o blob
 * do vídeo + os quadros pra página.
 */
export default function GravadorVideo({ maxSegundos, aoGravar, aoErro, ocupado }: Props) {
  const [estado, setEstado] = useState<"parado" | "abrindo" | "pronto" | "gravando">("parado");
  const [segundos, setSegundos] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const quadrosRef = useRef<Quadro[]>([]);
  const t0Ref = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const desligarCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const limparTimers = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (frameRef.current) clearInterval(frameRef.current);
    tickRef.current = null;
    frameRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      limparTimers();
      desligarCamera();
    };
  }, [limparTimers, desligarCamera]);

  async function abrirCamera() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      aoErro("Este navegador não grava vídeo. Abra no Chrome do celular.");
      return;
    }
    setEstado("abrindo");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setEstado("pronto");
    } catch {
      setEstado("parado");
      aoErro("Não consegui acessar a câmera e o microfone. Libere a permissão e tente de novo.");
    }
  }

  function pegarQuadro() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const esc = Math.min(1, LADO_QUADRO / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * esc);
    canvas.height = Math.round(v.videoHeight * esc);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    quadrosRef.current.push({
      t: (Date.now() - t0Ref.current) / 1000,
      dataUrl: canvas.toDataURL("image/jpeg", 0.6),
    });
  }

  function finalizar() {
    limparTimers();
    const tipo = chunksRef.current[0]?.type || "video/webm";
    const blob = new Blob(chunksRef.current, { type: tipo });
    const dur = (Date.now() - t0Ref.current) / 1000;
    desligarCamera();
    setEstado("parado");
    setSegundos(0);
    if (blob.size > 0) aoGravar({ blob, quadros: quadrosRef.current, segundos: dur });
    else aoErro("A gravação saiu vazia. Tente de novo.");
  }

  function iniciarGravacao() {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    quadrosRef.current = [];
    t0Ref.current = Date.now();

    const tipos = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    const mime = tipos.find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = finalizar;
    recRef.current = rec;
    rec.start();

    setEstado("gravando");
    setSegundos(0);
    pegarQuadro();
    frameRef.current = setInterval(pegarQuadro, INTERVALO_QUADRO_MS);
    tickRef.current = setInterval(() => {
      setSegundos((x) => {
        const n = x + 1;
        if (n >= maxSegundos) pararGravacao();
        return n;
      });
    }, 1000);
  }

  function pararGravacao() {
    limparTimers();
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }

  return (
    <div className="gravador-video">
      <div className="gravador-tela" data-ativo={estado === "pronto" || estado === "gravando"}>
        <video ref={videoRef} muted playsInline />
        {estado === "gravando" && (
          <span className="gravador-tempo">
            ● {mmss(segundos)} / {mmss(maxSegundos)}
          </span>
        )}
      </div>

      <div className="acoes">
        {estado === "parado" && (
          <button type="button" className="botao primario" onClick={abrirCamera} disabled={ocupado}>
            🎥 Gravar vídeo
          </button>
        )}
        {estado === "abrindo" && (
          <button type="button" className="botao neutro" disabled>
            Abrindo a câmera…
          </button>
        )}
        {estado === "pronto" && (
          <>
            <button type="button" className="botao primario" onClick={iniciarGravacao} disabled={ocupado}>
              ● Começar a gravar
            </button>
            <button type="button" className="botao neutro" onClick={desligarCamera}>
              Fechar câmera
            </button>
          </>
        )}
        {estado === "gravando" && (
          <button type="button" className="botao perigo" onClick={pararGravacao}>
            ■ Parar e usar
          </button>
        )}
      </div>
    </div>
  );
}
