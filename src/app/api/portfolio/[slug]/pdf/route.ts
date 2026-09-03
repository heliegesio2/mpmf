import { NextResponse } from "next/server";
import { portfolioPdfPorSlug } from "@/lib/db";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/** GET /api/portfolio/:slug/pdf -> o PDF do portfólio público (download). */
export async function GET(_request: Request, { params }: Ctx) {
  const { slug } = await params;
  const b64 = await portfolioPdfPorSlug(slug);
  if (!b64) return NextResponse.json({ erro: "Sem PDF." }, { status: 404 });

  const bytes = Buffer.from(b64, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="catalogo-${slug}.pdf"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "public, max-age=300",
    },
  });
}
