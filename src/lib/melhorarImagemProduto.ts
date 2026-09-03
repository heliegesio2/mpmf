/**
 * Melhora a foto de um produto do fornecedor: remove o fundo e devolve a imagem
 * com fundo branco limpo, pro catálogo ficar consistente.
 *
 * Usa a API do remove.bg (`REMOVEBG_API_KEY`). Sem a chave — ou em qualquer
 * falha — devolve a mesma imagem que entrou (o `<CampoFoto>` já reduziu e
 * normalizou no navegador), então o fluxo nunca quebra por causa disso.
 *
 * `bg_color=ffffff` faz o próprio remove.bg compor o fundo branco, então não
 * precisa de `sharp`/canvas no servidor. Pra trocar por outro provedor
 * (Photoroom `/v1/segment` tem a mesma forma), é só mudar esta função.
 */

const ENDPOINT = "https://api.remove.bg/v1.0/removebg";

export async function melhorarFotoProduto(dataUrl: string): Promise<{ foto: string; melhorada: boolean }> {
  const chave = process.env.REMOVEBG_API_KEY;
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(dataUrl ?? "");
  if (!chave || !m) return { foto: dataUrl, melhorada: false };

  try {
    const form = new FormData();
    form.set("image_file_b64", m[2]);
    form.set("size", "auto");
    form.set("bg_color", "ffffff");
    form.set("format", "jpg");

    const r = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "X-Api-Key": chave },
      body: form,
    });
    if (!r.ok) {
      console.error("remove.bg respondeu", r.status, await r.text().catch(() => ""));
      return { foto: dataUrl, melhorada: false };
    }
    const bytes = Buffer.from(await r.arrayBuffer());
    return { foto: `data:image/jpeg;base64,${bytes.toString("base64")}`, melhorada: true };
  } catch (e) {
    console.error("Falha ao melhorar a foto do produto:", e);
    return { foto: dataUrl, melhorada: false };
  }
}
