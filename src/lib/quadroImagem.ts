/**
 * Utilitários de servidor pra lidar com quadros de vídeo capturados no cliente
 * (`GravadorVideo`) e enviados como data URL — compartilhado entre as rotas
 * que aceitam vídeo como alternativa à foto (estoque por vídeo, importar
 * compra por vídeo).
 */

import type { ImagemEntrada } from "@/lib/lerEstoqueFoto";

/** "data:image/jpeg;base64,AAAA..." -> { base64, mediaType }. null se não bater o formato. */
export function quadroParaImagem(dataUrl: string): ImagemEntrada | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { mediaType: m[1] as ImagemEntrada["mediaType"], base64: m[2] };
}

/** Escolhe até `max` itens espalhados uniformemente (ex.: quadros de um vídeo). */
export function amostrarUniforme<T>(itens: T[], max: number): T[] {
  if (itens.length <= max) return itens;
  const passo = itens.length / max;
  return Array.from({ length: max }, (_, i) => itens[Math.floor(i * passo)]);
}
