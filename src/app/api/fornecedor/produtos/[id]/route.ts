import { NextResponse } from "next/server";
import {
  atualizarPrecosProdutoFornecedor,
  atualizarProdutoFornecedor,
  excluirProdutoFornecedor,
} from "@/lib/db";
import { lerEntradaProduto } from "@/lib/fornecedorProduto";
import { exigirFornecedor } from "@/lib/sessao";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const preco = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/**
 * PATCH /api/fornecedor/produtos/:id — edição rápida só dos preços pela lista.
 * Só mexe nas chaves presentes no corpo (nome/categoria/foto ficam como estão).
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });
  }

  try {
    const c = (await request.json()) as Record<string, unknown>;
    const campos: Record<string, number | string | null> = {};
    if ("nome" in c) {
      const nome = String(c.nome ?? "").trim();
      if (nome.length >= 2) campos.nome = nome;
    }
    if ("categoria" in c) campos.categoria = String(c.categoria ?? "").trim().slice(0, 40);
    for (const k of ["precoUnidade", "precoDesconto", "precoCaixa"]) {
      if (k in c) campos[k] = preco(c[k]);
    }
    for (const k of ["descontoQtdMin", "caixaQtd"]) {
      if (k in c) {
        const n = preco(c[k]);
        campos[k] = n === null ? null : Math.round(n);
      }
    }
    const item = await atualizarPrecosProdutoFornecedor(fornecedorId, id, campos);
    if (!item) return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao atualizar preços do produto:", e);
    return NextResponse.json({ erro: "Não foi possível salvar." }, { status: 500 });
  }
}

/** PUT /api/fornecedor/produtos/:id */
export async function PUT(request: Request, { params }: Ctx) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });
  }

  try {
    const dados = lerEntradaProduto((await request.json()) as Record<string, unknown>);
    if ("erro" in dados) return NextResponse.json({ erro: dados.erro }, { status: 400 });

    const item = await atualizarProdutoFornecedor(fornecedorId, id, dados);
    if (!item) return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
    return NextResponse.json({ item });
  } catch (e) {
    console.error("Falha ao atualizar produto do fornecedor:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível salvar.", detalhe }, { status: 500 });
  }
}

/** DELETE /api/fornecedor/produtos/:id */
export async function DELETE(_request: Request, { params }: Ctx) {
  const { fornecedorId, erro } = await exigirFornecedor();
  if (erro) return erro;

  const id = Number((await params).id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ erro: "Produto inválido." }, { status: 400 });
  }

  try {
    const ok = await excluirProdutoFornecedor(fornecedorId, id);
    if (!ok) return NextResponse.json({ erro: "Produto não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao excluir produto do fornecedor:", e);
    return NextResponse.json({ erro: "Não foi possível excluir." }, { status: 500 });
  }
}
