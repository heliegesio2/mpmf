import { NextResponse } from "next/server";
import {
  resumoEstoque,
  estoquePorCategoria,
  produtosNoPrejuizo,
  produtosEstoqueBaixo,
  gastosPorBeneficiario,
  gastosPorMes,
  gastoTotalMesAtual,
  caixaSerie,
  resumoCascos,
} from "@/lib/db";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/relatorios -> todos os indicadores do painel numa unica chamada. */
export async function GET() {
  const { empresaId, erro: negado } = await exigirEmpresa();
  if (negado) return negado;

  try {
    const [
      estoque,
      porCategoria,
      prejuizo,
      estoqueBaixo,
      porBeneficiario,
      porMes,
      gastoMesAtual,
      caixa,
      cascos,
    ] = await Promise.all([
      resumoEstoque(empresaId),
      estoquePorCategoria(empresaId),
      produtosNoPrejuizo(empresaId),
      produtosEstoqueBaixo(empresaId),
      gastosPorBeneficiario(empresaId),
      gastosPorMes(empresaId),
      gastoTotalMesAtual(empresaId),
      caixaSerie(empresaId),
      resumoCascos(empresaId),
    ]);

    return NextResponse.json({
      estoque,
      porCategoria,
      prejuizo,
      estoqueBaixo,
      porBeneficiario,
      porMes,
      gastoMesAtual,
      caixa,
      cascos,
    });
  } catch (erro) {
    console.error("Falha ao montar relatórios:", erro);
    return NextResponse.json({ erro: "Não foi possível carregar os relatórios." }, { status: 500 });
  }
}
