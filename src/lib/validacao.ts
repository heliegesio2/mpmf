import type { ProdutoEntrada } from "./db";
import { TIPOS_VENDA } from "./tipos";

const VALORES = TIPOS_VENDA.map((t) => t.valor as string);

/** Aceita "4,50" e "4.50" — o formulario usa virgula. */
function numero(v: unknown): number {
  return Number(String(v ?? "").trim().replace(",", "."));
}

/** Valida o corpo vindo do formulario antes de tocar no banco. */
export function validar(corpo: unknown): { dados?: ProdutoEntrada; erro?: string } {
  if (typeof corpo !== "object" || corpo === null) {
    return { erro: "Envie os dados do produto." };
  }

  const c = corpo as Record<string, unknown>;
  const nome = String(c.nome ?? "").trim();
  const preco = numero(c.preco);
  const precoCompra = numero(c.precoCompra ?? 0);
  const estoque = numero(c.estoque);
  const tipoVenda = String(c.tipoVenda ?? "unidade");

  if (nome.length < 2) return { erro: "O nome precisa ter ao menos 2 letras." };
  if (!Number.isFinite(preco) || preco < 0) return { erro: "Informe um preço de venda válido." };
  if (!Number.isFinite(precoCompra) || precoCompra < 0) {
    return { erro: "Informe um preço de compra válido." };
  }
  if (!Number.isFinite(estoque) || estoque < 0) return { erro: "Informe uma quantidade válida." };
  if (!VALORES.includes(tipoVenda)) return { erro: "Escolha unidade, quilo ou dúzia." };

  // aviso de estoque baixo: opcional. vazio/ausente = sem aviso próprio.
  const temMinimo =
    c.estoqueMinimo !== undefined && c.estoqueMinimo !== null && String(c.estoqueMinimo).trim() !== "";
  const estoqueMinimo = temMinimo ? numero(c.estoqueMinimo) : null;
  if (estoqueMinimo !== null && (!Number.isFinite(estoqueMinimo) || estoqueMinimo < 0)) {
    return { erro: "Informe um valor válido para o aviso de estoque baixo." };
  }
  const estoqueMinimoEmbalagem =
    estoqueMinimo !== null && c.estoqueMinimoEmbalagem
      ? String(c.estoqueMinimoEmbalagem).trim() || null
      : null;

  // preço da embalagem inteira (fardo/caixa...): opcional. vazio/ausente = null.
  const temPrecoEmb =
    c.precoEmbalagem !== undefined && c.precoEmbalagem !== null && String(c.precoEmbalagem).trim() !== "";
  const precoEmbalagem = temPrecoEmb ? numero(c.precoEmbalagem) : null;
  if (precoEmbalagem !== null && (!Number.isFinite(precoEmbalagem) || precoEmbalagem < 0)) {
    return { erro: "Informe um preço de embalagem válido." };
  }

  // foto: opcional. ausente/undefined = não mexe; "" = remove; senão precisa
  // ser um data URL de imagem e caber num limite razoável (o cliente já reduz).
  const MAX_FOTO = 3_000_000; // ~2,2 MB de imagem depois do base64
  let foto: string | undefined;
  if (c.foto !== undefined && c.foto !== null) {
    const bruta = String(c.foto);
    if (bruta === "") {
      foto = "";
    } else if (!/^data:image\/(jpe?g|png|webp);base64,/.test(bruta)) {
      return { erro: "Foto em formato não suportado." };
    } else if (bruta.length > MAX_FOTO) {
      return { erro: "A foto ficou grande demais. Tente de novo." };
    } else {
      foto = bruta;
    }
  }

  return {
    dados: {
      nome,
      categoria: c.categoria ? String(c.categoria).trim() : null,
      local: c.local ? String(c.local).trim() : null,
      unidade: String(c.unidade ?? "").trim() || "unidade",
      tipoVenda,
      preco,
      precoCompra,
      estoque,
      estoqueMinimo,
      estoqueMinimoEmbalagem,
      precoEmbalagem,
      ...(foto !== undefined ? { foto } : {}),
    },
  };
}
