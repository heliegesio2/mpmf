"use client";

import type { Caixa } from "@/lib/lerEncartePdf";

const carregar = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image();
    el.onload = () => res(el);
    el.onerror = () => rej(new Error("imagem"));
    el.src = src;
  });

/** Recorta a miniatura de um produto a partir da caixa (0..1) que a visão devolveu. */
export async function recortarMiniatura(
  dataUrl: string,
  caixa: Caixa | null,
  ladoMax = 240
): Promise<string> {
  let img: HTMLImageElement;
  try {
    img = await carregar(dataUrl);
  } catch {
    return "";
  }
  const W = img.naturalWidth || img.width;
  const H = img.naturalHeight || img.height;

  let sx = 0;
  let sy = 0;
  let sw = W;
  let sh = H;
  if (caixa) {
    const padX = (caixa.x1 - caixa.x0) * 0.06;
    const padY = (caixa.y1 - caixa.y0) * 0.06;
    sx = Math.max(0, caixa.x0 - padX) * W;
    sy = Math.max(0, caixa.y0 - padY) * H;
    sw = Math.min(1, caixa.x1 + padX) * W - sx;
    sh = Math.min(1, caixa.y1 + padY) * H - sy;
  }
  if (!(sw > 8 && sh > 8)) {
    sx = 0;
    sy = 0;
    sw = W;
    sh = H;
  }

  const escala = Math.min(1, ladoMax / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * escala));
  canvas.height = Math.max(1, Math.round(sh * escala));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}
