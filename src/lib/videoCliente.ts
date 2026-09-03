"use client";

/**
 * Pega quadros de um vídeo no navegador (um por tempo pedido) e devolve como
 * data URL JPEG comprimida — vira a foto do produto no "preço por vídeo".
 * Sem servidor, sem ffmpeg: <video> + <canvas>.
 */

const LADO_MAX = 900;
const QUALIDADE = 0.7;

function desenhar(video: HTMLVideoElement): string | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;
  const escala = Math.min(1, LADO_MAX / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * escala);
  canvas.height = Math.round(h * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", QUALIDADE);
}

/**
 * Pra cada tempo em `tempos` (segundos), devolve o data URL do quadro — ou
 * `null` naquela posição se não deu (tempo inválido, vídeo sem imagem etc).
 */
export async function capturarQuadros(
  arquivo: File,
  tempos: number[]
): Promise<(string | null)[]> {
  const url = URL.createObjectURL(arquivo);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Não consegui abrir o vídeo pra pegar as fotos."));
      setTimeout(() => reject(new Error("O vídeo demorou demais pra carregar.")), 15000);
    });

    const dur = video.duration || 0;
    const saida: (string | null)[] = [];

    for (const t of tempos) {
      if (!Number.isFinite(t) || t < 0) {
        saida.push(null);
        continue;
      }
      const alvo = dur > 0 ? Math.min(Math.max(t, 0), Math.max(0, dur - 0.1)) : t;
      try {
        await new Promise<void>((resolve, reject) => {
          const ok = () => {
            video.onseeked = null;
            resolve();
          };
          video.onseeked = ok;
          video.currentTime = alvo;
          setTimeout(() => reject(new Error("seek")), 8000);
        });
        // um tiquinho pra garantir que o frame renderizou
        await new Promise((r) => setTimeout(r, 60));
        saida.push(desenhar(video));
      } catch {
        saida.push(null);
      }
    }
    return saida;
  } finally {
    video.src = "";
    URL.revokeObjectURL(url);
  }
}
