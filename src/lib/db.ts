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
  client.query("SET search_path TO public");
});

if (process.env.NODE_ENV !== "production") global._pgPool = pool;

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
};

const CAMPOS =
  "id, nome, categoria, local, unidade, tipo_venda, preco, preco_compra, estoque";

export async function buscarProduto(
  empresaId: number,
  termo: string,
  limite = 8
): Promise<Produto[]> {
  const { rows } = await pool.query<Produto>(
    "SELECT * FROM buscar_produto($1::bigint, $2::text, $3::int)",
    [empresaId, termo, limite]
  );
  return rows;
}

export async function produtoPorId(empresaId: number, id: number): Promise<Produto | null> {
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
  const { rows } = await pool.query<Produto>(
    `INSERT INTO produto (empresa_id, nome, categoria, local, unidade, tipo_venda, preco, preco_compra, estoque)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING ${CAMPOS}`,
    [
      empresaId, p.nome, p.categoria ?? null, p.local ?? null, p.unidade ?? "unidade",
      p.tipoVenda, p.preco, p.precoCompra, p.estoque,
    ]
  );
  return rows[0];
}

export async function atualizarProduto(
  empresaId: number,
  id: number,
  p: ProdutoEntrada
): Promise<Produto | null> {
  // o empresa_id no WHERE impede alterar produto de outra loja
  const { rows } = await pool.query<Produto>(
    `UPDATE produto
        SET nome = $3, categoria = $4, local = $5, unidade = $6,
            tipo_venda = $7, preco = $8, preco_compra = $9, estoque = $10,
            alterado_em = now()
      WHERE id = $1 AND empresa_id = $2
      RETURNING ${CAMPOS}`,
    [
      id, empresaId, p.nome, p.categoria ?? null, p.local ?? null,
      p.unidade ?? "unidade", p.tipoVenda, p.preco, p.precoCompra, p.estoque,
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
  const { rows } = await pool.query<Produto>(
    `UPDATE produto SET estoque = $3, alterado_em = now()
      WHERE id = $1 AND empresa_id = $2
      RETURNING ${CAMPOS}`,
    [id, empresaId, novoEstoque]
  );
  return rows[0] ?? null;
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
  cidade: string | null;
  situacao: "pendente" | "aprovada" | "reprovada";
  motivo: string | null;
  criada_em: string;
  total_usuarios?: string;
};

export async function listarEmpresas(situacao?: string): Promise<Empresa[]> {
  const filtro = situacao && situacao !== "todas" ? "WHERE e.situacao = $1" : "";
  const { rows } = await pool.query<Empresa>(
    `SELECT e.*, (SELECT COUNT(*) FROM usuario u WHERE u.empresa_id = e.id) AS total_usuarios
       FROM empresa e ${filtro}
      ORDER BY CASE e.situacao WHEN 'pendente' THEN 0 ELSE 1 END, e.criada_em DESC`,
    filtro ? [situacao] : []
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
  dados: { nome: string; documento: string; telefone: string | null; cidade: string | null }
): Promise<Empresa | null> {
  const { rows } = await pool.query<Empresa>(
    `UPDATE empresa
        SET nome = $2, documento = $3, telefone = $4, cidade = $5
      WHERE id = $1
      RETURNING *`,
    [id, dados.nome, dados.documento, dados.telefone, dados.cidade]
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
  senha_hash: string;
  papel: "super_admin" | "admin" | "operador";
  ativo: boolean;
  empresa_id: number | null;
  empresa_nome: string | null;
  empresa_situacao: string | null;
};

export async function usuarioPorEmail(email: string): Promise<UsuarioLogin | null> {
  const { rows } = await pool.query<UsuarioLogin>(
    `SELECT u.id, u.nome, u.email, u.senha_hash, u.papel, u.ativo, u.empresa_id,
            e.nome AS empresa_nome, e.situacao AS empresa_situacao
       FROM usuario u
       LEFT JOIN empresa e ON e.id = u.empresa_id
      WHERE lower(u.email) = lower($1)`,
    [email.trim()]
  );
  return rows[0] ?? null;
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
  endereco: string;
  quantidade: number;
  devolvido: boolean;
  devolvido_em: string | null;
  criado_em: string;
};

export async function listarCascos(empresaId: number, situacao?: string): Promise<Casco[]> {
  const filtro =
    situacao === "emprestados" ? "AND devolvido = false"
    : situacao === "devolvidos" ? "AND devolvido = true"
    : "";
  const { rows } = await pool.query<Casco>(
    `SELECT id, responsavel, telefone, endereco, quantidade, devolvido, devolvido_em, criado_em
       FROM casco
      WHERE empresa_id = $1 ${filtro}
      ORDER BY devolvido, criado_em DESC`,
    [empresaId]
  );
  return rows;
}

export async function criarCasco(
  empresaId: number,
  dados: { responsavel: string; telefone: string; endereco: string; quantidade: number }
): Promise<Casco> {
  const { rows } = await pool.query<Casco>(
    `INSERT INTO casco (empresa_id, responsavel, telefone, endereco, quantidade)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, responsavel, telefone, endereco, quantidade, devolvido, devolvido_em, criado_em`,
    [empresaId, dados.responsavel, dados.telefone, dados.endereco, dados.quantidade]
  );
  return rows[0];
}

export async function marcarCascoDevolvido(empresaId: number, id: number): Promise<Casco | null> {
  const { rows } = await pool.query<Casco>(
    `UPDATE casco SET devolvido = true, devolvido_em = now()
      WHERE id = $1 AND empresa_id = $2
      RETURNING id, responsavel, telefone, endereco, quantidade, devolvido, devolvido_em, criado_em`,
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

export async function produtosEstoqueBaixo(
  empresaId: number,
  limiar = 3,
  limite = 15
): Promise<ProdutoAlerta[]> {
  const { rows } = await pool.query<ProdutoAlerta>(
    `SELECT id, nome, preco::float8, preco_compra::float8, estoque::float8 AS estoque
       FROM produto
      WHERE ativo AND empresa_id = $1 AND estoque <= $2
      ORDER BY estoque ASC, nome
      LIMIT $3`,
    [empresaId, limiar, limite]
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
