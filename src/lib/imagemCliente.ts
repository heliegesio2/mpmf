/**
 * Reduz uma foto tirada no celular antes de subir — direto da camera costuma
 * vir grande demais pro limite de corpo de requisicao da hospedagem, e imagem
 * maior tambem custa mais tokens de visao sem ganho real de leitura.
 */

const MAX_LADO = 1800;
const QUALIDADE_JPEG = 0.85;

export async function comprimirImagem(arquivo: File, nomeSaida = "foto.jpg"): Promise<File> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) return arquivo;
  ctx.drawImage(bitmap, 0, 0, largura, altura);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALIDADE_JPEG)
  );
  if (!blob) return arquivo;
  return new File([blob], nomeSaida, { type: "image/jpeg" });
}
