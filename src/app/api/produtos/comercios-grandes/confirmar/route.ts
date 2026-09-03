import { NextResponse } from "next/server";
import { criarProduto } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type ItemNovo = {
  nome?: string;
  precoCompra?: number;
  preco?: number;
  foto?: string;
};

const ok = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** POST /api/produtos/comercios-grandes/confirmar { itens } -> cria os produtos. */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const { itens } = (await request.json()) as { itens?: ItemNovo[] };
    if (!Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json({ erro: "Nenhum produto para salvar." }, { status: 400 });
    }

    // valida tudo antes de criar qualquer coisa
    const invalido = itens.find((it) => {
      const nome = String(it.nome ?? "").trim();
      return nome.length < 2 || !ok(it.preco) || it.preco <= 0;
    });
    if (invalido) {
      const nome = String(invalido.nome ?? "").trim();
      return NextResponse.json(
        { erro: nome.length < 2 ? "Produto sem nome válido." : `Informe o preço de "${nome}".` },
        { status: 400 }
      );
    }

    const validos = itens.map((it) => {
      const nome = String(it.nome ?? "").trim();
      return {
        nome,
        unidade: "unidade",
        tipoVenda: "unidade",
        preco: Number(it.preco),
        precoCompra: ok(it.precoCompra) ? it.precoCompra : 0,
        estoque: 0,
        foto:
          typeof it.foto === "string" && it.foto.startsWith("data:image/") ? it.foto : undefined,
      };
    });

    let criados = 0;
    for (const v of validos) {
      await criarProduto(empresaId, v);
      criados += 1;
    }

    return NextResponse.json({ criados });
  } catch (e) {
    console.error("Falha ao salvar produtos do vídeo:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível salvar.", detalhe }, { status: 500 });
  }
}
