import { NextResponse } from "next/server";
import { enviarAvisoAdmin } from "@/lib/db";
import { exigirSuperAdmin } from "@/lib/sessao";

export const dynamic = "force-dynamic";

const DIA = /^\d{4}-\d{2}-\d{2}$/;

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * POST /api/admin/avisos { texto, foto?, empresaId? (ausente/null = todos os
 * clientes), imediato: boolean, dataEnvio? }
 *
 * Vira uma anotação (`de_admin = true`) em cada loja alvo — reusa toda a
 * cadeia de aviso (sino, /notificacoes, /anotacoes) que já existe.
 */
export async function POST(request: Request) {
  const { erro } = await exigirSuperAdmin();
  if (erro) return erro;

  try {
    const c = (await request.json()) as {
      texto?: string;
      foto?: string;
      empresaId?: number | null;
      imediato?: boolean;
      dataEnvio?: string;
    };
    const texto = String(c.texto ?? "").trim();
    if (texto.length < 2) {
      return NextResponse.json({ erro: "Escreva o texto da notificação." }, { status: 400 });
    }
    const foto = typeof c.foto === "string" && c.foto.startsWith("data:image/") ? c.foto : undefined;
    const empresaId =
      typeof c.empresaId === "number" && Number.isFinite(c.empresaId) ? c.empresaId : null;

    const imediato = c.imediato !== false;
    const dataEnvio = imediato
      ? hojeISO()
      : typeof c.dataEnvio === "string" && DIA.test(c.dataEnvio)
        ? c.dataEnvio
        : null;
    if (!dataEnvio) {
      return NextResponse.json({ erro: "Informe a data do aviso." }, { status: 400 });
    }

    const totalLojas = await enviarAvisoAdmin({
      empresaId,
      texto: texto.slice(0, 2000),
      dataAlerta: dataEnvio,
      foto,
    });

    return NextResponse.json({ totalLojas, dataEnvio });
  } catch (e) {
    console.error("Falha ao enviar aviso do admin:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível enviar.", detalhe }, { status: 500 });
  }
}
