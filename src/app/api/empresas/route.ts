import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool, listarEmpresas, garantirSchema, definirFotoUsuarioSeVazia } from "@/lib/db";
import { gerarHashSenha } from "@/lib/senha";
import { exigirSuperAdmin, sessaoAtual } from "@/lib/sessao";
import { COOKIE_CADASTRO_SOCIAL, lerCadastroSocial } from "@/lib/auth";
import { baixarFotoComoDataUrl } from "@/lib/oauth";

export const dynamic = "force-dynamic";

/** GET /api/empresas?situacao=pendente -> lista (so super admin) */
export async function GET(request: Request) {
  const { erro } = await exigirSuperAdmin();
  if (erro) return erro;

  const url = new URL(request.url);
  const situacao = url.searchParams.get("situacao") ?? "todas";
  const q = url.searchParams.get("q") ?? "";
  try {
    return NextResponse.json({ itens: await listarEmpresas(situacao, q) });
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

  // cadastro vindo do login social: a identidade (e-mail/nome) já foi
  // verificada pelo Google/Facebook e está num cookie assinado.
  const social = souSuperAdmin
    ? null
    : await lerCadastroSocial((await cookies()).get(COOKIE_CADASTRO_SOCIAL)?.value);

  let cliente: import("pg").PoolClient | undefined;
  try {
    await garantirSchema();
    cliente = await pool.connect();
    const c = await request.json();
    const nome = String(c.nome ?? "").trim();
    const documento = String(c.documento ?? "").replace(/\D/g, "");

    if (nome.length < 2) return NextResponse.json({ erro: "Informe o nome da empresa." }, { status: 400 });
    if (documento.length !== 11 && documento.length !== 14) {
      return NextResponse.json({ erro: "CNPJ ou CPF inválido." }, { status: 400 });
    }

    const brutos: any[] = souSuperAdmin
      ? Array.isArray(c.usuarios) ? c.usuarios : []
      : social
        ? [{ nome: c.responsavel || social.nome, email: social.email, senha: "", papel: "admin" }]
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
      // conta de rede social entra sem senha
      if (!social && u.senha.length < 8) {
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

    const horario = c.horario ? String(c.horario).trim() || null : null;
    const pixChave = c.pixChave ? String(c.pixChave).trim() || null : null;
    const pixNome = c.pixNome ? String(c.pixNome).trim() || null : null;

    const empresa = await cliente.query<{ id: number }>(
      souSuperAdmin
        ? `INSERT INTO empresa (nome, documento, telefone, telefone_whatsapp, cidade, horario, pix_chave, pix_nome, situacao, decidida_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'aprovada', now()) RETURNING id`
        : `INSERT INTO empresa (nome, documento, telefone, telefone_whatsapp, cidade, horario, pix_chave, pix_nome)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [nome, documento, c.telefone ?? null, Boolean(c.telefoneWhatsapp), c.cidade ?? null, horario, pixChave, pixNome]
    );

    let usuarioSocialId: number | null = null;
    for (const u of usuarios) {
      const senhaHash = social ? null : await gerarHashSenha(u.senha);
      const novo = await cliente.query<{ id: number }>(
        `INSERT INTO usuario (empresa_id, nome, email, senha_hash, papel)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [empresa.rows[0].id, u.nome, u.email, senhaHash, u.papel]
      );
      if (social) {
        usuarioSocialId = novo.rows[0].id;
        await cliente.query(
          `INSERT INTO usuario_identidade (usuario_id, provedor, provedor_id) VALUES ($1, $2, $3)`,
          [novo.rows[0].id, social.provedor, social.provedorId]
        );
      }
    }

    await cliente.query("COMMIT");

    // foto do provedor: best-effort, fora da transação
    if (social?.fotoUrl && usuarioSocialId) {
      try {
        const dataUrl = await baixarFotoComoDataUrl(social.fotoUrl);
        if (dataUrl) await definirFotoUsuarioSeVazia(usuarioSocialId, dataUrl);
      } catch (e) {
        console.warn("foto social no cadastro:", e);
      }
    }

    const resposta = NextResponse.json(
      souSuperAdmin
        ? { ok: true, aviso: "Empresa cadastrada e aprovada." }
        : { ok: true, aviso: "Cadastro enviado. Aguarde a aprovação para entrar." },
      { status: 201 }
    );
    if (social) resposta.cookies.set(COOKIE_CADASTRO_SOCIAL, "", { path: "/", maxAge: 0 });
    return resposta;
  } catch (e: any) {
    await cliente?.query("ROLLBACK").catch(() => {});
    if (e?.code === "23505") {
      return NextResponse.json({ erro: "Empresa ou e-mail já cadastrado." }, { status: 409 });
    }
    console.error("Falha ao cadastrar empresa:", e);
    return NextResponse.json({ erro: "Não foi possível cadastrar." }, { status: 500 });
  } finally {
    cliente?.release();
  }
}
