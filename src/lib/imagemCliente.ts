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

/**
 * Foto de cadastro de produto: menor que a de visão (não precisa de detalhe
 * pra ler texto, só pra reconhecer o item) e devolvida como data URL, que é o
 * formato guardado na coluna `produto.foto` e usado direto no <img src>.
 */
const MAX_LADO_PRODUTO = 900;
const QUALIDADE_PRODUTO = 0.7;

/**
 * `opts` sobe o teto de tamanho/qualidade — usado no catálogo do fornecedor, que
 * quer a melhor foto possível (`{ maxLado: 1600, qualidade: 0.88 }`).
 */
export async function comprimirParaDataURL(
  arquivo: File,
  opts?: { maxLado?: number; qualidade?: number }
): Promise<string> {
  const maxLado = opts?.maxLado ?? MAX_LADO_PRODUTO;
  const qualidade = opts?.qualidade ?? QUALIDADE_PRODUTO;

  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar a foto.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, largura, altura);

  return canvas.toDataURL("image/jpeg", qualidade);
}

/** Foto de produto do catálogo do fornecedor — resolução e qualidade altas. */
export function comprimirFotoCatalogo(arquivo: File): Promise<string> {
  return comprimirParaDataURL(arquivo, { maxLado: 1600, qualidade: 0.88 });
}
