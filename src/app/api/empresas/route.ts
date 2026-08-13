import { NextResponse } from "next/server";
import { pool, listarEmpresas } from "@/lib/db";
import { gerarHashSenha } from "@/lib/senha";
import { exigirSuperAdmin, sessaoAtual } from "@/lib/sessao";

export const dynamic = "force-dynamic";

/** GET /api/empresas?situacao=pendente -> lista (so super admin) */
export async function GET(request: Request) {
  const { erro } = await exigirSuperAdmin();
  if (erro) return erro;

  const situacao = new URL(request.url).searchParams.get("situacao") ?? "todas";
  try {
    return NextResponse.json({ itens: await listarEmpresas(situacao) });
  } catch (e) {
    console.error("Falha ao listar empresas:", e);
    return NextResponse.json({ erro: "Não foi possível listar." }, { status: 500 });
  }
}

/**
 * POST /api/empresas
 * - Sem sessão: cadastro público. Nasce "pendente", com 1 usuário admin
 *   (o responsável), e só entra depois que o super admin aprova.
 * - Sessão de super admin: cadastro direto pelo painel. Nasce "aprovada"
 *   e aceita vários usuários de uma vez, cada um com o papel escolhido.
 */
export async function POST(request: Request) {
  const sessao = await sessaoAtual();
  const souSuperAdmin = sessao?.papel === "super_admin";

  const cliente = await pool.connect();
  try {
    const c = await request.json();
    const nome = String(c.nome ?? "").trim();
    const documento = String(c.documento ?? "").replace(/\D/g, "");

    if (nome.length < 2) return NextResponse.json({ erro: "Informe o nome da empresa." }, { status: 400 });
    if (documento.length !== 11 && documento.length !== 14) {
      return NextResponse.json({ erro: "CNPJ ou CPF inválido." }, { status: 400 });
    }

    const brutos: any[] = souSuperAdmin
      ? Array.isArray(c.usuarios) ? c.usuarios : []
      : [{ nome: c.responsavel, email: c.email, senha: c.senha, papel: "admin" }];

    if (brutos.length === 0) {
      return NextResponse.json({ erro: "Informe ao menos um usuário." }, { status: 400 });
    }

    const usuarios = brutos.map((u) => ({
      nome: String(u?.nome ?? "").trim(),
      email: String(u?.email ?? "").trim(),
      senha: String(u?.senha ?? ""),
      papel: u?.papel === "operador" ? "operador" : "admin",
    }));

    for (const u of usuarios) {
      if (u.nome.length < 2) {
        return NextResponse.json({ erro: "Informe o nome de cada usuário." }, { status: 400 });
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(u.email)) {
        return NextResponse.json({ erro: `E-mail inválido: ${u.email || "(vazio)"}` }, { status: 400 });
      }
      if (u.senha.length < 8) {
        return NextResponse.json({ erro: "A senha precisa ter ao menos 8 caracteres." }, { status: 400 });
      }
    }

    const emailsMinusculos = usuarios.map((u) => u.email.toLowerCase());
    if (new Set(emailsMinusculos).size !== emailsMinusculos.length) {
      return NextResponse.json({ erro: "Há e-mails repetidos na lista." }, { status: 400 });
    }

    // empresa e usuarios nascem juntos: se um falhar, nenhum e gravado
    await cliente.query("BEGIN");

    const jaExiste = await cliente.query(
      "SELECT email FROM usuario WHERE lower(email) = ANY($1::text[])",
      [emailsMinusculos]
    );
    if (jaExiste.rowCount) {
      await cliente.query("ROLLBACK");
      return NextResponse.json(
        { erro: `Este e-mail já está cadastrado: ${jaExiste.rows[0].email}` },
        { status: 409 }
      );
    }

    const empresa = await cliente.query<{ id: number }>(
      souSuperAdmin
        ? `INSERT INTO empresa (nome, documento, telefone, cidade, situacao, decidida_em)
           VALUES ($1, $2, $3, $4, 'aprovada', now()) RETURNING id`
        : `INSERT INTO empresa (nome, documento, telefone, cidade)
           VALUES ($1, $2, $3, $4) RETURNING id`,
      [nome, documento, c.telefone ?? null, c.cidade ?? null]
    );

    for (const u of usuarios) {
      await cliente.query(
        `INSERT INTO usuario (empresa_id, nome, email, senha_hash, papel)
         VALUES ($1, $2, $3, $4, $5)`,
        [empresa.rows[0].id, u.nome, u.email, await gerarHashSenha(u.senha), u.papel]
      );
    }

    await cliente.query("COMMIT");

    return NextResponse.json(
      souSuperAdmin
        ? { ok: true, aviso: "Empresa cadastrada e aprovada." }
        : { ok: true, aviso: "Cadastro enviado. Aguarde a aprovação para entrar." },
      { status: 201 }
    );
  } catch (e: any) {
    await cliente.query("ROLLBACK").catch(() => {});
    if (e?.code === "23505") {
      return NextResponse.json({ erro: "Empresa ou e-mail já cadastrado." }, { status: 409 });
    }
    console.error("Falha ao cadastrar empresa:", e);
    return NextResponse.json({ erro: "Não foi possível cadastrar." }, { status: 500 });
  } finally {
    cliente.release();
  }
}
