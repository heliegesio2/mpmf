import { NextResponse } from "next/server";
import { criarPassivo, listarPassivos } from "@/lib/db";
import { lerEntradaPassivo } from "@/lib/passivo";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

const MAX_LOTE = 60;

/** GET /api/passivos -> o levantamento de passivos da empresa. */
export async function GET() {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;
  try {
    return NextResponse.json({ itens: await listarPassivos(empresaId) });
  } catch (e) {
    console.error("Falha ao listar passivos:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível carregar.", detalhe }, { status: 500 });
  }
}

/**
 * POST /api/passivos
 *  - um bem: `{ nome, categoria, quantidade, descricao, valorEstimado, foto, origem }`
 *  - vários (confirmação do levantamento por foto/vídeo): `{ itens: [ ... ] }`
 */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const corpo = (await request.json()) as Record<string, unknown>;
    const brutos = Array.isArray(corpo.itens) ? (corpo.itens as Record<string, unknown>[]) : [corpo];
    if (brutos.length === 0 || brutos.length > MAX_LOTE) {
      return NextResponse.json({ erro: `Envie de 1 a ${MAX_LOTE} itens.` }, { status: 400 });
    }

    const entradas = [];
    for (const b of brutos) {
      const e = lerEntradaPassivo(b ?? {});
      if ("erro" in e) return NextResponse.json({ erro: e.erro }, { status: 400 });
      entradas.push(e);
    }

    const criados = [];
    for (const e of entradas) criados.push(await criarPassivo(empresaId, e));
    return NextResponse.json({ itens: criados }, { status: 201 });
  } catch (e) {
    console.error("Falha ao salvar passivo:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível salvar.", detalhe }, { status: 500 });
  }
}
