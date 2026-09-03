"use client";

/**
 * Rasteriza um PDF em imagens JPEG (uma por página) no navegador, com pdf.js.
 * Usado no módulo "Comércios grandes" pra ler o encarte por visão E poder
 * recortar a miniatura de cada produto depois.
 */

const LARGURA_ALVO = 1500;
const QUALIDADE = 0.82;

export async function pdfParaImagens(
  arquivo: File,
  opts?: { maxPaginas?: number; aoAvancar?: (feitas: number, total: number) => void }
): Promise<string[]> {
  const maxPaginas = opts?.maxPaginas ?? 8;

  const pdfjs = await import("pdfjs-dist");
  // worker no mesmo bundle (Next resolve o asset)
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const buffer = await arquivo.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;
  const total = Math.min(doc.numPages, maxPaginas);
  const imagens: string[] = [];

  for (let p = 1; p <= total; p++) {
    const pagina = await doc.getPage(p);
    const base = pagina.getViewport({ scale: 1 });
    const escala = Math.min(2.5, LARGURA_ALVO / base.width);
    const viewport = pagina.getViewport({ scale: escala });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;

    await pagina.render({ canvasContext: ctx, viewport }).promise;
    imagens.push(canvas.toDataURL("image/jpeg", QUALIDADE));
    opts?.aoAvancar?.(imagens.length, total);
    pagina.cleanup();
  }

  doc.destroy();
  return imagens;
}
