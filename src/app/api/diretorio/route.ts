import { NextResponse } from "next/server";
import { configEmpresa, listarBairros, listarDiretorioFornecedores } from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/**
 * GET /api/diretorio?bairro= — fornecedores APROVADOS que atendem a cidade da
 * loja (e o bairro, se filtrado). Usa `empresa.cidade` / `empresa.bairro`.
 */
export async function GET(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const emp = await configEmpresa(empresaId);
    const cidade = emp?.cidade?.trim() ?? "";
    if (!cidade) {
      return NextResponse.json({ semCidade: true, cidade: "", bairro: null, bairros: [], itens: [] });
    }

    const bairroFiltro = new URL(request.url).searchParams.get("bairro")?.trim() || null;
    const [itens, bairros] = await Promise.all([
      listarDiretorioFornecedores(cidade, bairroFiltro),
      listarBairros(cidade),
    ]);

    return NextResponse.json({
      cidade,
      bairro: emp?.bairro ?? null,
      bairros,
      itens,
    });
  } catch (e) {
    console.error("Falha ao carregar o diretório:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível carregar.", detalhe }, { status: 500 });
  }
}
