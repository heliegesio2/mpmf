import { NextResponse } from "next/server";
import {
  configEmpresa,
  focusNFeDaEmpresa,
  notaFiscalDaVenda,
  salvarNotaFiscalVenda,
  vendaParaNotaFiscal,
} from "@/lib/db";
import { emitirNFCe, formaPagamentoSefaz } from "@/lib/focusnfe";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/notafiscal/emitir?vendaId= -> nota já emitida (ou tentada) pra essa venda, se houver. */
export async function GET(request: Request) {
  const { erro } = await exigirEmpresa();
  if (erro) return erro;

  const vendaId = Number(new URL(request.url).searchParams.get("vendaId"));
  if (!Number.isInteger(vendaId)) return NextResponse.json({ erro: "vendaId obrigatório." }, { status: 400 });

  const nota = await notaFiscalDaVenda(vendaId);
  return NextResponse.json({ nota });
}

/** POST /api/notafiscal/emitir { vendaId, cpfCliente? } -> emite a NFC-e dessa venda. */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  const { vendaId, cpfCliente } = await request.json();
  if (!Number.isInteger(vendaId)) {
    return NextResponse.json({ erro: "vendaId obrigatório." }, { status: 400 });
  }

  const fn = await focusNFeDaEmpresa(empresaId);
  if (!fn) {
    return NextResponse.json({ erro: "Conecte o Focus NFe em Configurações antes de emitir." }, { status: 400 });
  }
  const token = fn.ambiente === "producao" ? fn.tokenProducao : fn.tokenHomologacao;
  if (!token) {
    return NextResponse.json({ erro: "Sem token de produção — troque pra homologação ou aguarde a liberação." }, { status: 400 });
  }

  const existente = await notaFiscalDaVenda(vendaId);
  if (existente?.status === "autorizado") {
    return NextResponse.json({ erro: "Essa venda já tem NFC-e emitida." }, { status: 409 });
  }

  const venda = await vendaParaNotaFiscal(empresaId, vendaId);
  if (!venda) return NextResponse.json({ erro: "Venda não encontrada." }, { status: 404 });
  if (venda.itens.length === 0) return NextResponse.json({ erro: "Venda sem itens." }, { status: 400 });

  const semDadoFiscal = venda.itens
    .filter((i) => !i.ncm || !i.cfop || !i.icmsSituacaoTributaria)
    .map((i) => i.nome);
  if (semDadoFiscal.length > 0) {
    return NextResponse.json(
      {
        erro:
          `Falta NCM/CFOP/situação tributária em: ${[...new Set(semDadoFiscal)].join(", ")}. ` +
          "Preencha em Produtos antes de emitir.",
      },
      { status: 400 }
    );
  }

  const empresaConfig = await configEmpresa(empresaId);
  if (!empresaConfig?.documento) {
    return NextResponse.json({ erro: "Configure o CNPJ da empresa antes de emitir." }, { status: 400 });
  }

  const ref = existente?.ref ?? `venda-${vendaId}`;

  try {
    const resposta = await emitirNFCe({
      token,
      ambiente: fn.ambiente,
      ref,
      cnpjEmitente: empresaConfig.documento,
      cpfDestinatario: cpfCliente || undefined,
      itens: venda.itens.map((i, idx) => ({
        numeroItem: String(idx + 1),
        codigoProduto: String(i.produtoId ?? idx + 1),
        descricao: i.nome,
        ncm: i.ncm!,
        cfop: i.cfop!,
        quantidadeComercial: i.quantidade,
        valorUnitarioComercial: i.precoUnit,
        valorBruto: Number((i.quantidade * i.precoUnit).toFixed(2)),
        unidadeComercial: i.unidade,
        icmsOrigem: i.icmsOrigem,
        icmsSituacaoTributaria: i.icmsSituacaoTributaria!,
      })),
      pagamentos: venda.pagamentos.map((p) => ({
        formaPagamento: formaPagamentoSefaz(p.forma),
        valorPagamento: p.valor,
      })),
    });

    await salvarNotaFiscalVenda(vendaId, {
      ref,
      status: resposta.status,
      chaveNfe: resposta.chaveNfe,
      numero: resposta.numero,
      serie: resposta.serie,
      caminhoDanfe: resposta.caminhoDanfe,
      caminhoXml: resposta.caminhoXml,
      mensagemSefaz:
        resposta.mensagemSefaz ?? (resposta.erros ?? []).map((e) => e.mensagem).join("; ") ?? null,
    });

    if (resposta.status !== "autorizado") {
      return NextResponse.json(
        { erro: resposta.mensagemSefaz || "A SEFAZ rejeitou a nota.", nota: resposta },
        { status: 422 }
      );
    }

    return NextResponse.json({ nota: resposta });
  } catch (e) {
    console.error("Falha ao emitir NFC-e:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    await salvarNotaFiscalVenda(vendaId, { ref, status: "erro_autorizacao", mensagemSefaz: detalhe });
    return NextResponse.json({ erro: "Não foi possível emitir a nota.", detalhe }, { status: 500 });
  }
}
