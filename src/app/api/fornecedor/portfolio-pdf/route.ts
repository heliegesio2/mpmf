import { NextResponse } from "next/server";
import { portfolioPdf, salvarPortfolioPdf } from "@/lib/db";
import { exigirFornecedor } from "@/lib/sessao";

export const dynamic = "force-dynamic";

const LIMITE = 8 * 1024 * 1024; // 8 MB

/** GET /api/fornecedor/portfolio-pdf -> o PDF anexado (bytes), ou 404. */
export async function GET() {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  const b64 = await portfolioPdf(fornecedorId);
  if (!b64) return NextResponse.json({ erro: "Sem PDF." }, { status: 404 });

  const bytes = Buffer.from(b64, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="portfolio.pdf"',
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=60",
    },
  });
}

/** PUT /api/fornecedor/portfolio-pdf (multipart, campo `pdf`) -> anexa/troca. */
export async function PUT(request: Request) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  try {
    const form = await request.formData();
    const arquivo = form.get("pdf");
    if (!(arquivo instanceof File) || arquivo.type !== "application/pdf") {
      return NextResponse.json({ erro: "Envie um arquivo PDF." }, { status: 400 });
    }
    if (arquivo.size > LIMITE) {
      return NextResponse.json({ erro: "O PDF passa de 8 MB." }, { status: 413 });
    }
    const b64 = Buffer.from(await arquivo.arrayBuffer()).toString("base64");
    await salvarPortfolioPdf(fornecedorId, b64);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao anexar o PDF do portfólio:", e);
    return NextResponse.json({ erro: "Não foi possível anexar." }, { status: 500 });
  }
}

/** DELETE /api/fornecedor/portfolio-pdf -> remove o anexo. */
export async function DELETE() {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  await salvarPortfolioPdf(fornecedorId, null);
  return NextResponse.json({ ok: true });
}
