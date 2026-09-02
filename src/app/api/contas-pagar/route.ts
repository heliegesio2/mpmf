import { NextResponse } from "next/server";
import { listarContasPagar, criarContaPagar, categoriasContaPagarUsadas } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

const SITUACOES = new Set(["abertas", "pagas", "todas"]);

/** GET /api/contas-pagar?situacao=abertas|pagas|todas */
export async function GET(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const s = new URL(request.url).searchParams.get("situacao") ?? "abertas";
  const situacao = (SITUACOES.has(s) ? s : "abertas") as "abertas" | "pagas" | "todas";
  try {
    const [itens, categorias] = await Promise.all([
      listarContasPagar(empresaId, situacao),
      categoriasContaPagarUsadas(empresaId),
    ]);
    return NextResponse.json({ itens, categorias });
  } catch (e) {
    console.error("Falha ao listar contas a pagar:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível listar.", detalhe }, { status: 500 });
  }
}

/** POST /api/contas-pagar { fornecedorId?, categoria?, descricao?, valor, vencimento?, foto?, pago? } */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const c = await request.json();
    const valor = Number(c.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ erro: "Informe o valor da conta." }, { status: 400 });
    }

    const vencimento =
      typeof c.vencimento === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.vencimento)
        ? c.vencimento
        : null;

    const foto = typeof c.foto === "string" && c.foto.startsWith("data:image/") ? c.foto : null;

    const fornecedorId =
      c.fornecedorId != null && Number.isInteger(Number(c.fornecedorId))
        ? Number(c.fornecedorId)
        : null;

    const descricao = String(c.descricao ?? "").trim() || null;
    // categoria: um valor da lista padrão ou um texto livre (até 40 chars)
    const categoria = String(c.categoria ?? "").trim().slice(0, 40) || null;

    const item = await criarContaPagar(empresaId, {
      fornecedorId,
      categoria,
      descricao,
      valor: Math.round(valor * 100) / 100,
      vencimento,
      foto,
      pago: Boolean(c.pago),
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (e) {
    console.error("Falha ao salvar conta a pagar:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível salvar.", detalhe }, { status: 500 });
  }
}
