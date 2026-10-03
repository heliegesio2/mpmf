/**
 * Passivo = os bens fixos da empresa que NÃO são mercadoria (banca, cofre,
 * congelador, balcão…) — o levantamento do que a loja possui. Helpers puros
 * (sem `pg`, sem DOM), usados pelas rotas e pelas telas.
 */

export const CATEGORIAS_PASSIVO = [
  { valor: "banca", rotulo: "Banca / bancada", icone: "🏪", dica: "banca de jornal/feira, bancada, tenda, quiosque" },
  { valor: "cofre", rotulo: "Cofre", icone: "🔐", dica: "cofre, caixa-forte, gaveta de segurança" },
  { valor: "congelador", rotulo: "Congelador / freezer", icone: "❄️", dica: "freezer horizontal ou vertical, conservador de sorvete" },
  { valor: "geladeira", rotulo: "Geladeira / expositor refrigerado", icone: "🧊", dica: "geladeira, cervejeira, expositor refrigerado, balcão frigorífico" },
  { valor: "balcao", rotulo: "Balcão / expositor", icone: "🗄️", dica: "balcão de atendimento, vitrine, expositor, caixa de vidro" },
  { valor: "prateleira", rotulo: "Prateleira / gôndola", icone: "📚", dica: "gôndola, prateleira, estante, arara, display" },
  { valor: "caixa", rotulo: "Caixa registradora / PDV", icone: "🧾", dica: "caixa registradora, terminal de venda, maquininha de cartão, gaveta de dinheiro" },
  { valor: "computador", rotulo: "Computador / eletrônico", icone: "💻", dica: "computador, notebook, tablet, celular, monitor, TV, som" },
  { valor: "impressora", rotulo: "Impressora / leitor", icone: "🖨️", dica: "impressora de cupom/etiqueta, leitor de código de barras" },
  { valor: "balanca", rotulo: "Balança", icone: "⚖️", dica: "balança de balcão, de chão, de precisão" },
  { valor: "ar_condicionado", rotulo: "Ar-condicionado / ventilador", icone: "🌬️", dica: "ar-condicionado, ventilador, exaustor" },
  { valor: "camera", rotulo: "Câmera / alarme", icone: "📹", dica: "câmeras de segurança, DVR, alarme, cerca elétrica" },
  { valor: "mobiliario", rotulo: "Mobiliário", icone: "🪑", dica: "mesa, cadeira, banco, armário, bebedouro" },
  { valor: "veiculo", rotulo: "Veículo", icone: "🚚", dica: "carro, moto, bicicleta de entrega, carrinho de carga, paleteira" },
  { valor: "maquina", rotulo: "Máquina / equipamento", icone: "⚙️", dica: "fatiador, moedor, forno, chapa, liquidificador industrial, máquina de gelo/sorvete" },
  { valor: "outros", rotulo: "Outros", icone: "📦", dica: "qualquer outro bem que não seja mercadoria pra venda" },
] as const;

export type CategoriaPassivo = (typeof CATEGORIAS_PASSIVO)[number]["valor"];

export function categoriaValida(v: unknown): v is CategoriaPassivo {
  return CATEGORIAS_PASSIVO.some((c) => c.valor === v);
}

export function infoCategoria(v: string) {
  return CATEGORIAS_PASSIVO.find((c) => c.valor === v) ?? CATEGORIAS_PASSIVO[CATEGORIAS_PASSIVO.length - 1];
}

export type PassivoEntrada = {
  nome: string;
  categoria: CategoriaPassivo;
  quantidade: number;
  descricao: string | null;
  valorEstimado: number | null;
  /** tri-state: undefined mantém, "" limpa, data URL troca. */
  foto?: string;
  origem: "manual" | "foto" | "video";
};

const LIMITE_FOTO = 1_500_000; // caracteres do data URL

/** Valida/normaliza um passivo vindo do corpo de uma requisição. */
export function lerEntradaPassivo(c: Record<string, unknown>): PassivoEntrada | { erro: string } {
  const nome = String(c.nome ?? "").trim().slice(0, 120);
  if (nome.length < 2) return { erro: "Informe o nome do bem." };

  const qtd = Math.round(Number(c.quantidade ?? 1));
  if (!Number.isInteger(qtd) || qtd < 1 || qtd > 9999) return { erro: "Quantidade inválida." };

  const valorBruto = c.valorEstimado;
  let valorEstimado: number | null = null;
  if (valorBruto !== null && valorBruto !== undefined && valorBruto !== "") {
    const n = Number(valorBruto);
    if (!Number.isFinite(n) || n < 0) return { erro: "Valor estimado inválido." };
    valorEstimado = Math.round(n * 100) / 100;
  }

  const foto = c.foto;
  if (
    foto !== undefined &&
    foto !== "" &&
    !(typeof foto === "string" && foto.startsWith("data:image/") && foto.length <= LIMITE_FOTO)
  ) {
    return { erro: "Foto inválida ou grande demais." };
  }

  return {
    nome,
    categoria: categoriaValida(c.categoria) ? c.categoria : "outros",
    quantidade: qtd,
    descricao: String(c.descricao ?? "").trim().slice(0, 300) || null,
    valorEstimado,
    foto: foto as string | undefined,
    origem: c.origem === "foto" || c.origem === "video" ? c.origem : "manual",
  };
}
