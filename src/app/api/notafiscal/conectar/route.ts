import { NextResponse } from "next/server";
import { configEmpresa, salvarFocusNFeEmpresa } from "@/lib/db";
import { criarEmpresaFocusNFe } from "@/lib/focusnfe";
import { exigirEmpresa } from "@/lib/sessao";

export const dynamic = "force-dynamic";

const LIMITE = 16 * 1024; // um .pfx é pequeno (poucos KB)

/**
 * POST /api/notafiscal/conectar (multipart: campos `certificado` [.pfx/.p12]
 * e `senha`) -> cadastra a empresa no Focus NFe usando os dados fiscais já
 * salvos em /configuracoes + o certificado enviado agora. O certificado e a
 * senha só passam por aqui — não são gravados no nosso banco, só o token
 * que o Focus NFe devolve.
 */
export async function POST(request: Request) {
  const { empresaId, erro } = await exigirEmpresa();
  if (erro) return erro;

  try {
    const emp = await configEmpresa(empresaId);
    if (!emp) return NextResponse.json({ erro: "Empresa não encontrada." }, { status: 404 });

    const faltando = [
      !emp.documento && "CNPJ",
      !emp.inscricao_estadual && "Inscrição Estadual",
      !emp.regime_tributario && "Regime tributário",
      !emp.endereco && "Endereço",
      !emp.numero && "Número",
      !emp.bairro && "Bairro",
      !emp.cidade && "Cidade",
      !emp.uf && "UF",
      !emp.cep && "CEP",
    ].filter(Boolean);
    if (faltando.length > 0) {
      return NextResponse.json(
        { erro: `Complete em Configurações antes de conectar: ${faltando.join(", ")}.` },
        { status: 400 }
      );
    }

    const form = await request.formData();
    const certificado = form.get("certificado");
    const senha = String(form.get("senha") ?? "");
    if (!(certificado instanceof File) || certificado.size === 0) {
      return NextResponse.json({ erro: "Envie o certificado digital (.pfx ou .p12)." }, { status: 400 });
    }
    if (certificado.size > LIMITE) {
      return NextResponse.json({ erro: "Certificado maior do que o esperado." }, { status: 413 });
    }
    if (senha.length < 1) {
      return NextResponse.json({ erro: "Informe a senha do certificado." }, { status: 400 });
    }

    const certificadoBase64 = Buffer.from(await certificado.arrayBuffer()).toString("base64");

    const resultado = await criarEmpresaFocusNFe({
      cnpj: emp.documento!,
      nome: emp.nome,
      nomeFantasia: emp.nome,
      inscricaoEstadual: emp.inscricao_estadual!,
      regimeTributario: emp.regime_tributario!,
      logradouro: emp.endereco!,
      numero: emp.numero!,
      complemento: emp.complemento ?? undefined,
      bairro: emp.bairro!,
      municipio: emp.cidade!,
      uf: emp.uf!,
      cep: emp.cep!,
      telefone: emp.telefone ?? undefined,
      certificadoBase64,
      senhaCertificado: senha,
    });

    await salvarFocusNFeEmpresa(empresaId, {
      focusnfeEmpresaId: resultado.id,
      tokenProducao: resultado.tokenProducao,
      tokenHomologacao: resultado.tokenHomologacao,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Falha ao conectar o Focus NFe:", e);
    const detalhe = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: "Não foi possível conectar.", detalhe }, { status: 500 });
  }
}
