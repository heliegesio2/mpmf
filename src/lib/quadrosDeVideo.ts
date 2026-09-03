/**
 * Extrai quadros (frames) de um arquivo de vídeo no navegador — sem ffmpeg.
 * Carrega o vídeo num <video> escondido, avança o `currentTime` de N em N
 * segundos e desenha cada quadro num canvas → data URL JPEG.
 */

export type QuadroVideo = { t: number; dataUrl: string };

const LADO_MAX = 1100;
const QUALIDADE = 0.72;

export async function extrairQuadros(
  arquivo: File,
  opts?: {
    /** segundos entre quadros (default 2). */
    intervalo?: number;
    /** teto de quadros (default 70). */
    max?: number;
    /** chamado a cada quadro pronto. */
    aoAvancar?: (feitos: number, total: number) => void;
  }
): Promise<QuadroVideo[]> {
  const intervalo = opts?.intervalo ?? 2;
  const max = opts?.max ?? 70;

  const url = URL.createObjectURL(arquivo);
  const v = document.createElement("video");
  v.src = url;
  v.muted = true;
  v.preload = "auto";
  v.playsInline = true;

  try {
    await new Promise<void>((resolve, reject) => {
      v.onloadedmetadata = () => resolve();
      v.onerror = () => reject(new Error("Não consegui abrir esse vídeo."));
      setTimeout(() => reject(new Error("O vídeo demorou demais pra abrir.")), 20000);
    });

    const duracao = Number.isFinite(v.duration) && v.duration > 0 ? v.duration : 0;
    if (!duracao) throw new Error("Vídeo sem duração legível.");

    const escala = Math.min(1, LADO_MAX / Math.max(v.videoWidth, v.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(v.videoWidth * escala);
    canvas.height = Math.round(v.videoHeight * escala);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Não foi possível preparar o vídeo.");

    const tempos: number[] = [];
    for (let t = 0.3; t < duracao && tempos.length < max; t += intervalo) tempos.push(t);

    const quadros: QuadroVideo[] = [];
    for (const t of tempos) {
      await new Promise<void>((resolve) => {
        const done = () => {
          v.onseeked = null;
          resolve();
        };
        v.onseeked = done;
        v.currentTime = t;
        setTimeout(done, 4000);
      });
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      quadros.push({ t: Math.round(t * 10) / 10, dataUrl: canvas.toDataURL("image/jpeg", QUALIDADE) });
      opts?.aoAvancar?.(quadros.length, tempos.length);
    }
    return quadros;
  } finally {
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
  }
}
