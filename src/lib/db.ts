import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined;
}

export const pool =
  global._pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    // Neon (e a maioria dos Postgres gerenciados) exige TLS; o Postgres local
    // do balcao nao usa. rejectUnauthorized:false porque esses provedores
    // costumam usar CA que o Node nao reconhece por padrao.
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });

// O pooler da Neon (PgBouncer) pode reaproveitar uma conexao de servidor com
// search_path desatualizado/vazio; forcar em toda nova conexao fisica evita
// "relation does not exist" mesmo quando o ALTER DATABASE nao chega a valer.
pool.on("connect", (client) => {
  client.query("SET search_path TO public").catch(() => {});
});

if (process.env.NODE_ENV !== "production") global._pgPool = pool;

// ---------- auto-migrate das migracoes idempotentes (db/08..db/10) ----------
// A migracao manual em producao ja errou de banco (branch da Neon) varias
// vezes e as telas quebram sem as colunas/tabelas novas. Cada instrucao vai
// numa query separada (o pooler da Neon nao lida bem com multi-statement) e o
// resultado fica cacheado por processo; em caso de falha, tenta de novo na
// proxima chamada. Migracoes novas continuam em db/NN_*.sql; as que forem so
// "ADD COLUMN / CREATE TABLE / CREATE INDEX ... IF NOT EXISTS" mirram aqui.
const MIGRACOES_IDEMPOTENTES = [
  "ALTER TABLE produto ADD COLUMN IF NOT EXISTS foto text",
  "ALTER TABLE produto ADD COLUMN IF NOT EXISTS estoque_minimo numeric(12,3)",
  "ALTER TABLE produto ADD COLUMN IF NOT EXISTS estoque_minimo_embalagem text",
  "ALTER TABLE empresa ADD COLUMN IF NOT EXISTS endereco text",
  "ALTER TABLE empresa ADD COLUMN IF NOT EXISTS cep text",
  "ALTER TABLE empresa ADD COLUMN IF NOT EXISTS horario text",
  "ALTER TABLE empresa ADD COLUMN IF NOT EXISTS pix_chave text",
  "ALTER TABLE empresa ADD COLUMN IF NOT EXISTS pix_nome text",
  `CREATE TABLE IF NOT EXISTS cliente (
     id bigserial PRIMARY KEY,
     empresa_id bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
     nome text NOT NULL,
     cpf text,
     telefone text,
     whatsapp boolean NOT NULL DEFAULT false,
     endereco text NOT NULL,
     cep text,
     foto text NOT NULL,
     criado_em timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE INDEX IF NOT EXISTS idx_cliente_empresa ON cliente (empresa_id, nome)",
  `CREATE TABLE IF NOT EXISTS fiado (
     id bigserial PRIMARY KEY,
     empresa_id bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
     cliente_id bigint NOT NULL REFERENCES cliente(id) ON DELETE CASCADE,
     valor numeric(10,2) NOT NULL CHECK (valor > 0),
     descricao text,
     pago boolean NOT NULL DEFAULT false,
     pago_em timestamptz,
     criado_em timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE INDEX IF NOT EXISTS idx_fiado_empresa ON fiado (empresa_id, pago, criado_em DESC)",
  "ALTER TABLE cliente ADD COLUMN IF NOT EXISTS nota integer",
  "CREATE INDEX IF NOT EXISTS idx_cliente_cpf ON cliente ((regexp_replace(coalesce(cpf, ''), '\\D', '', 'g')))",
  "ALTER TABLE produto ADD COLUMN IF NOT EXISTS preco_embalagem numeric(10,2)",
  "ALTER TABLE empresa ADD COLUMN IF NOT EXISTS telefone_whatsapp boolean NOT NULL DEFAULT false",
  "ALTER TABLE casco ADD COLUMN IF NOT EXISTS telefone_whatsapp boolean NOT NULL DEFAULT false",
  "ALTER TABLE usuario ALTER COLUMN senha_hash DROP NOT NULL",
  "ALTER TABLE usuario ADD COLUMN IF NOT EXISTS foto text",
  `CREATE TABLE IF NOT EXISTS usuario_identidade (
     id bigserial PRIMARY KEY,
     usuario_id bigint NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
     provedor text NOT NULL,
     provedor_id text NOT NULL,
     criado_em timestamptz NOT NULL DEFAULT now(),
     UNIQUE (provedor, provedor_id)
   )`,
  "CREATE INDEX IF NOT EXISTS idx_identidade_usuario ON usuario_identidade (usuario_id)",
  `CREATE TABLE IF NOT EXISTS fornecedor (
     id bigserial PRIMARY KEY,
     empresa_id bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
     nome text NOT NULL,
     documento text,
     telefone text,
     telefone_whatsapp boolean NOT NULL DEFAULT false,
     endereco text,
     observacao text,
     criado_em timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE INDEX IF NOT EXISTS idx_fornecedor_empresa ON fornecedor (empresa_id, nome)",
  `CREATE TABLE IF NOT EXISTS conta_pagar (
     id bigserial PRIMARY KEY,
     empresa_id bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
     fornecedor_id bigint REFERENCES fornecedor(id) ON DELETE SET NULL,
     descricao text,
     valor numeric(12,2) NOT NULL CHECK (valor > 0),
     vencimento date,
     foto text,
     pago boolean NOT NULL DEFAULT false,
     pago_em timestamptz,
     criado_em timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE INDEX IF NOT EXISTS idx_conta_pagar_empresa ON conta_pagar (empresa_id, pago, vencimento)",
  "ALTER TABLE conta_pagar ADD COLUMN IF NOT EXISTS categoria text",
  "ALTER TABLE conta_pagar ADD COLUMN IF NOT EXISTS recorrente boolean NOT NULL DEFAULT false",
  "ALTER TABLE fornecedor ADD COLUMN IF NOT EXISTS pix_chave text",
];

let _schema: Promise<void> | null = null;

export function garantirSchema(): Promise<void> {
  if (!_schema) {
    _schema = (async () => {
      for (const stmt of MIGRACOES_IDEMPOTENTES) await pool.query(stmt);
    })().catch((erro) => {
      _schema = null; // permite nova tentativa
      console.error("auto-migrate falhou:", erro);
      throw new Error(
        `auto-migrate falhou: ${erro instanceof Error ? erro.message : String(erro)}`
      );
    });
  }
  return _schema;
}

export type Produto = {
  id: number;
  nome: string;
  categoria: string | null;
  local: string | null;
  unidade: string;
  tipo_venda: string;
  preco: string;
  preco_compra: string;
  estoque: string;
  estoque_minimo: string | null;
  estoque_minimo_embalagem: string | null;
  preco_embalagem: string | null;
  tem_foto?: boolean;
  score?: number;
};

export type ProdutoEntrada = {
  nome: string;
  categoria?: string | null;
  local?: string | null;
  unidade?: string;
  tipoVenda: string;
  preco: number;
  precoCompra: number;
  estoque: number;
  /** Avisar quando o estoque cair até aqui. `null`/omitido = sem aviso próprio. */
  estoqueMinimo?: number | null;
  /** Rótulo da unidade do aviso ("unidade", "caixa"...). */
  estoqueMinimoEmbalagem?: string | null;
  /** Preço da embalagem inteira (fardo/caixa...). `null` = só avulso. */
  precoEmbalagem?: number | null;
  /**
   * Foto como data URL. `undefined` = não mexe na foto atual;
   * `""` = remove a foto; `"data:image/..."` = grava essa.
   */
  foto?: string;
};

// a coluna `foto` (data URL, pode ter centenas de KB) fica fora daqui de
// propósito — as listas só precisam saber se existe uma foto (tem_foto).
const CAMPOS =
  "id, nome, categoria, local, unidade, tipo_venda, preco, preco_compra, estoque, " +
  "estoque_minimo, estoque_minimo_embalagem, preco_embalagem, (foto IS NOT NULL) AS tem_foto";

export async function buscarProduto(
  empresaId: number,
  termo: string,
  limite = 8
): Promise<Produto[]> {
  await garantirSchema();
  const { rows } = await pool.query<Produto>(
    "SELECT * FROM buscar_produto($1::bigint, $2::text, $3::int)",
    [empresaId, termo, limite]
  );
  return rows;
}

export async function produtoPorId(empresaId: number, id: number): Promise<Produto | null> {
  await garantirSchema();
  const { rows } = await pool.query<Produto>(
    `SELECT ${CAMPOS} FROM produto WHERE id = $1 AND empresa_id = $2`,
    [id, empresaId]
  );
  return rows[0] ?? null;
}

/** Lista para a tela de edicao. Sem termo, devolve tudo em ordem alfabetica. */
export async function listarProdutos(
  empresaId: number,
  termo = ""
): Promise<Produto[]> {
  await garantirSchema();
  const t = termo.trim();
  if (!t) {
    const { rows } = await pool.query<Produto>(
      `SELECT ${CAMPOS} FROM produto WHERE ativo AND empresa_id = $1 ORDER BY nome`,
      [empresaId]
    );
    return rows;
  }
  const { rows } = await pool.query<Produto>(
    `SELECT ${CAMPOS} FROM produto
     WHERE ativo AND empresa_id = $1
       AND f_unaccent(lower(nome || ' ' || coalesce(categoria,'')))
           LIKE '%' || f_unaccent(lower($2::text)) || '%'
     ORDER BY nome`,
    [empresaId, t]
  );
  return rows;
}

export async function criarProduto(
  empresaId: number,
  p: ProdutoEntrada
): Promise<Produto> {
  await garantirSchema();
  const foto = p.foto ? p.foto : null;
  const { rows } = await pool.query<Produto>(
    `INSERT INTO produto
       (empresa_id, nome, categoria, local, unidade, tipo_venda, preco, preco_compra, estoque,
        estoque_minimo, estoque_minimo_embalagem, foto, preco_embalagem)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING ${CAMPOS}`,
    [
      empresaId, p.nome, p.categoria ?? null, p.local ?? null, p.unidade ?? "unidade",
      p.tipoVenda, p.preco, p.precoCompra, p.estoque,
      p.estoqueMinimo ?? null, p.estoqueMinimoEmbalagem ?? null, foto, p.precoEmbalagem ?? null,
    ]
  );
  return rows[0];
}

export async function atualizarProduto(
  empresaId: number,
  id: number,
  p: ProdutoEntrada
): Promise<Produto | null> {
  await garantirSchema();
  // foto: undefined mantém a atual, "" apaga, string grava a nova
  const foto = p.foto === undefined ? null : p.foto;
  // o empresa_id no WHERE impede alterar produto de outra loja
  const { rows } = await pool.query<Produto>(
    `UPDATE produto
        SET nome = $3, categoria = $4, local = $5, unidade = $6,
            tipo_venda = $7, preco = $8, preco_compra = $9, estoque = $10,
            estoque_minimo = $12, estoque_minimo_embalagem = $13, preco_embalagem = $14,
            foto = CASE
                     WHEN $11::text IS NULL THEN foto
                     WHEN $11 = '' THEN NULL
                     ELSE $11
                   END,
            alterado_em = now()
      WHERE id = $1 AND empresa_id = $2
      RETURNING ${CAMPOS}`,
    [
      id, empresaId, p.nome, p.categoria ?? null, p.local ?? null,
      p.unidade ?? "unidade", p.tipoVenda, p.preco, p.precoCompra, p.estoque, foto,
      p.estoqueMinimo ?? null, p.estoqueMinimoEmbalagem ?? null, p.precoEmbalagem ?? null,
    ]
  );
  return rows[0] ?? null;
}

/** So mexe no estoque — usado pela atualizacao por foto de prateleira. */
export async function atualizarEstoqueProduto(
  empresaId: number,
  id: number,
  novoEstoque: number
): Promise<Produto | null> {
  await garantirSchema();
  const { rows } = await pool.query<Produto>(
    `UPDATE produto SET estoque = $3, alterado_em = now()
      WHERE id = $1 AND empresa_id = $2
      RETURNING ${CAMPOS}`,
    [id, empresaId, novoEstoque]
  );
  return rows[0] ?? null;
}

/** Data URL da foto do produto, ou null. Fora de CAMPOS por ser pesada. */
export async function fotoProduto(empresaId: number, id: number): Promise<string | null> {
  await garantirSchema();
  const { rows } = await pool.query<{ foto: string | null }>(
    "SELECT foto FROM produto WHERE id = $1 AND empresa_id = $2",
    [id, empresaId]
  );
  return rows[0]?.foto ?? null;
}

/** Só troca a foto — usado ao tirar a foto direto do card na lista de produtos. */
export async function atualizarFotoProduto(
  empresaId: number,
  id: number,
  dataUrl: string
): Promise<boolean> {
  await garantirSchema();
  const r = await pool.query(
    "UPDATE produto SET foto = NULLIF($3, ''), alterado_em = now() WHERE id = $1 AND empresa_id = $2",
    [id, empresaId, dataUrl]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function excluirProduto(empresaId: number, id: number): Promise<boolean> {
  const r = await pool.query(
    "DELETE FROM produto WHERE id = $1 AND empresa_id = $2",
    [id, empresaId]
  );
  return (r.rowCount ?? 0) > 0;
}

// ---------- empresas e usuarios ----------

export type Empresa = {
  id: number;
  nome: string;
  documento: string | null;
  telefone: string | null;
  telefone_whatsapp?: boolean;
  cidade: string | null;
  endereco?: string | null;
  pix_chave?: string | null;
  situacao: "pendente" | "aprovada" | "reprovada";
  motivo: string | null;
  criada_em: string;
  total_usuarios?: string;
};

export async function listarEmpresas(situacao?: string, q = ""): Promise<Empresa[]> {
  const cond: string[] = [];
  const params: unknown[] = [];
  if (situacao && situacao !== "todas") {
    params.push(situacao);
    cond.push(`e.situacao = $${params.length}`);
  }
  const t = q.trim();
  if (t) {
    params.push(t);
    cond.push(`f_unaccent(lower(e.nome)) LIKE '%' || f_unaccent(lower($${params.length})) || '%'`);
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const { rows } = await pool.query<Empresa>(
    `SELECT e.*, (SELECT COUNT(*) FROM usuario u WHERE u.empresa_id = e.id) AS total_usuarios
       FROM empresa e ${where}
      ORDER BY CASE e.situacao WHEN 'pendente' THEN 0 ELSE 1 END, e.criada_em DESC`,
    params
  );
  return rows;
}

export async function decidirEmpresa(
  id: number,
  situacao: "aprovada" | "reprovada",
  motivo?: string | null
): Promise<Empresa | null> {
  const { rows } = await pool.query<Empresa>(
    `UPDATE empresa
        SET situacao = $2, motivo = $3, decidida_em = now()
      WHERE id = $1
      RETURNING *`,
    [id, situacao, motivo ?? null]
  );
  return rows[0] ?? null;
}

export async function editarEmpresa(
  id: number,
  dados: {
    nome: string;
    documento: string;
    telefone: string | null;
    telefoneWhatsapp: boolean;
    cidade: string | null;
  }
): Promise<Empresa | null> {
  await garantirSchema();
  const { rows } = await pool.query<Empresa>(
    `UPDATE empresa
        SET nome = $2, documento = $3, telefone = $4, telefone_whatsapp = $5, cidade = $6
      WHERE id = $1
      RETURNING *`,
    [id, dados.nome, dados.documento, dados.telefone, dados.telefoneWhatsapp, dados.cidade]
  );
  return rows[0] ?? null;
}

// ---------- configuracoes da empresa (dados proprios + Pix) ----------

export type EmpresaConfig = {
  id: number;
  nome: string;
  documento: string | null;
  telefone: string | null;
  telefone_whatsapp: boolean;
  cidade: string | null;
  cep: string | null;
  endereco: string | null;
  horario: string | null;
  pix_chave: string | null;
  pix_nome: string | null;
};

export type EmpresaConfigEntrada = {
  nome: string;
  documento: string | null;
  telefone: string | null;
  telefoneWhatsapp: boolean;
  cidade: string | null;
  cep: string | null;
  endereco: string | null;
  horario: string | null;
  pixChave: string | null;
  pixNome: string | null;
};

const CAMPOS_EMPRESA_CONFIG =
  "id, nome, documento, telefone, telefone_whatsapp, cidade, cep, endereco, horario, pix_chave, pix_nome";

export async function configEmpresa(empresaId: number): Promise<EmpresaConfig | null> {
  await garantirSchema();
  const { rows } = await pool.query<EmpresaConfig>(
    `SELECT ${CAMPOS_EMPRESA_CONFIG} FROM empresa WHERE id = $1`,
    [empresaId]
  );
  return rows[0] ?? null;
}

export async function salvarConfigEmpresa(
  empresaId: number,
  d: EmpresaConfigEntrada
): Promise<EmpresaConfig | null> {
  await garantirSchema();
  const { rows } = await pool.query<EmpresaConfig>(
    `UPDATE empresa
        SET nome = $2, documento = $3, telefone = $4, telefone_whatsapp = $5, cidade = $6, cep = $7,
            endereco = $8, horario = $9, pix_chave = $10, pix_nome = $11
      WHERE id = $1
      RETURNING ${CAMPOS_EMPRESA_CONFIG}`,
    [
      empresaId, d.nome, d.documento, d.telefone, d.telefoneWhatsapp, d.cidade, d.cep,
      d.endereco, d.horario, d.pixChave, d.pixNome,
    ]
  );
  return rows[0] ?? null;
}

export type UsuarioResumo = {
  id: number;
  nome: string;
  email: string;
  papel: "super_admin" | "admin" | "operador";
  ativo: boolean;
};

export async function listarUsuariosDaEmpresa(empresaId: number): Promise<UsuarioResumo[]> {
  const { rows } = await pool.query<UsuarioResumo>(
    `SELECT id, nome, email, papel, ativo FROM usuario WHERE empresa_id = $1 ORDER BY nome`,
    [empresaId]
  );
  return rows;
}

export async function alterarSenhaUsuario(id: number, senhaHash: string): Promise<boolean> {
  const r = await pool.query("UPDATE usuario SET senha_hash = $2 WHERE id = $1", [id, senhaHash]);
  return (r.rowCount ?? 0) > 0;
}

export type UsuarioLogin = {
  id: number;
  nome: string;
  email: string;
  senha_hash: string | null;
  papel: "super_admin" | "admin" | "operador";
  ativo: boolean;
  empresa_id: number | null;
  empresa_nome: string | null;
  empresa_situacao: string | null;
};

const CAMPOS_LOGIN = `u.id, u.nome, u.email, u.senha_hash, u.papel, u.ativo, u.empresa_id,
            e.nome AS empresa_nome, e.situacao AS empresa_situacao
       FROM usuario u
       LEFT JOIN empresa e ON e.id = u.empresa_id`;

export async function usuarioPorEmail(email: string): Promise<UsuarioLogin | null> {
  const { rows } = await pool.query<UsuarioLogin>(
    `SELECT ${CAMPOS_LOGIN} WHERE lower(u.email) = lower($1)`,
    [email.trim()]
  );
  return rows[0] ?? null;
}

export async function usuarioPorId(id: number): Promise<UsuarioLogin | null> {
  const { rows } = await pool.query<UsuarioLogin>(
    `SELECT ${CAMPOS_LOGIN} WHERE u.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

/**
 * Troca o próprio perfil (o usuário vem sempre da sessão).
 * `foto`: `undefined` mantém a atual, `""` remove, um data URL substitui.
 */
export async function alterarPerfilUsuario(
  id: number,
  nome: string,
  foto?: string
): Promise<void> {
  await garantirSchema();
  if (foto === undefined) {
    await pool.query("UPDATE usuario SET nome = $2 WHERE id = $1", [id, nome]);
  } else {
    await pool.query("UPDATE usuario SET nome = $2, foto = NULLIF($3, '') WHERE id = $1", [
      id,
      nome,
      foto,
    ]);
  }
}

export async function fotoUsuario(id: number): Promise<string | null> {
  await garantirSchema();
  const { rows } = await pool.query<{ foto: string | null }>(
    "SELECT foto FROM usuario WHERE id = $1",
    [id]
  );
  return rows[0]?.foto ?? null;
}

/** Preenche a foto (vinda do Google/Facebook) só se o usuário ainda não tiver uma. */
export async function definirFotoUsuarioSeVazia(id: number, dataUrl: string): Promise<void> {
  if (!dataUrl) return;
  await garantirSchema();
  await pool.query(
    "UPDATE usuario SET foto = $2 WHERE id = $1 AND (foto IS NULL OR foto = '')",
    [id, dataUrl]
  );
}

// ---------- identidades sociais (Google/Facebook) ----------

export async function usuarioPorIdentidade(
  provedor: string,
  provedorId: string
): Promise<UsuarioLogin | null> {
  await garantirSchema();
  const { rows } = await pool.query<UsuarioLogin>(
    `SELECT ${CAMPOS_LOGIN}
       JOIN usuario_identidade i ON i.usuario_id = u.id
      WHERE i.provedor = $1 AND i.provedor_id = $2`,
    [provedor, provedorId]
  );
  return rows[0] ?? null;
}

export async function vincularIdentidade(
  usuarioId: number,
  provedor: string,
  provedorId: string
): Promise<void> {
  await garantirSchema();
  await pool.query(
    `INSERT INTO usuario_identidade (usuario_id, provedor, provedor_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (provedor, provedor_id) DO NOTHING`,
    [usuarioId, provedor, provedorId]
  );
}

// ---------- custos (gastos) ----------

export type Custo = {
  id: number;
  descricao: string;
  beneficiario: string;
  valor: string;
  criado_em: string;
};

export async function listarCustos(empresaId: number, limite = 100): Promise<Custo[]> {
  const { rows } = await pool.query<Custo>(
    `SELECT id, descricao, beneficiario, valor, criado_em FROM custo
      WHERE empresa_id = $1
      ORDER BY criado_em DESC
      LIMIT $2`,
    [empresaId, limite]
  );
  return rows;
}

export async function criarCusto(
  empresaId: number,
  descricao: string,
  beneficiario: string,
  valor: number
): Promise<Custo> {
  const { rows } = await pool.query<Custo>(
    `INSERT INTO custo (empresa_id, descricao, beneficiario, valor)
     VALUES ($1, $2, $3, $4)
     RETURNING id, descricao, beneficiario, valor, criado_em`,
    [empresaId, descricao, beneficiario, valor]
  );
  return rows[0];
}

export async function excluirCusto(empresaId: number, id: number): Promise<boolean> {
  const r = await pool.query(
    "DELETE FROM custo WHERE id = $1 AND empresa_id = $2",
    [id, empresaId]
  );
  return (r.rowCount ?? 0) > 0;
}

// ---------- cascos (emprestimo de engradados/garrafas) ----------

export type Casco = {
  id: number;
  responsavel: string;
  telefone: string;
  telefone_whatsapp: boolean;
  endereco: string;
  quantidade: number;
  devolvido: boolean;
  devolvido_em: string | null;
  criado_em: string;
};

const CAMPOS_CASCO =
  "id, responsavel, telefone, telefone_whatsapp, endereco, quantidade, devolvido, devolvido_em, criado_em";

export async function listarCascos(empresaId: number, situacao?: string): Promise<Casco[]> {
  await garantirSchema();
  const filtro =
    situacao === "emprestados" ? "AND devolvido = false"
    : situacao === "devolvidos" ? "AND devolvido = true"
    : "";
  const { rows } = await pool.query<Casco>(
    `SELECT ${CAMPOS_CASCO} FROM casco
      WHERE empresa_id = $1 ${filtro}
      ORDER BY devolvido, criado_em DESC`,
    [empresaId]
  );
  return rows;
}

export async function criarCasco(
  empresaId: number,
  dados: { responsavel: string; telefone: string; whatsapp: boolean; endereco: string; quantidade: number }
): Promise<Casco> {
  await garantirSchema();
  const { rows } = await pool.query<Casco>(
    `INSERT INTO casco (empresa_id, responsavel, telefone, telefone_whatsapp, endereco, quantidade)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING ${CAMPOS_CASCO}`,
    [empresaId, dados.responsavel, dados.telefone, dados.whatsapp, dados.endereco, dados.quantidade]
  );
  return rows[0];
}

export async function marcarCascoDevolvido(empresaId: number, id: number): Promise<Casco | null> {
  await garantirSchema();
  const { rows } = await pool.query<Casco>(
    `UPDATE casco SET devolvido = true, devolvido_em = now()
      WHERE id = $1 AND empresa_id = $2
      RETURNING ${CAMPOS_CASCO}`,
    [id, empresaId]
  );
  return rows[0] ?? null;
}

export async function excluirCasco(empresaId: number, id: number): Promise<boolean> {
  const r = await pool.query(
    "DELETE FROM casco WHERE id = $1 AND empresa_id = $2",
    [id, empresaId]
  );
  return (r.rowCount ?? 0) > 0;
}

// ---------- clientes ----------
// A foto (data URL, obrigatoria) fica fora dos campos comuns; nas listas so
// vai o saldo devedor calculado em cima de fiado.

export type Cliente = {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  whatsapp: boolean;
  endereco: string;
  cep: string | null;
  nota: number | null;
  criado_em: string;
  saldo_fiado?: string;
};

export type ClienteEntrada = {
  nome: string;
  cpf: string | null;
  telefone: string | null;
  whatsapp: boolean;
  endereco: string;
  cep: string | null;
  nota: number | null;
  foto: string;
};

const CAMPOS_CLIENTE = "id, nome, cpf, telefone, whatsapp, endereco, cep, nota, criado_em";

/** So digitos do CPF. */
function soDigitos(v: string | null | undefined): string {
  return String(v ?? "").replace(/\D/g, "");
}

/**
 * Reputacao do CPF cruzando TODAS as empresas — media das notas dadas e
 * quantas lojas ja cadastraram esse cliente. So numeros agregados, sem nome
 * nem endereco de ninguem. Serve pra decidir fiado.
 */
export async function reputacaoPorCpf(
  cpf: string
): Promise<{ media: number | null; avaliacoes: number; cadastros: number }> {
  await garantirSchema();
  const digitos = soDigitos(cpf);
  if (digitos.length < 11) return { media: null, avaliacoes: 0, cadastros: 0 };
  const { rows } = await pool.query<{ media: number | null; avaliacoes: string; cadastros: string }>(
    `SELECT avg(nota)::float8 AS media,
            count(nota) AS avaliacoes,
            count(*) AS cadastros
       FROM cliente
      WHERE regexp_replace(coalesce(cpf, ''), '\\D', '', 'g') = $1`,
    [digitos]
  );
  const r = rows[0];
  return {
    media: r.media,
    avaliacoes: Number(r.avaliacoes),
    cadastros: Number(r.cadastros),
  };
}

export async function listarClientes(empresaId: number, termo = ""): Promise<Cliente[]> {
  await garantirSchema();
  const t = termo.trim();
  const filtro = t
    ? `AND (f_unaccent(lower(c.nome)) LIKE '%' || f_unaccent(lower($2::text)) || '%'
           OR regexp_replace(coalesce(c.cpf,''), '\\D', '', 'g') LIKE '%' || regexp_replace($2::text, '\\D', '', 'g') || '%')`
    : "";
  const { rows } = await pool.query<Cliente>(
    `SELECT c.id, c.nome, c.cpf, c.telefone, c.whatsapp, c.endereco, c.cep, c.nota, c.criado_em,
            coalesce((SELECT sum(valor) FROM fiado f
                       WHERE f.cliente_id = c.id AND f.pago = false), 0)::float8 AS saldo_fiado
       FROM cliente c
      WHERE c.empresa_id = $1 ${filtro}
      ORDER BY c.nome`,
    t ? [empresaId, t] : [empresaId]
  );
  return rows;
}

export async function clientePorId(empresaId: number, id: number): Promise<Cliente | null> {
  await garantirSchema();
  const { rows } = await pool.query<Cliente>(
    `SELECT ${CAMPOS_CLIENTE} FROM cliente WHERE id = $1 AND empresa_id = $2`,
    [id, empresaId]
  );
  return rows[0] ?? null;
}

export async function fotoCliente(empresaId: number, id: number): Promise<string | null> {
  await garantirSchema();
  const { rows } = await pool.query<{ foto: string | null }>(
    "SELECT foto FROM cliente WHERE id = $1 AND empresa_id = $2",
    [id, empresaId]
  );
  return rows[0]?.foto ?? null;
}

export async function criarCliente(empresaId: number, c: ClienteEntrada): Promise<Cliente> {
  await garantirSchema();
  const { rows } = await pool.query<Cliente>(
    `INSERT INTO cliente (empresa_id, nome, cpf, telefone, whatsapp, endereco, cep, nota, foto)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${CAMPOS_CLIENTE}`,
    [empresaId, c.nome, c.cpf, c.telefone, c.whatsapp, c.endereco, c.cep, c.nota, c.foto]
  );
  return rows[0];
}

export async function excluirCliente(empresaId: number, id: number): Promise<boolean> {
  await garantirSchema();
  const r = await pool.query(
    "DELETE FROM cliente WHERE id = $1 AND empresa_id = $2",
    [id, empresaId]
  );
  return (r.rowCount ?? 0) > 0;
}

// ---------- fiado (contas a receber) ----------

export type Fiado = {
  id: number;
  cliente_id: number;
  cliente_nome: string;
  valor: string;
  descricao: string | null;
  pago: boolean;
  pago_em: string | null;
  criado_em: string;
};

export async function listarFiado(
  empresaId: number,
  situacao: "abertas" | "pagas" | "todas" = "abertas"
): Promise<Fiado[]> {
  await garantirSchema();
  const filtro =
    situacao === "abertas" ? "AND f.pago = false"
    : situacao === "pagas" ? "AND f.pago = true"
    : "";
  const { rows } = await pool.query<Fiado>(
    `SELECT f.id, f.cliente_id, cl.nome AS cliente_nome, f.valor, f.descricao,
            f.pago, f.pago_em, f.criado_em
       FROM fiado f
       JOIN cliente cl ON cl.id = f.cliente_id
      WHERE f.empresa_id = $1 ${filtro}
      ORDER BY cl.nome, f.criado_em DESC`,
    [empresaId]
  );
  return rows;
}

export async function criarFiado(
  empresaId: number,
  clienteId: number,
  valor: number,
  descricao: string | null
): Promise<Fiado | null> {
  await garantirSchema();
  // cliente_id checado contra a empresa da sessao pra nao lancar em cliente alheio
  const { rows } = await pool.query<Fiado>(
    `INSERT INTO fiado (empresa_id, cliente_id, valor, descricao)
     SELECT $1, cl.id, $3, $4 FROM cliente cl
      WHERE cl.id = $2 AND cl.empresa_id = $1
     RETURNING id, cliente_id, (SELECT nome FROM cliente WHERE id = cliente_id) AS cliente_nome,
               valor, descricao, pago, pago_em, criado_em`,
    [empresaId, clienteId, valor, descricao]
  );
  return rows[0] ?? null;
}

export async function marcarFiadoPago(empresaId: number, id: number): Promise<boolean> {
  await garantirSchema();
  const r = await pool.query(
    "UPDATE fiado SET pago = true, pago_em = now() WHERE id = $1 AND empresa_id = $2 AND pago = false",
    [id, empresaId]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function quitarFiadoDoCliente(empresaId: number, clienteId: number): Promise<number> {
  await garantirSchema();
  const r = await pool.query(
    "UPDATE fiado SET pago = true, pago_em = now() WHERE empresa_id = $1 AND cliente_id = $2 AND pago = false",
    [empresaId, clienteId]
  );
  return r.rowCount ?? 0;
}

// ---------- fornecedores + contas a pagar ----------

export type Fornecedor = {
  id: number;
  nome: string;
  documento: string | null;
  telefone: string | null;
  telefone_whatsapp: boolean;
  endereco: string | null;
  observacao: string | null;
  pix_chave: string | null;
  criado_em: string;
};

export type FornecedorEntrada = {
  nome: string;
  documento: string | null;
  telefone: string | null;
  telefoneWhatsapp: boolean;
  endereco: string | null;
  observacao: string | null;
  pixChave: string | null;
};

const CAMPOS_FORNECEDOR =
  "id, nome, documento, telefone, telefone_whatsapp, endereco, observacao, pix_chave, criado_em";

export async function listarFornecedores(empresaId: number, q = ""): Promise<Fornecedor[]> {
  await garantirSchema();
  const t = q.trim();
  const filtro = t
    ? `AND (f_unaccent(lower(nome)) LIKE '%' || f_unaccent(lower($2::text)) || '%'
           OR regexp_replace(coalesce(documento,''), '\\D', '', 'g')
              LIKE '%' || regexp_replace($2::text, '\\D', '', 'g') || '%')`
    : "";
  const { rows } = await pool.query<Fornecedor>(
    `SELECT ${CAMPOS_FORNECEDOR} FROM fornecedor
      WHERE empresa_id = $1 ${filtro}
      ORDER BY nome`,
    t ? [empresaId, t] : [empresaId]
  );
  return rows;
}

export async function fornecedorPorId(empresaId: number, id: number): Promise<Fornecedor | null> {
  await garantirSchema();
  const { rows } = await pool.query<Fornecedor>(
    `SELECT ${CAMPOS_FORNECEDOR} FROM fornecedor WHERE id = $1 AND empresa_id = $2`,
    [id, empresaId]
  );
  return rows[0] ?? null;
}

/** Melhor palpite de fornecedor já cadastrado a partir de um nome/CNPJ lido da nota. */
export async function acharFornecedorParecido(
  empresaId: number,
  nome: string,
  documento = ""
): Promise<Fornecedor | null> {
  await garantirSchema();
  const doc = documento.replace(/\D/g, "");
  if (doc) {
    const porDoc = await pool.query<Fornecedor>(
      `SELECT ${CAMPOS_FORNECEDOR} FROM fornecedor
        WHERE empresa_id = $1 AND regexp_replace(coalesce(documento,''), '\\D', '', 'g') = $2
        LIMIT 1`,
      [empresaId, doc]
    );
    if (porDoc.rows[0]) return porDoc.rows[0];
  }
  const t = nome.trim();
  if (t.length < 2) return null;
  const { rows } = await pool.query<Fornecedor & { s: number }>(
    `SELECT ${CAMPOS_FORNECEDOR},
            similarity(f_unaccent(lower(nome)), f_unaccent(lower($2))) AS s
       FROM fornecedor
      WHERE empresa_id = $1
        AND (f_unaccent(lower(nome)) LIKE '%' || f_unaccent(lower($2)) || '%'
             OR similarity(f_unaccent(lower(nome)), f_unaccent(lower($2))) > 0.3)
      ORDER BY s DESC
      LIMIT 1`,
    [empresaId, t]
  );
  return rows[0] ?? null;
}

export async function criarFornecedor(
  empresaId: number,
  d: FornecedorEntrada
): Promise<Fornecedor> {
  await garantirSchema();
  const { rows } = await pool.query<Fornecedor>(
    `INSERT INTO fornecedor (empresa_id, nome, documento, telefone, telefone_whatsapp, endereco, observacao, pix_chave)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${CAMPOS_FORNECEDOR}`,
    [empresaId, d.nome, d.documento, d.telefone, d.telefoneWhatsapp, d.endereco, d.observacao, d.pixChave]
  );
  return rows[0];
}

export async function atualizarFornecedor(
  empresaId: number,
  id: number,
  d: FornecedorEntrada
): Promise<Fornecedor | null> {
  await garantirSchema();
  const { rows } = await pool.query<Fornecedor>(
    `UPDATE fornecedor
        SET nome = $3, documento = $4, telefone = $5, telefone_whatsapp = $6,
            endereco = $7, observacao = $8, pix_chave = $9
      WHERE id = $1 AND empresa_id = $2
      RETURNING ${CAMPOS_FORNECEDOR}`,
    [id, empresaId, d.nome, d.documento, d.telefone, d.telefoneWhatsapp, d.endereco, d.observacao, d.pixChave]
  );
  return rows[0] ?? null;
}

export async function excluirFornecedor(empresaId: number, id: number): Promise<boolean> {
  await garantirSchema();
  const r = await pool.query("DELETE FROM fornecedor WHERE id = $1 AND empresa_id = $2", [
    id,
    empresaId,
  ]);
  return (r.rowCount ?? 0) > 0;
}

/** Categorias de conta a pagar — o rótulo bonito fica na tela. */
export const CATEGORIAS_CONTA_PAGAR = [
  "mercadoria",
  "energia",
  "agua",
  "aluguel",
  "telefone",
  "imposto",
  "salario",
  "boleto",
  "outros",
] as const;
export type CategoriaContaPagar = (typeof CATEGORIAS_CONTA_PAGAR)[number];

export type ContaPagar = {
  id: number;
  fornecedor_id: number | null;
  fornecedor_nome: string | null;
  fornecedor_pix: string | null;
  categoria: string | null;
  descricao: string | null;
  valor: string;
  vencimento: string | null;
  recorrente: boolean;
  tem_foto: boolean;
  pago: boolean;
  pago_em: string | null;
  criado_em: string;
};

export type ContaPagarEntrada = {
  fornecedorId: number | null;
  categoria: string | null;
  descricao: string | null;
  valor: number;
  vencimento: string | null;
  foto: string | null;
  /** Repete todo mês — ao quitar, o sistema já lança a do mês seguinte. */
  recorrente: boolean;
  /** Já entra quitada (checkbox "conta já paga" no cadastro). */
  pago: boolean;
};

const CAMPOS_CONTA_PAGAR = `c.id, c.fornecedor_id, fo.nome AS fornecedor_nome, fo.pix_chave AS fornecedor_pix,
       c.categoria, c.descricao, c.valor,
       to_char(c.vencimento, 'YYYY-MM-DD') AS vencimento, c.recorrente, (c.foto IS NOT NULL) AS tem_foto,
       c.pago, c.pago_em, c.criado_em`;

export async function listarContasPagar(
  empresaId: number,
  situacao: "abertas" | "pagas" | "todas" = "abertas",
  fornecedorQ = ""
): Promise<ContaPagar[]> {
  await garantirSchema();
  const filtroSit =
    situacao === "abertas" ? "AND c.pago = false"
    : situacao === "pagas" ? "AND c.pago = true"
    : "";
  const t = fornecedorQ.trim();
  const params: unknown[] = [empresaId];
  let filtroForn = "";
  if (t) {
    params.push(t);
    filtroForn = `AND f_unaccent(lower(fo.nome)) LIKE '%' || f_unaccent(lower($${params.length})) || '%'`;
  }
  const { rows } = await pool.query<ContaPagar>(
    `SELECT ${CAMPOS_CONTA_PAGAR}
       FROM conta_pagar c
       LEFT JOIN fornecedor fo ON fo.id = c.fornecedor_id
      WHERE c.empresa_id = $1 ${filtroSit} ${filtroForn}
      ORDER BY c.pago, c.vencimento DESC NULLS LAST, c.criado_em DESC`,
    params
  );
  return rows;
}

export async function criarContaPagar(
  empresaId: number,
  d: ContaPagarEntrada
): Promise<ContaPagar> {
  await garantirSchema();
  // fornecedor_id (quando vem) é conferido contra a empresa da sessão
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO conta_pagar (empresa_id, fornecedor_id, categoria, descricao, valor, vencimento, foto,
                              recorrente, pago, pago_em)
     VALUES ($1,
             (SELECT id FROM fornecedor WHERE id = $2 AND empresa_id = $1),
             $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 THEN now() END)
     RETURNING id`,
    [empresaId, d.fornecedorId, d.categoria, d.descricao, d.valor, d.vencimento, d.foto,
     d.recorrente, d.pago]
  );
  const criada = await pool.query<ContaPagar>(
    `SELECT ${CAMPOS_CONTA_PAGAR}
       FROM conta_pagar c LEFT JOIN fornecedor fo ON fo.id = c.fornecedor_id
      WHERE c.id = $1`,
    [rows[0].id]
  );
  return criada.rows[0];
}

export async function marcarContaPagarPaga(
  empresaId: number,
  id: number
): Promise<{ ok: boolean; proximaVencimento: string | null }> {
  await garantirSchema();
  const { rows } = await pool.query<{
    fornecedor_id: number | null;
    categoria: string | null;
    descricao: string | null;
    valor: string;
    vencimento: string | null;
    recorrente: boolean;
  }>(
    `UPDATE conta_pagar SET pago = true, pago_em = now()
      WHERE id = $1 AND empresa_id = $2 AND pago = false
      RETURNING fornecedor_id, categoria, descricao, valor,
                to_char(vencimento, 'YYYY-MM-DD') AS vencimento, recorrente`,
    [id, empresaId]
  );
  const c = rows[0];
  if (!c) return { ok: false, proximaVencimento: null };
  if (!c.recorrente) return { ok: true, proximaVencimento: null };

  // conta recorrente: já lança a do mês seguinte (sem foto — é outro boleto)
  const prox = await pool.query<{ vencimento: string | null }>(
    `INSERT INTO conta_pagar (empresa_id, fornecedor_id, categoria, descricao, valor, vencimento, recorrente)
     VALUES ($1, $2, $3, $4, $5,
             CASE WHEN $6::date IS NOT NULL THEN ($6::date + interval '1 month')::date END,
             true)
     RETURNING to_char(vencimento, 'YYYY-MM-DD') AS vencimento`,
    [empresaId, c.fornecedor_id, c.categoria, c.descricao, c.valor, c.vencimento]
  );
  return { ok: true, proximaVencimento: prox.rows[0]?.vencimento ?? null };
}

export async function reabrirContaPagar(empresaId: number, id: number): Promise<boolean> {
  await garantirSchema();
  const r = await pool.query(
    "UPDATE conta_pagar SET pago = false, pago_em = NULL WHERE id = $1 AND empresa_id = $2 AND pago = true",
    [id, empresaId]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function excluirContaPagar(empresaId: number, id: number): Promise<boolean> {
  await garantirSchema();
  const r = await pool.query("DELETE FROM conta_pagar WHERE id = $1 AND empresa_id = $2", [
    id,
    empresaId,
  ]);
  return (r.rowCount ?? 0) > 0;
}

/** Categorias personalizadas já usadas pela empresa (fora da lista padrão). */
export async function categoriasContaPagarUsadas(empresaId: number): Promise<string[]> {
  await garantirSchema();
  const { rows } = await pool.query<{ categoria: string }>(
    `SELECT DISTINCT categoria FROM conta_pagar
      WHERE empresa_id = $1 AND categoria IS NOT NULL AND categoria <> ALL($2::text[])
      ORDER BY categoria`,
    [empresaId, CATEGORIAS_CONTA_PAGAR as unknown as string[]]
  );
  return rows.map((r) => r.categoria);
}

export async function fotoContaPagar(empresaId: number, id: number): Promise<string | null> {
  await garantirSchema();
  const { rows } = await pool.query<{ foto: string | null }>(
    "SELECT foto FROM conta_pagar WHERE id = $1 AND empresa_id = $2",
    [id, empresaId]
  );
  return rows[0]?.foto ?? null;
}

// ---------- caixa (fechamento diario) ----------

export type Caixa = {
  id: number;
  data: string;
  valor: string;
  criado_em: string;
};

export async function listarCaixa(empresaId: number, limite = 60): Promise<Caixa[]> {
  const { rows } = await pool.query<Caixa>(
    `SELECT id, data::text, valor, criado_em FROM caixa
      WHERE empresa_id = $1
      ORDER BY data DESC
      LIMIT $2`,
    [empresaId, limite]
  );
  return rows;
}

export async function criarCaixa(empresaId: number, valor: number): Promise<Caixa> {
  const { rows } = await pool.query<Caixa>(
    `INSERT INTO caixa (empresa_id, valor)
     VALUES ($1, $2)
     RETURNING id, data::text, valor, criado_em`,
    [empresaId, valor]
  );
  return rows[0];
}

export async function excluirCaixa(empresaId: number, id: number): Promise<boolean> {
  const r = await pool.query(
    "DELETE FROM caixa WHERE id = $1 AND empresa_id = $2",
    [id, empresaId]
  );
  return (r.rowCount ?? 0) > 0;
}

// ---------- relatorios ----------
// Tudo aqui e so leitura, calculado em cima de produto/custo/caixa/casco —
// nao existe tabela de venda/movimento de estoque ainda (ver CLAUDE.md).

export type ResumoEstoque = {
  produtosAtivos: number;
  valorVenda: number;
  valorCompra: number;
  lucroPotencial: number;
};

export async function resumoEstoque(empresaId: number): Promise<ResumoEstoque> {
  const { rows } = await pool.query(
    `SELECT
       count(*)::int AS produtos_ativos,
       coalesce(sum(estoque * preco), 0)::float8 AS valor_venda,
       coalesce(sum(estoque * preco_compra), 0)::float8 AS valor_compra
     FROM produto
     WHERE ativo AND empresa_id = $1`,
    [empresaId]
  );
  const r = rows[0];
  return {
    produtosAtivos: r.produtos_ativos,
    valorVenda: r.valor_venda,
    valorCompra: r.valor_compra,
    lucroPotencial: r.valor_venda - r.valor_compra,
  };
}

export type CategoriaValor = { categoria: string; quantidade: number; valor: number };

export async function estoquePorCategoria(empresaId: number): Promise<CategoriaValor[]> {
  const { rows } = await pool.query<CategoriaValor>(
    `SELECT coalesce(categoria, 'Sem categoria') AS categoria,
            count(*)::int AS quantidade,
            coalesce(sum(estoque * preco), 0)::float8 AS valor
       FROM produto
      WHERE ativo AND empresa_id = $1
      GROUP BY categoria
      ORDER BY valor DESC
      LIMIT 10`,
    [empresaId]
  );
  return rows;
}

export type ProdutoAlerta = {
  id: number;
  nome: string;
  preco: number;
  preco_compra: number;
  estoque: number;
  estoque_minimo?: number | null;
  estoque_minimo_embalagem?: string | null;
};

/** Produtos vendendo abaixo do preco de compra — prejuizo por unidade vendida. */
export async function produtosNoPrejuizo(empresaId: number, limite = 10): Promise<ProdutoAlerta[]> {
  const { rows } = await pool.query<ProdutoAlerta>(
    `SELECT id, nome, preco::float8, preco_compra::float8, estoque::float8 AS estoque
       FROM produto
      WHERE ativo AND empresa_id = $1 AND preco_compra > 0 AND preco < preco_compra
      ORDER BY (preco_compra - preco) DESC
      LIMIT $2`,
    [empresaId, limite]
  );
  return rows;
}

/**
 * Estoque baixo: usa o limite que o comerciante marcou no produto
 * (`estoque_minimo`) e, pra quem não marcou nada, cai num padrão geral.
 */
export async function produtosEstoqueBaixo(
  empresaId: number,
  limiarPadrao = 3,
  limite = 15
): Promise<ProdutoAlerta[]> {
  await garantirSchema();
  const { rows } = await pool.query<ProdutoAlerta>(
    `SELECT id, nome, preco::float8, preco_compra::float8, estoque::float8 AS estoque,
            estoque_minimo::float8 AS estoque_minimo, estoque_minimo_embalagem
       FROM produto
      WHERE ativo AND empresa_id = $1
        AND estoque <= COALESCE(estoque_minimo, $2)
      ORDER BY (estoque - COALESCE(estoque_minimo, $2)) ASC, estoque ASC, nome
      LIMIT $3`,
    [empresaId, limiarPadrao, limite]
  );
  return rows;
}

export type BeneficiarioValor = { beneficiario: string; valor: number };

export async function gastosPorBeneficiario(
  empresaId: number,
  dias = 90,
  limite = 8
): Promise<BeneficiarioValor[]> {
  const { rows } = await pool.query<BeneficiarioValor>(
    `SELECT beneficiario, coalesce(sum(valor), 0)::float8 AS valor
       FROM custo
      WHERE empresa_id = $1 AND criado_em >= now() - ($2 || ' days')::interval
      GROUP BY beneficiario
      ORDER BY valor DESC
      LIMIT $3`,
    [empresaId, dias, limite]
  );
  return rows;
}

export type MesValor = { mes: string; valor: number };

export async function gastosPorMes(empresaId: number, meses = 6): Promise<MesValor[]> {
  const { rows } = await pool.query<MesValor>(
    `SELECT to_char(date_trunc('month', m), 'YYYY-MM') AS mes,
            coalesce(sum(c.valor), 0)::float8 AS valor
       FROM generate_series(
              date_trunc('month', now()) - ((($2::int) - 1) || ' months')::interval,
              date_trunc('month', now()),
              interval '1 month'
            ) AS m
       LEFT JOIN custo c
              ON c.empresa_id = $1
             AND date_trunc('month', c.criado_em) = date_trunc('month', m)
      GROUP BY m
      ORDER BY m`,
    [empresaId, meses]
  );
  return rows;
}

export async function gastoTotalMesAtual(empresaId: number): Promise<number> {
  const { rows } = await pool.query(
    `SELECT coalesce(sum(valor), 0)::float8 AS total
       FROM custo
      WHERE empresa_id = $1 AND criado_em >= date_trunc('month', now())`,
    [empresaId]
  );
  return rows[0].total;
}

export type DiaValor = { data: string; valor: number };

/** Serie diaria do fechamento de caixa — proxy de receita, ja que nao existe log de venda. */
export async function caixaSerie(empresaId: number, dias = 30): Promise<DiaValor[]> {
  const { rows } = await pool.query<DiaValor>(
    `SELECT data::text, valor::float8 AS valor
       FROM caixa
      WHERE empresa_id = $1 AND data >= (current_date - ($2 || ' days')::interval)
      ORDER BY data`,
    [empresaId, dias]
  );
  return rows;
}

export type ResumoCascos = {
  emprestados: number;
  quantidadeTotal: number;
  maisAntigos: { id: number; responsavel: string; quantidade: number; criado_em: string }[];
};

export async function resumoCascos(empresaId: number): Promise<ResumoCascos> {
  const total = await pool.query(
    `SELECT count(*)::int AS emprestados, coalesce(sum(quantidade), 0)::int AS quantidade_total
       FROM casco WHERE empresa_id = $1 AND devolvido = false`,
    [empresaId]
  );
  const antigos = await pool.query(
    `SELECT id, responsavel, quantidade, criado_em::text
       FROM casco
      WHERE empresa_id = $1 AND devolvido = false
      ORDER BY criado_em ASC
      LIMIT 5`,
    [empresaId]
  );
  return {
    emprestados: total.rows[0].emprestados,
    quantidadeTotal: total.rows[0].quantidade_total,
    maisAntigos: antigos.rows,
  };
}
