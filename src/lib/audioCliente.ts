"use client";

/**
 * Tira o áudio de um vídeo no próprio navegador e devolve um WAV pequeno
 * (16 kHz, mono, 16-bit) pra mandar pro serviço de transcrição — sem ffmpeg,
 * sem subir o vídeo inteiro (que estoura o limite de corpo do serverless).
 *
 * Corta em ~140 s: 140 s × 16000 × 2 bytes ≈ 4,3 MB, dentro do limite.
 */

const TAXA_ALVO = 16000;
export const MAX_SEGUNDOS = 140;

function wavDeAudioBuffer(buffer: AudioBuffer): Blob {
  const dados = buffer.getChannelData(0);
  const bytes = dados.length * 2;
  const ab = new ArrayBuffer(44 + bytes);
  const view = new DataView(ab);

  const escreverTexto = (offset: number, texto: string) => {
    for (let i = 0; i < texto.length; i++) view.setUint8(offset + i, texto.charCodeAt(i));
  };

  escreverTexto(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  escreverTexto(8, "WAVE");
  escreverTexto(12, "fmt ");
  view.setUint32(16, 16, true); // tamanho do bloco fmt
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits por amostra
  escreverTexto(36, "data");
  view.setUint32(40, bytes, true);

  let offset = 44;
  for (let i = 0; i < dados.length; i++) {
    const s = Math.max(-1, Math.min(1, dados[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([ab], { type: "audio/wav" });
}

export async function extrairAudioWav(
  arquivo: Blob
): Promise<{ blob: Blob; segundos: number; cortado: boolean }> {
  const Ctx =
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("Este navegador não consegue processar o áudio. Use o Chrome.");

  const ctx = new Ctx();
  let bruto: AudioBuffer;
  try {
    bruto = await ctx.decodeAudioData(await arquivo.arrayBuffer());
  } catch {
    throw new Error("Não consegui ler o áudio desse vídeo. Grave de novo ou tente outro arquivo.");
  } finally {
    ctx.close();
  }

  const cortado = bruto.duration > MAX_SEGUNDOS;
  const segundos = Math.min(bruto.duration, MAX_SEGUNDOS);
  const frames = Math.max(1, Math.ceil(segundos * TAXA_ALVO));

  const off = new OfflineAudioContext(1, frames, TAXA_ALVO);
  const src = off.createBufferSource();
  src.buffer = bruto;
  src.connect(off.destination);
  src.start(0);
  const render = await off.startRendering();

  return { blob: wavDeAudioBuffer(render), segundos, cortado };
}
