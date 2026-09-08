/**
 * NFC-e via Focus NFe (https://doc.focusnfe.com.br). Cada loja vira uma
 * "empresa" própria dentro do Focus NFe (cadastro + certificado digital
 * dela) e ganha um token só dela, usado pra emitir — nunca um token da
 * plataforma emitindo em nome de outra loja.
 *
 * O certificado (.pfx + senha) só passa pelo servidor uma vez, ao cadastrar
 * a empresa (criarEmpresaFocusNFe); nunca é salvo no nosso banco, só o
 * token que volta.
 */

const BASE_PRODUCAO = "https://api.focusnfe.com.br/v2";
const BASE_HOMOLOGACAO = "https://homologacao.focusnfe.com.br/v2";

/** Token "mestre" da conta na plataforma — só cadastra/gerencia empresas, não emite nota. */
const TOKEN_MESTRE = process.env.FOCUSNFE_TOKEN;

export function configuradoFocusNFe(): boolean {
  return Boolean(TOKEN_MESTRE);
}

function autenticacao(token: string): string {
  // Basic auth: usuário é o token, senha em branco.
  return `Basic ${Buffer.from(`${token}:`).toString("base64")}`;
}

async function chamar<T = any>(
  url: string,
  token: string,
  init?: { method?: string; body?: unknown }
): Promise<T> {
  const r = await fetch(url, {
    method: init?.method ?? "GET",
    headers: {
      Authorization: autenticacao(token),
      "Content-Type": "application/json",
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok && r.status !== 422) {
    // 422 tem corpo útil (erro de validação/SEFAZ) — trata como resposta, não exceção
    throw new Error(String(d?.mensagem ?? `focus nfe (${r.status})`));
  }
  return d as T;
}

// ---------- cadastro da empresa (usa o token mestre) ----------

export type EmpresaFocusNFeEntrada = {
  cnpj: string;
  nome: string;
  nomeFantasia: string;
  inscricaoEstadual: string;
  /** 1 Simples Nacional, 2 Simples excesso sublimite, 3 Regime normal, 4 MEI */
  regimeTributario: number;
  logradouro: string;
  numero: string;
  complemento?: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  telefone?: string;
  email?: string;
  /** Arquivo .pfx/.p12 em base64 — não é guardado, só repassado ao Focus NFe. */
  certificadoBase64: string;
  senhaCertificado: string;
};

export type EmpresaFocusNFe = {
  id: number;
  tokenProducao: string | null;
  tokenHomologacao: string;
};

export async function criarEmpresaFocusNFe(d: EmpresaFocusNFeEntrada): Promise<EmpresaFocusNFe> {
  if (!TOKEN_MESTRE) throw new Error("Focus NFe não configurado (FOCUSNFE_TOKEN ausente).");

  const resp = await chamar<Record<string, any>>(`${BASE_PRODUCAO}/empresas`, TOKEN_MESTRE, {
    method: "POST",
    body: {
      nome: d.nome,
      nome_fantasia: d.nomeFantasia,
      cnpj: d.cnpj.replace(/\D/g, ""),
      inscricao_estadual: d.inscricaoEstadual.replace(/\D/g, ""),
      regime_tributario: d.regimeTributario,
      logradouro: d.logradouro,
      numero: d.numero,
      complemento: d.complemento || undefined,
      bairro: d.bairro,
      municipio: d.municipio,
      uf: d.uf.toUpperCase(),
      cep: d.cep.replace(/\D/g, ""),
      telefone: d.telefone || undefined,
      email: d.email || undefined,
      arquivo_certificado_base64: d.certificadoBase64,
      senha_certificado: d.senhaCertificado,
    },
  });

  if (!resp?.id) {
    throw new Error(
      resp?.mensagem ||
        (Array.isArray(resp?.erros) ? resp.erros.map((e: any) => e.mensagem).join("; ") : null) ||
        "Focus NFe não retornou o cadastro da empresa."
    );
  }

  return {
    id: Number(resp.id),
    tokenProducao: resp.token_producao ?? null,
    tokenHomologacao: String(resp.token_homologacao ?? ""),
  };
}

// ---------- emissão (usa o token DA LOJA) ----------

export type Ambiente = "producao" | "homologacao";

function base(ambiente: Ambiente): string {
  return ambiente === "producao" ? BASE_PRODUCAO : BASE_HOMOLOGACAO;
}

export type ItemNFCe = {
  numeroItem: string;
  codigoProduto: string;
  descricao: string;
  ncm: string;
  cfop: string;
  quantidadeComercial: number;
  valorUnitarioComercial: number;
  valorBruto: number;
  unidadeComercial: string;
  icmsOrigem: string;
  icmsSituacaoTributaria: string;
  valorDesconto?: number;
};

export type PagamentoNFCe = {
  /** 01 dinheiro, 02 cheque, 03 crédito, 04 débito, 05 crédito loja, 10-13 vale, 99 outro */
  formaPagamento: string;
  valorPagamento: number;
};

export type EmissaoNFCe = {
  token: string;
  ambiente: Ambiente;
  ref: string;
  cnpjEmitente: string;
  itens: ItemNFCe[];
  pagamentos: PagamentoNFCe[];
  cpfDestinatario?: string;
};

export type RespostaNFCe = {
  status: string; // "autorizado" | "erro_autorizacao" | "processando_autorizacao" | "cancelado"
  statusSefaz?: string;
  mensagemSefaz?: string;
  chaveNfe?: string;
  numero?: string;
  serie?: string;
  caminhoDanfe?: string;
  caminhoXml?: string;
  qrcodeUrl?: string;
  erros?: { campo?: string; mensagem: string }[];
};

function respostaDe(d: Record<string, any>): RespostaNFCe {
  return {
    status: String(d.status ?? "erro_autorizacao"),
    statusSefaz: d.status_sefaz,
    mensagemSefaz: d.mensagem_sefaz ?? d.mensagem,
    chaveNfe: d.chave_nfe,
    numero: d.numero,
    serie: d.serie,
    caminhoDanfe: d.caminho_danfe,
    caminhoXml: d.caminho_xml_nota_fiscal,
    qrcodeUrl: d.qrcode_url,
    erros: d.erros,
  };
}

export async function emitirNFCe(e: EmissaoNFCe): Promise<RespostaNFCe> {
  const d = await chamar<Record<string, any>>(
    `${base(e.ambiente)}/nfce?ref=${encodeURIComponent(e.ref)}`,
    e.token,
    {
      method: "POST",
      body: {
        cnpj_emitente: e.cnpjEmitente.replace(/\D/g, ""),
        data_emissao: new Date().toISOString(),
        presenca_comprador: "1",
        modalidade_frete: "9",
        local_destino: "1",
        natureza_operacao: "Venda",
        cpf_destinatario: e.cpfDestinatario?.replace(/\D/g, "") || undefined,
        items: e.itens.map((i) => ({
          numero_item: i.numeroItem,
          codigo_produto: i.codigoProduto,
          descricao: i.descricao,
          codigo_ncm: i.ncm.replace(/\D/g, ""),
          cfop: i.cfop,
          quantidade_comercial: i.quantidadeComercial,
          quantidade_tributavel: i.quantidadeComercial,
          valor_unitario_comercial: i.valorUnitarioComercial,
          valor_unitario_tributavel: i.valorUnitarioComercial,
          valor_bruto: i.valorBruto,
          valor_desconto: i.valorDesconto || undefined,
          unidade_comercial: i.unidadeComercial,
          unidade_tributavel: i.unidadeComercial,
          icms_origem: i.icmsOrigem,
          icms_situacao_tributaria: i.icmsSituacaoTributaria,
        })),
        formas_pagamento: e.pagamentos.map((p) => ({
          forma_pagamento: p.formaPagamento,
          valor_pagamento: p.valorPagamento,
        })),
      },
    }
  );
  return respostaDe(d);
}

export async function consultarNFCe(token: string, ambiente: Ambiente, ref: string): Promise<RespostaNFCe> {
  const d = await chamar<Record<string, any>>(
    `${base(ambiente)}/nfce/${encodeURIComponent(ref)}`,
    token
  );
  return respostaDe(d);
}

/** Forma de pagamento do app (dinheiro/debito/credito/pix/fiado/...) -> código SEFAZ (tabela 04.1.7). */
export function formaPagamentoSefaz(forma: string): string {
  const mapa: Record<string, string> = {
    dinheiro: "01",
    credito: "03",
    debito: "04",
    pix: "17",
    fiado: "99",
  };
  return mapa[forma] ?? "99";
}

export async function cancelarNFCe(
  token: string,
  ambiente: Ambiente,
  ref: string,
  justificativa: string
): Promise<RespostaNFCe> {
  const d = await chamar<Record<string, any>>(
    `${base(ambiente)}/nfce/${encodeURIComponent(ref)}`,
    token,
    { method: "DELETE", body: { justificativa } }
  );
  return respostaDe(d);
}
