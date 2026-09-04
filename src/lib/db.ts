import { Pool } from "pg";
import {
  CATEGORIAS_FORNECEDOR_PRODUTO,
  type FornecedorProdutoEntrada,
} from "@/lib/fornecedorProduto";
import {
  precoAplicavel,
  proximoStatusValido,
  type StatusPedido,
  type UnidadePedido,
} from "@/lib/pedido";
import {
  normalizarNomeProduto as _normNome,
  variantesBuscaProduto,
} from "@/lib/textoProduto";

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
  // db/20 — registro de vendas (o /vendas). `data` é a data LOCAL do balcão,
  // mandada pelo cliente, pra o filtro por dia não depender de fuso.
  `CREATE TABLE IF NOT EXISTS venda (
     id bigserial PRIMARY KEY,
     empresa_id bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
     data date NOT NULL DEFAULT CURRENT_DATE,
     total numeric(10,2) NOT NULL DEFAULT 0,
     qtd_itens integer NOT NULL DEFAULT 0,
     criado_em timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE INDEX IF NOT EXISTS idx_venda_empresa_data ON venda (empresa_id, data DESC, criado_em DESC)",
  `CREATE TABLE IF NOT EXISTS venda_item (
     id bigserial PRIMARY KEY,
     venda_id bigint NOT NULL REFERENCES venda(id) ON DELETE CASCADE,
     produto_id bigint,
     nome text NOT NULL,
     quantidade numeric(12,3) NOT NULL,
     preco_unit numeric(10,2) NOT NULL,
     tipo_venda text NOT NULL DEFAULT 'unidade'
   )`,
  "CREATE INDEX IF NOT EXISTS idx_venda_item_venda ON venda_item (venda_id)",
  `CREATE TABLE IF NOT EXISTS venda_pagamento (
     id bigserial PRIMARY KEY,
     venda_id bigint NOT NULL REFERENCES venda(id) ON DELETE CASCADE,
     forma text NOT NULL,
     valor numeric(10,2) NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS idx_venda_pagamento_venda ON venda_pagamento (venda_id)",
  // db/21 — o que foi retirado no empréstimo (antigo "casco")
  "ALTER TABLE casco ADD COLUMN IF NOT EXISTS item text",
  // db/22 — anotações com lembrete
  `CREATE TABLE IF NOT EXISTS anotacao (
     id bigserial PRIMARY KEY,
     empresa_id bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
     texto text NOT NULL,
     data_alerta date,
     concluida boolean NOT NULL DEFAULT false,
     criado_em timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE INDEX IF NOT EXISTS idx_anotacao_empresa ON anotacao (empresa_id, concluida, data_alerta)",
  // db/23 — cadastro publico de fornecedor + bairros atendidos (lancamento em Conselheiro Lafaiete)
  `CREATE TABLE IF NOT EXISTS bairro (
     id bigserial PRIMARY KEY,
     cidade text NOT NULL,
     uf text NOT NULL DEFAULT 'MG',
     nome text NOT NULL,
     UNIQUE (cidade, uf, nome)
   )`,
  `INSERT INTO bairro (cidade, uf, nome) VALUES
     ('Conselheiro Lafaiete', 'MG', 'Albertina'),
     ('Conselheiro Lafaiete', 'MG', 'Albinópolis'),
     ('Conselheiro Lafaiete', 'MG', 'Almeidas'),
     ('Conselheiro Lafaiete', 'MG', 'Alvorada'),
     ('Conselheiro Lafaiete', 'MG', 'Amaro Ribeiro'),
     ('Conselheiro Lafaiete', 'MG', 'Angélica'),
     ('Conselheiro Lafaiete', 'MG', 'Arcádia'),
     ('Conselheiro Lafaiete', 'MG', 'Área Rural'),
     ('Conselheiro Lafaiete', 'MG', 'Areal'),
     ('Conselheiro Lafaiete', 'MG', 'Barreira'),
     ('Conselheiro Lafaiete', 'MG', 'Bela Vista'),
     ('Conselheiro Lafaiete', 'MG', 'Bellavinha'),
     ('Conselheiro Lafaiete', 'MG', 'Belvedere'),
     ('Conselheiro Lafaiete', 'MG', 'Bom Pastor'),
     ('Conselheiro Lafaiete', 'MG', 'Buarque de Macedo'),
     ('Conselheiro Lafaiete', 'MG', 'Cachoeira'),
     ('Conselheiro Lafaiete', 'MG', 'Campo Alegre'),
     ('Conselheiro Lafaiete', 'MG', 'Carijós'),
     ('Conselheiro Lafaiete', 'MG', 'Centro'),
     ('Conselheiro Lafaiete', 'MG', 'Chapada'),
     ('Conselheiro Lafaiete', 'MG', 'Cidade Jardim'),
     ('Conselheiro Lafaiete', 'MG', 'Cidade Nova'),
     ('Conselheiro Lafaiete', 'MG', 'Copacabana'),
     ('Conselheiro Lafaiete', 'MG', 'Distrito Industrial'),
     ('Conselheiro Lafaiete', 'MG', 'Expedicionários'),
     ('Conselheiro Lafaiete', 'MG', 'Fonte Grande'),
     ('Conselheiro Lafaiete', 'MG', 'Funcionários'),
     ('Conselheiro Lafaiete', 'MG', 'Gagé'),
     ('Conselheiro Lafaiete', 'MG', 'Gigante'),
     ('Conselheiro Lafaiete', 'MG', 'Granja das Hortênsias'),
     ('Conselheiro Lafaiete', 'MG', 'Jardim América'),
     ('Conselheiro Lafaiete', 'MG', 'Jardim Canadá'),
     ('Conselheiro Lafaiete', 'MG', 'Jardim das Flores'),
     ('Conselheiro Lafaiete', 'MG', 'Jardim do Sol'),
     ('Conselheiro Lafaiete', 'MG', 'Jardim dos Cristais'),
     ('Conselheiro Lafaiete', 'MG', 'Jardim Eldorado'),
     ('Conselheiro Lafaiete', 'MG', 'Jardim Europa'),
     ('Conselheiro Lafaiete', 'MG', 'Jardim Inconfidentes'),
     ('Conselheiro Lafaiete', 'MG', 'Jardim Monte Verde'),
     ('Conselheiro Lafaiete', 'MG', 'Jardim São Geraldo'),
     ('Conselheiro Lafaiete', 'MG', 'Jardim Vila Rica'),
     ('Conselheiro Lafaiete', 'MG', 'Jardim Vitória'),
     ('Conselheiro Lafaiete', 'MG', 'JK'),
     ('Conselheiro Lafaiete', 'MG', 'Lima Dias'),
     ('Conselheiro Lafaiete', 'MG', 'Lourdes'),
     ('Conselheiro Lafaiete', 'MG', 'Manoel Corrêa'),
     ('Conselheiro Lafaiete', 'MG', 'Manoel de Paula'),
     ('Conselheiro Lafaiete', 'MG', 'Moinhos'),
     ('Conselheiro Lafaiete', 'MG', 'Monte Cristo'),
     ('Conselheiro Lafaiete', 'MG', 'Morada do Sol'),
     ('Conselheiro Lafaiete', 'MG', 'Morro da Mina'),
     ('Conselheiro Lafaiete', 'MG', 'Museu'),
     ('Conselheiro Lafaiete', 'MG', 'Nossa Senhora da Guia'),
     ('Conselheiro Lafaiete', 'MG', 'Novo Horizonte'),
     ('Conselheiro Lafaiete', 'MG', 'Oscar Corrêa'),
     ('Conselheiro Lafaiete', 'MG', 'Ouro Verde'),
     ('Conselheiro Lafaiete', 'MG', 'Parque Bandeirantes'),
     ('Conselheiro Lafaiete', 'MG', 'Parque Cidade'),
     ('Conselheiro Lafaiete', 'MG', 'Parque das Acácias'),
     ('Conselheiro Lafaiete', 'MG', 'Parque Dom Bosco'),
     ('Conselheiro Lafaiete', 'MG', 'Parque dos Ferroviários'),
     ('Conselheiro Lafaiete', 'MG', 'Parque Montreal'),
     ('Conselheiro Lafaiete', 'MG', 'Parque Recanto da Hípica'),
     ('Conselheiro Lafaiete', 'MG', 'Paulo VI'),
     ('Conselheiro Lafaiete', 'MG', 'Progresso'),
     ('Conselheiro Lafaiete', 'MG', 'Queluz'),
     ('Conselheiro Lafaiete', 'MG', 'Quinta das Flores'),
     ('Conselheiro Lafaiete', 'MG', 'Quintas do Imperador'),
     ('Conselheiro Lafaiete', 'MG', 'Quintas do Sol'),
     ('Conselheiro Lafaiete', 'MG', 'Rancho Novo'),
     ('Conselheiro Lafaiete', 'MG', 'Real de Queluz'),
     ('Conselheiro Lafaiete', 'MG', 'Recanto dos Colibris'),
     ('Conselheiro Lafaiete', 'MG', 'Rezende'),
     ('Conselheiro Lafaiete', 'MG', 'Rochedo'),
     ('Conselheiro Lafaiete', 'MG', 'Rosário'),
     ('Conselheiro Lafaiete', 'MG', 'Sagrada Família'),
     ('Conselheiro Lafaiete', 'MG', 'Sagrado Coração de Jesus'),
     ('Conselheiro Lafaiete', 'MG', 'Santa Clara'),
     ('Conselheiro Lafaiete', 'MG', 'Santa Cruz'),
     ('Conselheiro Lafaiete', 'MG', 'Santa Efigênia'),
     ('Conselheiro Lafaiete', 'MG', 'Santa Fé'),
     ('Conselheiro Lafaiete', 'MG', 'Santa Luzia'),
     ('Conselheiro Lafaiete', 'MG', 'Santa Maria'),
     ('Conselheiro Lafaiete', 'MG', 'Santa Matilde'),
     ('Conselheiro Lafaiete', 'MG', 'Santa Rosa'),
     ('Conselheiro Lafaiete', 'MG', 'Santa Tereza'),
     ('Conselheiro Lafaiete', 'MG', 'Santa Terezinha'),
     ('Conselheiro Lafaiete', 'MG', 'Santo Agostinho'),
     ('Conselheiro Lafaiete', 'MG', 'Santo Antônio'),
     ('Conselheiro Lafaiete', 'MG', 'São Benedito'),
     ('Conselheiro Lafaiete', 'MG', 'São Dimas'),
     ('Conselheiro Lafaiete', 'MG', 'São Gonçalo do Brandão'),
     ('Conselheiro Lafaiete', 'MG', 'São João'),
     ('Conselheiro Lafaiete', 'MG', 'São Jorge'),
     ('Conselheiro Lafaiete', 'MG', 'São José'),
     ('Conselheiro Lafaiete', 'MG', 'São Judas Tadeu'),
     ('Conselheiro Lafaiete', 'MG', 'São Lucas'),
     ('Conselheiro Lafaiete', 'MG', 'São Marcos'),
     ('Conselheiro Lafaiete', 'MG', 'São Sebastião'),
     ('Conselheiro Lafaiete', 'MG', 'São Vicente de Paula'),
     ('Conselheiro Lafaiete', 'MG', 'Satélite'),
     ('Conselheiro Lafaiete', 'MG', 'Siderúrgico'),
     ('Conselheiro Lafaiete', 'MG', 'Sion'),
     ('Conselheiro Lafaiete', 'MG', 'Tamareiras'),
     ('Conselheiro Lafaiete', 'MG', 'Tiradentes'),
     ('Conselheiro Lafaiete', 'MG', 'Topázio'),
     ('Conselheiro Lafaiete', 'MG', 'Triângulo'),
     ('Conselheiro Lafaiete', 'MG', 'União'),
     ('Conselheiro Lafaiete', 'MG', 'Vila das Andorinhas'),
     ('Conselheiro Lafaiete', 'MG', 'Vila Veneza')
   ON CONFLICT (cidade, uf, nome) DO NOTHING`,
  `CREATE TABLE IF NOT EXISTS fornecedor_publico (
     id bigserial PRIMARY KEY,
     nome text NOT NULL,
     documento text,
     telefone text,
     telefone_whatsapp boolean NOT NULL DEFAULT false,
     endereco text,
     observacao text,
     pix_chave text,
     email text NOT NULL UNIQUE,
     senha_hash text,
     cidade text NOT NULL,
     situacao text NOT NULL DEFAULT 'pendente',
     criado_em timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS fornecedor_publico_bairro (
     fornecedor_publico_id bigint NOT NULL REFERENCES fornecedor_publico(id) ON DELETE CASCADE,
     bairro_id bigint NOT NULL REFERENCES bairro(id) ON DELETE CASCADE,
     PRIMARY KEY (fornecedor_publico_id, bairro_id)
   )`,
  // db/24 — aprovação do fornecedor público pelo super admin
  "ALTER TABLE fornecedor_publico ADD COLUMN IF NOT EXISTS motivo text",
  "ALTER TABLE fornecedor_publico ADD COLUMN IF NOT EXISTS decidido_em timestamptz",
  // db/25 — bairro da loja (pro diretório de fornecedores)
  "ALTER TABLE empresa ADD COLUMN IF NOT EXISTS bairro text",
  // db/26 — catálogo de produtos do fornecedor + portfólio público
  `CREATE TABLE IF NOT EXISTS fornecedor_produto (
     id                    bigserial PRIMARY KEY,
     fornecedor_publico_id bigint NOT NULL REFERENCES fornecedor_publico(id) ON DELETE CASCADE,
     nome                  text NOT NULL,
     categoria             text NOT NULL DEFAULT '',
     foto                  text,
     preco_unidade         numeric,
     preco_desconto        numeric,
     desconto_qtd_min      integer,
     preco_caixa           numeric,
     caixa_qtd             integer,
     ordem                 integer NOT NULL DEFAULT 0,
     criado_em             timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE INDEX IF NOT EXISTS ix_fornecedor_produto_forn ON fornecedor_produto (fornecedor_publico_id)",
  "ALTER TABLE fornecedor_publico ADD COLUMN IF NOT EXISTS slug text",
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_fornecedor_publico_slug ON fornecedor_publico (slug) WHERE slug IS NOT NULL",
  "ALTER TABLE fornecedor_publico ADD COLUMN IF NOT EXISTS portfolio_pdf text",
  // db/27 — messageria: avisos in-app por destinatário
  `CREATE TABLE IF NOT EXISTS notificacao (
     id                    bigserial PRIMARY KEY,
     usuario_id            bigint REFERENCES usuario(id) ON DELETE CASCADE,
     fornecedor_publico_id bigint REFERENCES fornecedor_publico(id) ON DELETE CASCADE,
     tipo                  text NOT NULL DEFAULT 'sistema',
     titulo                text NOT NULL,
     corpo                 text,
     link                  text,
     chave                 text,
     lida                  boolean NOT NULL DEFAULT false,
     criado_em             timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE INDEX IF NOT EXISTS ix_notificacao_usuario ON notificacao (usuario_id, lida, criado_em DESC) WHERE usuario_id IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS ix_notificacao_fornecedor ON notificacao (fornecedor_publico_id, lida, criado_em DESC) WHERE fornecedor_publico_id IS NOT NULL",
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_notificacao_chave ON notificacao (coalesce(usuario_id, 0), coalesce(fornecedor_publico_id, 0), chave) WHERE chave IS NOT NULL",
  // db/28 — pedidos da loja pro fornecedor
  `CREATE TABLE IF NOT EXISTS pedido (
     id                    bigserial PRIMARY KEY,
     empresa_id            bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
     fornecedor_publico_id bigint NOT NULL REFERENCES fornecedor_publico(id) ON DELETE CASCADE,
     criado_por_usuario_id bigint REFERENCES usuario(id) ON DELETE SET NULL,
     status                text NOT NULL DEFAULT 'novo',
     observacao            text,
     motivo                text,
     total                 numeric(10,2) NOT NULL DEFAULT 0,
     criado_em             timestamptz NOT NULL DEFAULT now(),
     atualizado_em         timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE INDEX IF NOT EXISTS ix_pedido_forn ON pedido (fornecedor_publico_id, criado_em DESC)",
  "CREATE INDEX IF NOT EXISTS ix_pedido_empresa ON pedido (empresa_id, criado_em DESC)",
  `CREATE TABLE IF NOT EXISTS pedido_item (
     id                    bigserial PRIMARY KEY,
     pedido_id             bigint NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
     fornecedor_produto_id bigint REFERENCES fornecedor_produto(id) ON DELETE SET NULL,
     nome                  text NOT NULL,
     unidade               text NOT NULL DEFAULT 'un',
     qtd                   integer NOT NULL,
     preco_unit            numeric(10,2) NOT NULL,
     subtotal              numeric(10,2) NOT NULL
   )`,
  "CREATE INDEX IF NOT EXISTS ix_pedido_item_pedido ON pedido_item (pedido_id)",
  // db/29 — foto na anotação
  "ALTER TABLE anotacao ADD COLUMN IF NOT EXISTS foto text",
  // db/30 — importar compra: margem padrão da loja + notas já processadas
  "ALTER TABLE empresa ADD COLUMN IF NOT EXISTS margem_padrao numeric(6,2) NOT NULL DEFAULT 38",
  `CREATE TABLE IF NOT EXISTS compra_nota (
     id          bigserial PRIMARY KEY,
     empresa_id  bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
     chave       text,
     hash_imagem text NOT NULL,
     numero      text,
     emitente    text,
     itens       integer NOT NULL DEFAULT 0,
     criado_em   timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_compra_nota_hash ON compra_nota (empresa_id, hash_imagem)",
  "CREATE INDEX IF NOT EXISTS ix_compra_nota_chave ON compra_nota (empresa_id, chave) WHERE chave IS NOT NULL",
  "CREATE INDEX IF NOT EXISTS ix_compra_nota_empresa ON compra_nota (empresa_id, criado_em DESC)",
  // db/31 — comércios grandes: cotação de preço dos concorrentes
  `CREATE TABLE IF NOT EXISTS cotacao_concorrente (
     id              bigserial PRIMARY KEY,
     empresa_id      bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
     estabelecimento text NOT NULL,
     nome_produto    text NOT NULL,
     nome_norm       text NOT NULL,
     preco           numeric(10,2) NOT NULL,
     produto_id      bigint REFERENCES produto(id) ON DELETE SET NULL,
     meu_preco       numeric(10,2),
     fonte           text NOT NULL DEFAULT 'foto',
     data            date NOT NULL DEFAULT CURRENT_DATE,
     criado_em       timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_cotacao_conc_dia ON cotacao_concorrente (empresa_id, estabelecimento, nome_norm, data)",
  "CREATE INDEX IF NOT EXISTS ix_cotacao_conc_hist ON cotacao_concorrente (empresa_id, estabelecimento, nome_norm, data DESC)",
  // db/32 — comércios grandes: lote (lançamento) agrupando uma análise por estabelecimento/dia
  `CREATE TABLE IF NOT EXISTS cotacao_lote (
     id              bigserial PRIMARY KEY,
     empresa_id      bigint NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
     estabelecimento text NOT NULL,
     usuario_id      bigint REFERENCES usuario(id) ON DELETE SET NULL,
     usuario_nome    text,
     fonte           text NOT NULL DEFAULT 'foto',
     qtd_produtos    integer NOT NULL DEFAULT 0,
     data            date NOT NULL DEFAULT CURRENT_DATE,
     criado_em       timestamptz NOT NULL DEFAULT now()
   )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_cotacao_lote_dia ON cotacao_lote (empresa_id, estabelecimento, data)",
  "CREATE INDEX IF NOT EXISTS ix_cotacao_lote_empresa ON cotacao_lote (empresa_id, estabelecimento, data DESC)",
  "ALTER TABLE cotacao_concorrente ADD COLUMN IF NOT EXISTS lote_id bigint REFERENCES cotacao_lote(id) ON DELETE CASCADE",
  "CREATE INDEX IF NOT EXISTS ix_cotacao_conc_lote ON cotacao_concorrente (lote_id)",
  // db/33 — avisos do super admin (viram anotação; loja só marca lida, não exclui) + reaviso a cada 2 dias
  "ALTER TABLE anotacao ADD COLUMN IF NOT EXISTS de_admin boolean NOT NULL DEFAULT false",
  "ALTER TABLE notificacao ADD COLUMN IF NOT EXISTS lida_em timestamptz",
  "ALTER TABLE notificacao ADD COLUMN IF NOT EXISTS html boolean NOT NULL DEFAULT false",
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

/** So mexe no preco de venda — usado pela atualizacao de preco por video. */
export async function atualizarPrecoProduto(
  empresaId: number,
  id: number,
  novoPreco: number
): Promise<Produto | null> {
  await garantirSchema();
  const { rows } = await pool.query<Produto>(
    `UPDATE produto SET preco = $3, alterado_em = now()
      WHERE id = $1 AND empresa_id = $2
      RETURNING ${CAMPOS}`,
    [id, empresaId, novoPreco]
  );
  return rows[0] ?? null;
}

/**
 * Da baixa no estoque dos itens vendidos ao fechar uma venda.
 * `GREATEST(0, ...)` para nao deixar o estoque negativo. Uma query por item
 * (poucos itens por venda; o pooler da Neon nao gosta de multi-statement).
 */
export type EstoqueRestante = { estoque: number; critico: boolean };

/** `estoque <= estoque_minimo ?? 3` -> nível de reposição. */
const LIMIAR_ESTOQUE_PADRAO = 3;

export async function baixarEstoqueVenda(
  empresaId: number,
  itens: { id: number; quantidade: number }[]
): Promise<Record<number, EstoqueRestante>> {
  const restante: Record<number, EstoqueRestante> = {};
  for (const it of itens) {
    if (!Number.isInteger(it.id) || !(it.quantidade > 0)) continue;
    const { rows } = await pool.query<{ id: number; estoque: string; estoque_minimo: string | null }>(
      `UPDATE produto SET estoque = GREATEST(0, estoque - $3), alterado_em = now()
        WHERE id = $1 AND empresa_id = $2
        RETURNING id, estoque, estoque_minimo`,
      [it.id, empresaId, it.quantidade]
    );
    const r = rows[0];
    if (r) {
      const estoque = Number(r.estoque);
      const limite = r.estoque_minimo != null ? Number(r.estoque_minimo) : LIMIAR_ESTOQUE_PADRAO;
      restante[Number(r.id)] = { estoque, critico: estoque <= limite };
    }
  }
  return restante;
}

// ---------- vendas (registro pós-fechamento — o /vendas) ----------

export type ItemVendaEntrada = {
  id?: number | null;
  nome: string;
  quantidade: number;
  precoUnit: number;
  tipoVenda?: string;
};
export type ParteVendaEntrada = { forma: string; valor: number };

/**
 * Grava uma venda concluída (cabeçalho + itens + pagamentos). `data` é a data
 * local do balcão, mandada pelo cliente. Sem transação explícita: um cabeçalho
 * órfão é raro e inofensivo, e o pooler da Neon não gosta de multi-statement.
 */
export async function registrarVenda(
  empresaId: number,
  dados: { data?: string | null; itens: ItemVendaEntrada[]; partes: ParteVendaEntrada[] }
): Promise<number> {
  await garantirSchema();
  const total = dados.itens.reduce((s, it) => s + it.quantidade * it.precoUnit, 0);

  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO venda (empresa_id, data, total, qtd_itens)
     VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4)
     RETURNING id`,
    [empresaId, dados.data || null, Number(total.toFixed(2)), dados.itens.length]
  );
  const vendaId = rows[0].id;

  for (const it of dados.itens) {
    await pool.query(
      `INSERT INTO venda_item (venda_id, produto_id, nome, quantidade, preco_unit, tipo_venda)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        vendaId,
        Number.isInteger(it.id as number) ? it.id : null,
        String(it.nome ?? "").slice(0, 200) || "Item",
        it.quantidade,
        it.precoUnit,
        it.tipoVenda || "unidade",
      ]
    );
  }
  for (const p of dados.partes) {
    if (!(p.valor > 0)) continue;
    await pool.query(
      `INSERT INTO venda_pagamento (venda_id, forma, valor) VALUES ($1, $2, $3)`,
      [vendaId, String(p.forma ?? "").slice(0, 20) || "dinheiro", p.valor]
    );
  }
  return vendaId;
}

export type VendaResumo = {
  id: number;
  data: string;
  criado_em: string;
  total: number;
  qtd_itens: number;
  pagamentos: { forma: string; valor: number }[];
};

/** Vendas entre duas datas locais (inclusivo dos dois lados), mais recentes primeiro. */
export async function listarVendas(
  empresaId: number,
  de: string,
  ate: string
): Promise<VendaResumo[]> {
  await garantirSchema();
  const { rows } = await pool.query<VendaResumo>(
    `SELECT v.id,
            v.data::text AS data,
            v.criado_em,
            v.total::float8 AS total,
            v.qtd_itens,
            COALESCE(
              (SELECT json_agg(
                        json_build_object('forma', p.forma, 'valor', p.valor::float8)
                        ORDER BY p.id)
                 FROM venda_pagamento p WHERE p.venda_id = v.id),
              '[]'::json
            ) AS pagamentos
       FROM venda v
      WHERE v.empresa_id = $1 AND v.data >= $2::date AND v.data <= $3::date
      ORDER BY v.criado_em DESC`,
    [empresaId, de, ate]
  );
  return rows;
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
  bairro: string | null;
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
  bairro: string | null;
  cep: string | null;
  endereco: string | null;
  horario: string | null;
  pixChave: string | null;
  pixNome: string | null;
};

const CAMPOS_EMPRESA_CONFIG =
  "id, nome, documento, telefone, telefone_whatsapp, cidade, bairro, cep, endereco, horario, pix_chave, pix_nome";

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
            endereco = $8, horario = $9, pix_chave = $10, pix_nome = $11, bairro = $12
      WHERE id = $1
      RETURNING ${CAMPOS_EMPRESA_CONFIG}`,
    [
      empresaId, d.nome, d.documento, d.telefone, d.telefoneWhatsapp, d.cidade, d.cep,
      d.endereco, d.horario, d.pixChave, d.pixNome, d.bairro ?? null,
    ]
  );
  return rows[0] ?? null;
}

// ---------- importar compra (margem de lucro + notas já processadas) ----------

const MARGEM_PADRAO = 38;

/** Percentual de lucro que a loja quer sobre o preço de compra (default 38%). */
export async function margemPadraoEmpresa(empresaId: number): Promise<number> {
  await garantirSchema();
  const { rows } = await pool.query<{ margem_padrao: string }>(
    "SELECT margem_padrao FROM empresa WHERE id = $1",
    [empresaId]
  );
  const v = Number(rows[0]?.margem_padrao);
  return Number.isFinite(v) && v >= 0 ? v : MARGEM_PADRAO;
}

export async function definirMargemPadraoEmpresa(
  empresaId: number,
  margem: number
): Promise<number> {
  await garantirSchema();
  const m =
    Number.isFinite(margem) && margem >= 0 && margem <= 1000
      ? Math.round(margem * 100) / 100
      : MARGEM_PADRAO;
  await pool.query("UPDATE empresa SET margem_padrao = $2 WHERE id = $1", [empresaId, m]);
  return m;
}

export type NotaCompra = {
  id: number;
  chave: string | null;
  numero: string | null;
  emitente: string | null;
  itens: number;
  criado_em: string;
};

/** Nota de compra já processada — casa pela imagem (hash) OU pela chave de acesso. */
export async function notaCompraExistente(
  empresaId: number,
  hashImagem: string,
  chave: string | null
): Promise<NotaCompra | null> {
  await garantirSchema();
  const { rows } = await pool.query<NotaCompra>(
    `SELECT id, chave, numero, emitente, itens, criado_em
       FROM compra_nota
      WHERE empresa_id = $1
        AND (hash_imagem = $2 OR ($3::text IS NOT NULL AND chave = $3::text))
      ORDER BY criado_em DESC
      LIMIT 1`,
    [empresaId, hashImagem, chave]
  );
  return rows[0] ?? null;
}

export async function registrarNotaCompra(
  empresaId: number,
  d: {
    hashImagem: string;
    chave: string | null;
    numero: string | null;
    emitente: string | null;
    itens: number;
  }
): Promise<void> {
  await garantirSchema();
  await pool.query(
    `INSERT INTO compra_nota (empresa_id, hash_imagem, chave, numero, emitente, itens)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (empresa_id, hash_imagem) DO NOTHING`,
    [empresaId, d.hashImagem, d.chave, d.numero, d.emitente, d.itens]
  );
}

// ---------- comércios grandes: cotação de preço dos concorrentes ----------

export { normalizarNomeProduto } from "@/lib/textoProduto";

export type LeituraCotacao = { nome: string; preco: number };

/** "alta" = match confiável; "provavel" = parecido, confira; null = não achei. */
export type ConfiancaMatch = "alta" | "provavel" | null;

export type ResultadoCotacao = {
  nome: string;
  preco: number;
  /** match no meu catálogo, se houver */
  produtoId: number | null;
  meuNome: string | null;
  meuPreco: number | null;
  confianca: ConfiancaMatch;
  /** última leitura registrada deste produto neste estabelecimento, em dia anterior */
  precoAnterior: number | null;
  dataAnterior: string | null;
};

const MATCH_ALTA = 0.5;
const MATCH_PROVAVEL = 0.32;

/** Melhor produto do meu catálogo pro nome lido, tentando o nome cru, sem peso e só marca+tipo. */
async function acharMeuProduto(
  empresaId: number,
  nomeLido: string
): Promise<{ id: number; nome: string; preco: number; score: number } | null> {
  let melhor: { id: number; nome: string; preco: number; score: number } | null = null;
  for (const termo of variantesBuscaProduto(nomeLido)) {
    const cand = await buscarProduto(empresaId, termo, 3);
    for (const c of cand) {
      const s = c.score ?? 0;
      if (!melhor || s > melhor.score) {
        melhor = { id: c.id, nome: c.nome, preco: Number(c.preco), score: s };
      }
    }
  }
  return melhor && melhor.score >= MATCH_PROVAVEL ? melhor : null;
}

/**
 * Compara cada preço lido no concorrente com o meu catálogo (por proximidade —
 * pega o mesmo produto mesmo cadastrado com outro nome) e com a última cotação
 * registrada (de um dia anterior) do mesmo estabelecimento. Não grava nada.
 */
export async function compararCotacoes(
  empresaId: number,
  estabelecimento: string,
  itens: LeituraCotacao[]
): Promise<ResultadoCotacao[]> {
  await garantirSchema();
  const est = estabelecimento.trim();
  return Promise.all(
    itens.map(async (it) => {
      const norm = _normNome(it.nome);
      const meu = await acharMeuProduto(empresaId, it.nome);
      const confianca: ConfiancaMatch = meu ? (meu.score >= MATCH_ALTA ? "alta" : "provavel") : null;
      const { rows } = await pool.query<{ preco: string; data: string }>(
        `SELECT preco, to_char(data, 'YYYY-MM-DD') AS data
           FROM cotacao_concorrente
          WHERE empresa_id = $1 AND estabelecimento = $2 AND nome_norm = $3 AND data < CURRENT_DATE
          ORDER BY data DESC
          LIMIT 1`,
        [empresaId, est, norm]
      );
      return {
        nome: it.nome,
        preco: it.preco,
        produtoId: meu ? meu.id : null,
        meuNome: meu ? meu.nome : null,
        meuPreco: meu ? meu.preco : null,
        confianca,
        precoAnterior: rows[0] ? Number(rows[0].preco) : null,
        dataAnterior: rows[0]?.data ?? null,
      };
    })
  );
}

/**
 * Grava as leituras do dia — uma linha por produto/estabelecimento/dia — dentro
 * de um "lote" (o lançamento): um por estabelecimento/dia, guardando quem fez e
 * quantos produtos, pra listar no grid do módulo.
 */
export async function registrarCotacoes(
  empresaId: number,
  estabelecimento: string,
  fonte: string,
  itens: ResultadoCotacao[],
  autor: { usuarioId: number | null; usuarioNome: string }
): Promise<{ loteId: number }> {
  await garantirSchema();
  const est = estabelecimento.trim();
  const f = ["video", "foto", "pdf"].includes(fonte) ? fonte : "foto";

  const { rows: loteRows } = await pool.query<{ id: number }>(
    `INSERT INTO cotacao_lote
       (empresa_id, estabelecimento, usuario_id, usuario_nome, fonte, qtd_produtos, data)
     VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE)
     ON CONFLICT (empresa_id, estabelecimento, data)
     DO UPDATE SET usuario_id = EXCLUDED.usuario_id, usuario_nome = EXCLUDED.usuario_nome,
                   fonte = EXCLUDED.fonte, qtd_produtos = EXCLUDED.qtd_produtos, criado_em = now()
     RETURNING id`,
    [empresaId, est, autor.usuarioId, autor.usuarioNome, f, itens.length]
  );
  const loteId = loteRows[0].id;

  for (const it of itens) {
    // só amarra o produto quando o match é confiável
    const prodId = it.confianca === "alta" ? it.produtoId : null;
    const meuPreco = it.confianca === "alta" ? it.meuPreco : null;
    await pool.query(
      `INSERT INTO cotacao_concorrente
         (empresa_id, estabelecimento, nome_produto, nome_norm, preco, produto_id, meu_preco, fonte, lote_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (empresa_id, estabelecimento, nome_norm, data)
       DO UPDATE SET preco = EXCLUDED.preco, nome_produto = EXCLUDED.nome_produto,
                     produto_id = EXCLUDED.produto_id, meu_preco = EXCLUDED.meu_preco,
                     fonte = EXCLUDED.fonte, lote_id = EXCLUDED.lote_id, criado_em = now()`,
      [empresaId, est, it.nome, _normNome(it.nome), it.preco, prodId, meuPreco, f, loteId]
    );
  }
  return { loteId };
}

export type EstabelecimentoCotado = {
  estabelecimento: string;
  loteId: number;
  data: string;
  qtdProdutos: number;
  usuarioNome: string | null;
  fonte: string;
};

/** Um card por estabelecimento — o lançamento mais recente de cada um. */
export async function listarEstabelecimentosCotados(
  empresaId: number
): Promise<EstabelecimentoCotado[]> {
  await garantirSchema();
  const { rows } = await pool.query<{
    estabelecimento: string;
    lote_id: number;
    usuario_nome: string | null;
    fonte: string;
    qtd_produtos: number;
    data: string;
  }>(
    `SELECT estabelecimento, id AS lote_id, usuario_nome, fonte, qtd_produtos,
            to_char(data, 'YYYY-MM-DD') AS data
       FROM (
         SELECT DISTINCT ON (estabelecimento) *
           FROM cotacao_lote
          WHERE empresa_id = $1
          ORDER BY estabelecimento, data DESC, criado_em DESC
       ) mais_recente
      ORDER BY data DESC, mais_recente.criado_em DESC`,
    [empresaId]
  );
  return rows.map((r) => ({
    estabelecimento: r.estabelecimento,
    loteId: r.lote_id,
    data: r.data,
    qtdProdutos: r.qtd_produtos,
    usuarioNome: r.usuario_nome,
    fonte: r.fonte,
  }));
}

export type LoteResumo = {
  id: number;
  data: string;
  qtdProdutos: number;
  usuarioNome: string | null;
  fonte: string;
};

/** Histórico de lançamentos de UM estabelecimento, mais novo primeiro. */
export async function listarLotesDoEstabelecimento(
  empresaId: number,
  estabelecimento: string
): Promise<LoteResumo[]> {
  await garantirSchema();
  const { rows } = await pool.query<{
    id: number;
    usuario_nome: string | null;
    fonte: string;
    qtd_produtos: number;
    data: string;
  }>(
    `SELECT id, usuario_nome, fonte, qtd_produtos, to_char(data, 'YYYY-MM-DD') AS data
       FROM cotacao_lote
      WHERE empresa_id = $1 AND estabelecimento = $2
      ORDER BY data DESC, criado_em DESC`,
    [empresaId, estabelecimento.trim()]
  );
  return rows.map((r) => ({
    id: r.id,
    data: r.data,
    qtdProdutos: r.qtd_produtos,
    usuarioNome: r.usuario_nome,
    fonte: r.fonte,
  }));
}

export type LoteDetalhe = {
  id: number;
  estabelecimento: string;
  data: string;
  usuarioNome: string | null;
  fonte: string;
  itens: { nome: string; preco: number; meuPreco: number | null }[];
};

/** Um lançamento: a data, quem fez e a lista de produtos com preço. */
export async function loteDetalhe(empresaId: number, loteId: number): Promise<LoteDetalhe | null> {
  await garantirSchema();
  const { rows: lotes } = await pool.query<{
    id: number;
    estabelecimento: string;
    usuario_nome: string | null;
    fonte: string;
    data: string;
  }>(
    `SELECT id, estabelecimento, usuario_nome, fonte, to_char(data, 'YYYY-MM-DD') AS data
       FROM cotacao_lote WHERE id = $1 AND empresa_id = $2`,
    [loteId, empresaId]
  );
  const lote = lotes[0];
  if (!lote) return null;
  const { rows: itens } = await pool.query<{
    nome_produto: string;
    preco: string;
    meu_preco: string | null;
  }>(
    `SELECT nome_produto, preco, meu_preco FROM cotacao_concorrente
      WHERE lote_id = $1 ORDER BY nome_produto`,
    [loteId]
  );
  return {
    id: lote.id,
    estabelecimento: lote.estabelecimento,
    data: lote.data,
    usuarioNome: lote.usuario_nome,
    fonte: lote.fonte,
    itens: itens.map((i) => ({
      nome: i.nome_produto,
      preco: Number(i.preco),
      meuPreco: i.meu_preco === null ? null : Number(i.meu_preco),
    })),
  };
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
  item: string | null;
  devolvido: boolean;
  devolvido_em: string | null;
  criado_em: string;
};

const CAMPOS_CASCO =
  "id, responsavel, telefone, telefone_whatsapp, endereco, quantidade, item, devolvido, devolvido_em, criado_em";

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
  dados: {
    responsavel: string;
    telefone: string;
    whatsapp: boolean;
    endereco: string;
    quantidade: number;
    item?: string | null;
  }
): Promise<Casco> {
  await garantirSchema();
  const { rows } = await pool.query<Casco>(
    `INSERT INTO casco (empresa_id, responsavel, telefone, telefone_whatsapp, endereco, quantidade, item)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING ${CAMPOS_CASCO}`,
    [
      empresaId,
      dados.responsavel,
      dados.telefone,
      dados.whatsapp,
      dados.endereco,
      dados.quantidade,
      dados.item?.trim() || null,
    ]
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

// ---------- anotacoes (lembretes com data de alerta) ----------

export type Anotacao = {
  id: number;
  texto: string;
  data_alerta: string | null;
  concluida: boolean;
  criado_em: string;
  tem_foto: boolean;
  /** Veio de um aviso do super admin — a loja só pode marcar como concluída, não excluir. */
  de_admin: boolean;
};

const CAMPOS_ANOTACAO =
  "id, texto, data_alerta::text AS data_alerta, concluida, criado_em, " +
  "(foto IS NOT NULL AND foto <> '') AS tem_foto, de_admin";

export async function listarAnotacoes(empresaId: number, situacao?: string): Promise<Anotacao[]> {
  await garantirSchema();
  const filtro =
    situacao === "abertas" ? "AND concluida = false"
    : situacao === "concluidas" ? "AND concluida = true"
    : "";
  const { rows } = await pool.query<Anotacao>(
    `SELECT ${CAMPOS_ANOTACAO} FROM anotacao
      WHERE empresa_id = $1 ${filtro}
      ORDER BY concluida,
               (data_alerta IS NULL),
               data_alerta,
               criado_em DESC`,
    [empresaId]
  );
  return rows;
}

export async function criarAnotacao(
  empresaId: number,
  texto: string,
  dataAlerta: string | null,
  foto?: string,
  deAdmin = false
): Promise<Anotacao> {
  await garantirSchema();
  const { rows } = await pool.query<Anotacao>(
    `INSERT INTO anotacao (empresa_id, texto, data_alerta, foto, de_admin)
     VALUES ($1, $2, $3::date, NULLIF($4, ''), $5)
     RETURNING ${CAMPOS_ANOTACAO}`,
    [empresaId, texto, dataAlerta || null, foto ?? "", deAdmin]
  );
  return rows[0];
}

export async function fotoAnotacao(empresaId: number, id: number): Promise<string | null> {
  await garantirSchema();
  const { rows } = await pool.query<{ foto: string | null }>(
    "SELECT foto FROM anotacao WHERE id = $1 AND empresa_id = $2",
    [id, empresaId]
  );
  return rows[0]?.foto || null;
}

export async function atualizarFotoAnotacao(
  empresaId: number,
  id: number,
  foto: string
): Promise<boolean> {
  await garantirSchema();
  const r = await pool.query(
    "UPDATE anotacao SET foto = NULLIF($3, '') WHERE id = $1 AND empresa_id = $2",
    [id, empresaId, foto]
  );
  return (r.rowCount ?? 0) > 0;
}

/**
 * Alterna concluida, ou (com `texto`/`dataAlerta`) edita o conteúdo. Um aviso
 * do super admin (`de_admin`) só aceita `concluida` — a loja não edita o
 * conteúdo, só marca como concluído.
 */
export async function editarAnotacao(
  empresaId: number,
  id: number,
  campos: { concluida?: boolean; texto?: string; dataAlerta?: string | null }
): Promise<Anotacao | null> {
  await garantirSchema();
  const { rows: atual } = await pool.query<{ de_admin: boolean }>(
    "SELECT de_admin FROM anotacao WHERE id = $1 AND empresa_id = $2",
    [id, empresaId]
  );
  if (!atual[0]) return null;
  const bloqueado = atual[0].de_admin;

  const sets: string[] = [];
  const vals: unknown[] = [id, empresaId];
  if (campos.concluida !== undefined) {
    vals.push(campos.concluida);
    sets.push(`concluida = $${vals.length}`);
  }
  if (campos.texto !== undefined && !bloqueado) {
    vals.push(campos.texto);
    sets.push(`texto = $${vals.length}`);
  }
  if (campos.dataAlerta !== undefined && !bloqueado) {
    vals.push(campos.dataAlerta || null);
    sets.push(`data_alerta = $${vals.length}::date`);
  }
  if (sets.length === 0) return null;
  const { rows } = await pool.query<Anotacao>(
    `UPDATE anotacao SET ${sets.join(", ")}
      WHERE id = $1 AND empresa_id = $2
      RETURNING ${CAMPOS_ANOTACAO}`,
    vals
  );
  // ao concluir, tira da caixa de avisos o que ainda não foi lido
  if (rows[0] && campos.concluida === true) {
    await pool.query(
      "DELETE FROM notificacao WHERE chave LIKE 'anotacao:' || $1 || ':%' AND NOT lida",
      [id]
    );
  }
  return rows[0] ?? null;
}

/** "ok" | "bloqueada" (é um aviso do super admin — a loja não pode excluir) | "nao_encontrada" */
export async function excluirAnotacao(
  empresaId: number,
  id: number
): Promise<"ok" | "bloqueada" | "nao_encontrada"> {
  await garantirSchema();
  const { rows } = await pool.query<{ de_admin: boolean }>(
    "SELECT de_admin FROM anotacao WHERE id = $1 AND empresa_id = $2",
    [id, empresaId]
  );
  if (!rows[0]) return "nao_encontrada";
  if (rows[0].de_admin) return "bloqueada";
  await pool.query("DELETE FROM anotacao WHERE id = $1 AND empresa_id = $2", [id, empresaId]);
  await pool.query("DELETE FROM notificacao WHERE chave LIKE 'anotacao:' || $1 || ':%'", [id]);
  return "ok";
}

/** Quantas anotações abertas já estão no dia do alerta (ou atrasadas). */
export async function anotacoesEmAlerta(empresaId: number): Promise<number> {
  await garantirSchema();
  const { rows } = await pool.query<{ total: string }>(
    `SELECT count(*)::int AS total FROM anotacao
      WHERE empresa_id = $1 AND concluida = false
        AND data_alerta IS NOT NULL AND data_alerta <= CURRENT_DATE`,
    [empresaId]
  );
  return Number(rows[0]?.total ?? 0);
}

/** ids das lojas aprovadas — pra disparar um aviso "pra todos os clientes". */
export async function empresasAprovadasIds(): Promise<number[]> {
  await garantirSchema();
  const { rows } = await pool.query<{ id: number }>(
    "SELECT id FROM empresa WHERE situacao = 'aprovada'"
  );
  return rows.map((r) => r.id);
}

/**
 * Aviso do super admin: vira uma anotação (`de_admin = true`) em cada loja
 * alvo, com a data de alerta escolhida (hoje = imediato). Reusa toda a cadeia
 * de aviso já existente (sino, /notificacoes, /anotacoes).
 */
export async function enviarAvisoAdmin(d: {
  empresaId: number | null; // null = todas as lojas aprovadas
  texto: string;
  dataAlerta: string;
  foto?: string;
}): Promise<number> {
  await garantirSchema();
  const alvos = d.empresaId !== null ? [d.empresaId] : await empresasAprovadasIds();
  for (const empresaId of alvos) {
    await criarAnotacao(empresaId, d.texto, d.dataAlerta, d.foto, true);
  }
  return alvos.length;
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

// ---------- cadastro publico de fornecedor + bairros (db/23) ----------

export type Bairro = { id: number; nome: string };

export async function listarBairros(cidade: string): Promise<Bairro[]> {
  await garantirSchema();
  const { rows } = await pool.query<Bairro>(
    `SELECT id, nome FROM bairro WHERE lower(cidade) = lower($1) ORDER BY nome`,
    [cidade.trim()]
  );
  return rows;
}

export async function cidadesComBairro(): Promise<string[]> {
  await garantirSchema();
  const { rows } = await pool.query<{ cidade: string }>(
    "SELECT DISTINCT cidade FROM bairro ORDER BY cidade"
  );
  return rows.map((r) => r.cidade);
}

export type FornecedorPublicoEntrada = {
  nome: string;
  documento?: string | null;
  telefone?: string | null;
  telefoneWhatsapp?: boolean;
  endereco?: string | null;
  observacao?: string | null;
  pixChave?: string | null;
  email: string;
  senhaHash: string;
  cidade: string;
  bairroIds: number[];
};

/**
 * Cadastro público de um fornecedor (nasce `pendente`, o super admin aprova).
 * Separado do `fornecedor` de cada loja: aqui é o fornecedor se cadastrando na
 * plataforma e dizendo os bairros que atende.
 */
export async function criarFornecedorPublico(d: FornecedorPublicoEntrada): Promise<number> {
  await garantirSchema();
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");

    const jaUsuario = await cliente.query("SELECT 1 FROM usuario WHERE lower(email) = lower($1)", [d.email]);
    const jaFornecedor = await cliente.query(
      "SELECT 1 FROM fornecedor_publico WHERE lower(email) = lower($1)",
      [d.email]
    );
    if (jaUsuario.rowCount || jaFornecedor.rowCount) {
      await cliente.query("ROLLBACK");
      throw Object.assign(new Error("Este e-mail já está cadastrado."), { code: "EMAIL_DUP" });
    }

    const { rows } = await cliente.query<{ id: number }>(
      `INSERT INTO fornecedor_publico
         (nome, documento, telefone, telefone_whatsapp, endereco, observacao, pix_chave, email, senha_hash, cidade)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        d.nome,
        d.documento?.replace(/\D/g, "") || null,
        d.telefone || null,
        Boolean(d.telefoneWhatsapp),
        d.endereco || null,
        d.observacao || null,
        d.pixChave || null,
        d.email.trim(),
        d.senhaHash,
        d.cidade.trim(),
      ]
    );
    const id = rows[0].id;

    const ids = Array.from(new Set(d.bairroIds.filter((n) => Number.isInteger(n))));
    for (const bairroId of ids) {
      await cliente.query(
        `INSERT INTO fornecedor_publico_bairro (fornecedor_publico_id, bairro_id)
         SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM bairro WHERE id = $2)
         ON CONFLICT DO NOTHING`,
        [id, bairroId]
      );
    }

    await cliente.query("COMMIT");
    return id;
  } catch (e) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

export type FornecedorPublico = {
  id: number;
  nome: string;
  documento: string | null;
  telefone: string | null;
  telefone_whatsapp: boolean;
  endereco: string | null;
  observacao: string | null;
  pix_chave: string | null;
  email: string;
  cidade: string;
  situacao: "pendente" | "aprovado" | "reprovado";
  motivo: string | null;
  criado_em: string;
  bairros: string[];
  /** Preenchido só onde a query pede (diretório, portfólio). */
  slug?: string | null;
  tem_catalogo?: boolean;
  tem_pdf?: boolean;
};

/** Lista os fornecedores públicos (cadastro na plataforma) — só super admin. */
export async function listarFornecedoresPublicos(
  situacao?: string,
  q = ""
): Promise<FornecedorPublico[]> {
  await garantirSchema();
  const cond: string[] = [];
  const params: unknown[] = [];
  if (situacao && situacao !== "todas") {
    params.push(situacao);
    cond.push(`fp.situacao = $${params.length}`);
  }
  const t = q.trim();
  if (t) {
    params.push(t);
    cond.push(
      `f_unaccent(lower(fp.nome || ' ' || coalesce(fp.email, ''))) LIKE '%' || f_unaccent(lower($${params.length})) || '%'`
    );
  }
  const where = cond.length ? `WHERE ${cond.join(" AND ")}` : "";
  const { rows } = await pool.query<FornecedorPublico>(
    `SELECT fp.id, fp.nome, fp.documento, fp.telefone, fp.telefone_whatsapp, fp.endereco,
            fp.observacao, fp.pix_chave, fp.email, fp.cidade, fp.situacao, fp.motivo, fp.criado_em,
            COALESCE(
              (SELECT json_agg(b.nome ORDER BY b.nome)
                 FROM fornecedor_publico_bairro fb JOIN bairro b ON b.id = fb.bairro_id
                WHERE fb.fornecedor_publico_id = fp.id),
              '[]'::json
            ) AS bairros
       FROM fornecedor_publico fp
       ${where}
      ORDER BY CASE fp.situacao WHEN 'pendente' THEN 0 ELSE 1 END, fp.criado_em DESC`,
    params
  );
  return rows;
}

export async function decidirFornecedorPublico(
  id: number,
  situacao: "aprovado" | "reprovado",
  motivo?: string | null
): Promise<FornecedorPublico | null> {
  await garantirSchema();
  const { rows } = await pool.query<FornecedorPublico>(
    `UPDATE fornecedor_publico fp
        SET situacao = $2, motivo = $3, decidido_em = now()
      WHERE fp.id = $1
      RETURNING fp.id, fp.nome, fp.documento, fp.telefone, fp.telefone_whatsapp, fp.endereco,
                fp.observacao, fp.pix_chave, fp.email, fp.cidade, fp.situacao, fp.motivo, fp.criado_em,
                COALESCE(
                  (SELECT json_agg(b.nome ORDER BY b.nome)
                     FROM fornecedor_publico_bairro fb JOIN bairro b ON b.id = fb.bairro_id
                    WHERE fb.fornecedor_publico_id = fp.id),
                  '[]'::json
                ) AS bairros`,
    [id, situacao, situacao === "reprovado" ? String(motivo ?? "").trim() || null : null]
  );
  if (rows[0] && situacao === "aprovado") await garantirSlugFornecedor(id);
  return rows[0] ?? null;
}

// ---------- login e área do fornecedor público (db/25) ----------

export type FornecedorLogin = {
  id: number;
  nome: string;
  email: string;
  senha_hash: string | null;
  situacao: "pendente" | "aprovado" | "reprovado";
  motivo: string | null;
};

export async function fornecedorPublicoPorEmail(email: string): Promise<FornecedorLogin | null> {
  await garantirSchema();
  const { rows } = await pool.query<FornecedorLogin>(
    `SELECT id, nome, email, senha_hash, situacao, motivo
       FROM fornecedor_publico WHERE lower(email) = lower($1)`,
    [email.trim()]
  );
  return rows[0] ?? null;
}

/** Só o hash de senha do fornecedor (pra conferir na troca de senha). */
export async function fornecedorPublicoSenhaHash(id: number): Promise<string | null> {
  await garantirSchema();
  const { rows } = await pool.query<{ senha_hash: string | null }>(
    "SELECT senha_hash FROM fornecedor_publico WHERE id = $1",
    [id]
  );
  return rows[0]?.senha_hash ?? null;
}

export async function alterarSenhaFornecedorPublico(id: number, senhaHash: string): Promise<boolean> {
  await garantirSchema();
  const r = await pool.query("UPDATE fornecedor_publico SET senha_hash = $2 WHERE id = $1", [id, senhaHash]);
  return (r.rowCount ?? 0) > 0;
}

/** Dados completos do fornecedor logado + bairros que atende + bairros da cidade. */
export async function fornecedorPublicoDetalhe(id: number): Promise<
  | (FornecedorPublico & { bairroIds: number[]; bairrosCidade: Bairro[] })
  | null
> {
  await garantirSchema();
  const { rows } = await pool.query<FornecedorPublico & { bairro_ids: number[] }>(
    `SELECT fp.id, fp.nome, fp.documento, fp.telefone, fp.telefone_whatsapp, fp.endereco,
            fp.observacao, fp.pix_chave, fp.email, fp.cidade, fp.situacao, fp.motivo, fp.criado_em,
            fp.slug, (fp.portfolio_pdf IS NOT NULL AND fp.portfolio_pdf <> '') AS tem_pdf,
            COALESCE((SELECT json_agg(b.nome ORDER BY b.nome)
                        FROM fornecedor_publico_bairro fb JOIN bairro b ON b.id = fb.bairro_id
                       WHERE fb.fornecedor_publico_id = fp.id), '[]'::json) AS bairros,
            COALESCE((SELECT json_agg(fb.bairro_id)
                        FROM fornecedor_publico_bairro fb
                       WHERE fb.fornecedor_publico_id = fp.id), '[]'::json) AS bairro_ids
       FROM fornecedor_publico fp WHERE fp.id = $1`,
    [id]
  );
  const fp = rows[0];
  if (!fp) return null;
  const bairrosCidade = await listarBairros(fp.cidade);
  return {
    ...fp,
    bairroIds: (fp.bairro_ids ?? []).map((n) => Number(n)),
    bairrosCidade,
  };
}

export async function atualizarFornecedorPublico(
  id: number,
  d: {
    nome: string;
    documento?: string | null;
    telefone?: string | null;
    telefoneWhatsapp?: boolean;
    endereco?: string | null;
    observacao?: string | null;
    pixChave?: string | null;
    cidade: string;
    bairroIds: number[];
  }
): Promise<boolean> {
  await garantirSchema();
  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const upd = await cliente.query(
      `UPDATE fornecedor_publico
          SET nome = $2, documento = $3, telefone = $4, telefone_whatsapp = $5,
              endereco = $6, observacao = $7, pix_chave = $8, cidade = $9
        WHERE id = $1`,
      [
        id,
        d.nome,
        d.documento?.replace(/\D/g, "") || null,
        d.telefone || null,
        Boolean(d.telefoneWhatsapp),
        d.endereco || null,
        d.observacao || null,
        d.pixChave || null,
        d.cidade.trim(),
      ]
    );
    if (!upd.rowCount) {
      await cliente.query("ROLLBACK");
      return false;
    }
    await cliente.query("DELETE FROM fornecedor_publico_bairro WHERE fornecedor_publico_id = $1", [id]);
    const ids = Array.from(new Set(d.bairroIds.filter((n) => Number.isInteger(n))));
    for (const bairroId of ids) {
      await cliente.query(
        `INSERT INTO fornecedor_publico_bairro (fornecedor_publico_id, bairro_id)
         SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM bairro WHERE id = $2)
         ON CONFLICT DO NOTHING`,
        [id, bairroId]
      );
    }
    await cliente.query("COMMIT");
    return true;
  } catch (e) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

// ---------- diretório de fornecedores (pras lojas) ----------

/** Fornecedores APROVADOS que atendem a cidade (e, se passado, o bairro) da loja. */
export async function listarDiretorioFornecedores(
  cidade: string,
  bairro?: string | null
): Promise<FornecedorPublico[]> {
  await garantirSchema();
  const params: unknown[] = [cidade.trim()];
  let filtroBairro = "";
  if (bairro && bairro.trim()) {
    params.push(bairro.trim());
    filtroBairro = `AND EXISTS (
      SELECT 1 FROM fornecedor_publico_bairro fb JOIN bairro b ON b.id = fb.bairro_id
       WHERE fb.fornecedor_publico_id = fp.id AND lower(b.nome) = lower($${params.length})
    )`;
  }
  const { rows } = await pool.query<FornecedorPublico>(
    `SELECT fp.id, fp.nome, fp.documento, fp.telefone, fp.telefone_whatsapp, fp.endereco,
            fp.observacao, fp.pix_chave, fp.email, fp.cidade, fp.situacao, fp.motivo, fp.criado_em,
            fp.slug,
            EXISTS (SELECT 1 FROM fornecedor_produto p WHERE p.fornecedor_publico_id = fp.id) AS tem_catalogo,
            COALESCE((SELECT json_agg(b.nome ORDER BY b.nome)
                        FROM fornecedor_publico_bairro fb JOIN bairro b ON b.id = fb.bairro_id
                       WHERE fb.fornecedor_publico_id = fp.id), '[]'::json) AS bairros
       FROM fornecedor_publico fp
      WHERE fp.situacao = 'aprovado' AND lower(fp.cidade) = lower($1) ${filtroBairro}
      ORDER BY fp.nome`,
    params
  );
  return rows;
}

export async function fornecedorPublicoPorId(id: number): Promise<FornecedorPublico | null> {
  await garantirSchema();
  const { rows } = await pool.query<FornecedorPublico>(
    `SELECT fp.id, fp.nome, fp.documento, fp.telefone, fp.telefone_whatsapp, fp.endereco,
            fp.observacao, fp.pix_chave, fp.email, fp.cidade, fp.situacao, fp.motivo, fp.criado_em,
            '[]'::json AS bairros
       FROM fornecedor_publico fp WHERE fp.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

// ---------- produtos do fornecedor + portfólio (db/26) ----------

export type FornecedorProduto = {
  id: number;
  nome: string;
  categoria: string;
  preco_unidade: number | null;
  preco_desconto: number | null;
  desconto_qtd_min: number | null;
  preco_caixa: number | null;
  caixa_qtd: number | null;
  ordem: number;
  criado_em: string;
  tem_foto: boolean;
};

const CAMPOS_FORN_PRODUTO = `id, nome, categoria,
  preco_unidade::float8 AS preco_unidade, preco_desconto::float8 AS preco_desconto,
  desconto_qtd_min, preco_caixa::float8 AS preco_caixa, caixa_qtd, ordem,
  criado_em, (foto IS NOT NULL AND foto <> '') AS tem_foto`;

export async function listarProdutosFornecedor(fornecedorId: number): Promise<FornecedorProduto[]> {
  await garantirSchema();
  const { rows } = await pool.query<FornecedorProduto>(
    `SELECT ${CAMPOS_FORN_PRODUTO} FROM fornecedor_produto
      WHERE fornecedor_publico_id = $1
      ORDER BY ordem, lower(nome)`,
    [fornecedorId]
  );
  return rows;
}

export async function categoriasFornecedorUsadas(fornecedorId: number): Promise<string[]> {
  await garantirSchema();
  const { rows } = await pool.query<{ categoria: string }>(
    `SELECT DISTINCT categoria FROM fornecedor_produto
      WHERE fornecedor_publico_id = $1 AND categoria <> ''
        AND NOT (categoria = ANY ($2))
      ORDER BY categoria`,
    [fornecedorId, CATEGORIAS_FORNECEDOR_PRODUTO as unknown as string[]]
  );
  return rows.map((r) => r.categoria);
}

export async function criarProdutoFornecedor(
  fornecedorId: number,
  d: FornecedorProdutoEntrada
): Promise<FornecedorProduto> {
  await garantirSchema();
  const { rows } = await pool.query<FornecedorProduto>(
    `INSERT INTO fornecedor_produto
       (fornecedor_publico_id, nome, categoria, foto, preco_unidade, preco_desconto,
        desconto_qtd_min, preco_caixa, caixa_qtd,
        ordem)
     VALUES ($1, $2, $3, NULLIF($4, ''), $5, $6, $7, $8, $9,
        COALESCE((SELECT max(ordem) + 1 FROM fornecedor_produto WHERE fornecedor_publico_id = $1), 0))
     RETURNING ${CAMPOS_FORN_PRODUTO}`,
    [
      fornecedorId,
      d.nome.trim(),
      d.categoria.trim().slice(0, 40),
      d.foto ?? "",
      d.precoUnidade,
      d.precoDesconto,
      d.descontoQtdMin,
      d.precoCaixa,
      d.caixaQtd,
    ]
  );
  await garantirSlugFornecedor(fornecedorId);
  return rows[0];
}

export async function atualizarProdutoFornecedor(
  fornecedorId: number,
  id: number,
  d: FornecedorProdutoEntrada
): Promise<FornecedorProduto | null> {
  await garantirSchema();
  const { rows } = await pool.query<FornecedorProduto>(
    `UPDATE fornecedor_produto SET
       nome = $3, categoria = $4,
       preco_unidade = $5, preco_desconto = $6, desconto_qtd_min = $7,
       preco_caixa = $8, caixa_qtd = $9,
       foto = CASE
                WHEN $10::text IS NULL THEN foto
                WHEN $10 = '' THEN NULL
                ELSE $10
              END
     WHERE id = $2 AND fornecedor_publico_id = $1
     RETURNING ${CAMPOS_FORN_PRODUTO}`,
    [
      fornecedorId,
      id,
      d.nome.trim(),
      d.categoria.trim().slice(0, 40),
      d.precoUnidade,
      d.precoDesconto,
      d.descontoQtdMin,
      d.precoCaixa,
      d.caixaQtd,
      d.foto ?? null,
    ]
  );
  return rows[0] ?? null;
}

/**
 * Edição rápida pela lista — atualiza só as chaves presentes em `campos`
 * (`nome`, `categoria`, `precoUnidade`, `precoDesconto`, `descontoQtdMin`,
 * `precoCaixa`, `caixaQtd`); mantém foto e o resto.
 */
export async function atualizarPrecosProdutoFornecedor(
  fornecedorId: number,
  id: number,
  campos: Record<string, string | number | null>
): Promise<FornecedorProduto | null> {
  await garantirSchema();
  const COL: Record<string, string> = {
    nome: "nome",
    categoria: "categoria",
    precoUnidade: "preco_unidade",
    precoDesconto: "preco_desconto",
    descontoQtdMin: "desconto_qtd_min",
    precoCaixa: "preco_caixa",
    caixaQtd: "caixa_qtd",
  };
  const sets: string[] = [];
  const params: unknown[] = [fornecedorId, id];
  for (const [chave, coluna] of Object.entries(COL)) {
    if (chave in campos) {
      params.push((campos as Record<string, unknown>)[chave] ?? null);
      sets.push(`${coluna} = $${params.length}`);
    }
  }
  if (sets.length === 0) {
    const { rows } = await pool.query<FornecedorProduto>(
      `SELECT ${CAMPOS_FORN_PRODUTO} FROM fornecedor_produto WHERE id = $2 AND fornecedor_publico_id = $1`,
      [fornecedorId, id]
    );
    return rows[0] ?? null;
  }
  const { rows } = await pool.query<FornecedorProduto>(
    `UPDATE fornecedor_produto SET ${sets.join(", ")}
      WHERE id = $2 AND fornecedor_publico_id = $1
      RETURNING ${CAMPOS_FORN_PRODUTO}`,
    params
  );
  return rows[0] ?? null;
}

export async function excluirProdutoFornecedor(fornecedorId: number, id: number): Promise<boolean> {
  await garantirSchema();
  const r = await pool.query(
    "DELETE FROM fornecedor_produto WHERE id = $1 AND fornecedor_publico_id = $2",
    [id, fornecedorId]
  );
  return (r.rowCount ?? 0) > 0;
}

/** Troca só a foto de um produto (add rápido pela lista). */
export async function atualizarFotoProdutoFornecedor(
  fornecedorId: number,
  id: number,
  foto: string
): Promise<boolean> {
  await garantirSchema();
  const r = await pool.query(
    "UPDATE fornecedor_produto SET foto = NULLIF($3, '') WHERE id = $1 AND fornecedor_publico_id = $2",
    [id, fornecedorId, foto]
  );
  return (r.rowCount ?? 0) > 0;
}

export async function fotoProdutoFornecedor(fornecedorId: number, id: number): Promise<string | null> {
  await garantirSchema();
  const { rows } = await pool.query<{ foto: string | null }>(
    "SELECT foto FROM fornecedor_produto WHERE id = $1 AND fornecedor_publico_id = $2",
    [id, fornecedorId]
  );
  return rows[0]?.foto || null;
}

/** Foto de um produto pra página pública — casa slug + fornecedor aprovado. */
export async function fotoProdutoPortfolio(slug: string, id: number): Promise<string | null> {
  await garantirSchema();
  const { rows } = await pool.query<{ foto: string | null }>(
    `SELECT p.foto FROM fornecedor_produto p
       JOIN fornecedor_publico fp ON fp.id = p.fornecedor_publico_id
      WHERE p.id = $1 AND fp.slug = $2 AND fp.situacao = 'aprovado'`,
    [id, slug]
  );
  return rows[0]?.foto || null;
}

function kebabSemAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/** Garante um slug único pro fornecedor (gera a partir do nome na 1ª vez). */
export async function garantirSlugFornecedor(id: number): Promise<string | null> {
  await garantirSchema();
  const { rows } = await pool.query<{ slug: string | null; nome: string }>(
    "SELECT slug, nome FROM fornecedor_publico WHERE id = $1",
    [id]
  );
  if (!rows[0]) return null;
  if (rows[0].slug) return rows[0].slug;

  const base = kebabSemAcento(rows[0].nome) || "fornecedor";
  for (const tentativa of [base, `${base}-${id}`]) {
    try {
      const upd = await pool.query<{ slug: string }>(
        "UPDATE fornecedor_publico SET slug = $2 WHERE id = $1 RETURNING slug",
        [id, tentativa]
      );
      return upd.rows[0]?.slug ?? null;
    } catch {
      // colisão no índice único — tenta a próxima
    }
  }
  return null;
}

export type Portfolio = {
  fornecedor: FornecedorPublico;
  produtos: FornecedorProduto[];
};

/** Portfólio público de um fornecedor APROVADO (página /p/<slug> e diretório). */
export async function portfolioPublico(slug: string): Promise<Portfolio | null> {
  await garantirSchema();
  const { rows } = await pool.query<FornecedorPublico>(
    `SELECT fp.id, fp.nome, fp.documento, fp.telefone, fp.telefone_whatsapp, fp.endereco,
            fp.observacao, fp.pix_chave, fp.email, fp.cidade, fp.situacao, fp.motivo, fp.criado_em,
            fp.slug,
            (fp.portfolio_pdf IS NOT NULL AND fp.portfolio_pdf <> '') AS tem_pdf,
            COALESCE((SELECT json_agg(b.nome ORDER BY b.nome)
                        FROM fornecedor_publico_bairro fb JOIN bairro b ON b.id = fb.bairro_id
                       WHERE fb.fornecedor_publico_id = fp.id), '[]'::json) AS bairros
       FROM fornecedor_publico fp
      WHERE fp.slug = $1 AND fp.situacao = 'aprovado'`,
    [slug]
  );
  const fornecedor = rows[0];
  if (!fornecedor) return null;
  const produtos = await listarProdutosFornecedor(fornecedor.id);
  return { fornecedor, produtos };
}

export async function salvarPortfolioPdf(fornecedorId: number, base64: string | null): Promise<void> {
  await garantirSchema();
  await pool.query("UPDATE fornecedor_publico SET portfolio_pdf = $2 WHERE id = $1", [
    fornecedorId,
    base64,
  ]);
}

export async function portfolioPdf(fornecedorId: number): Promise<string | null> {
  await garantirSchema();
  const { rows } = await pool.query<{ portfolio_pdf: string | null }>(
    "SELECT portfolio_pdf FROM fornecedor_publico WHERE id = $1",
    [fornecedorId]
  );
  return rows[0]?.portfolio_pdf || null;
}

export async function portfolioPdfPorSlug(slug: string): Promise<string | null> {
  await garantirSchema();
  const { rows } = await pool.query<{ portfolio_pdf: string | null }>(
    "SELECT portfolio_pdf FROM fornecedor_publico WHERE slug = $1 AND situacao = 'aprovado'",
    [slug]
  );
  return rows[0]?.portfolio_pdf || null;
}

// ---------- messageria / notificações (db/27) ----------

/** Quem recebe o aviso: um `usuario` OU um `fornecedor_publico`. */
export type Destino = { usuarioId: number } | { fornecedorId: number };

export type Notificacao = {
  id: number;
  tipo: string;
  titulo: string;
  corpo: string | null;
  link: string | null;
  lida: boolean;
  criado_em: string;
  /** `corpo` é um bloco de HTML (avisos do super admin) — renderizar como tal. */
  html: boolean;
};

export type NovaNotificacao = {
  tipo?: string;
  titulo: string;
  corpo?: string | null;
  link?: string | null;
  chave?: string | null;
};

/** `usuario_id = $n` ou `fornecedor_publico_id = $n`, com o valor. */
function condDestino(d: Destino, base = 1): { where: string; params: unknown[] } {
  return "usuarioId" in d
    ? { where: `usuario_id = $${base}`, params: [d.usuarioId] }
    : { where: `fornecedor_publico_id = $${base}`, params: [d.fornecedorId] };
}

const CAMPOS_NOTIF = "id, tipo, titulo, corpo, link, lida, criado_em, html";

/** Cria um aviso pro destinatário. `chave` presente = idempotente. */
export async function notificar(d: Destino, n: NovaNotificacao): Promise<void> {
  await garantirSchema();
  const usuarioId = "usuarioId" in d ? d.usuarioId : null;
  const fornecedorId = "fornecedorId" in d ? d.fornecedorId : null;
  await pool.query(
    `INSERT INTO notificacao (usuario_id, fornecedor_publico_id, tipo, titulo, corpo, link, chave)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (coalesce(usuario_id, 0), coalesce(fornecedor_publico_id, 0), chave) WHERE chave IS NOT NULL DO NOTHING`,
    [
      usuarioId,
      fornecedorId,
      n.tipo ?? "sistema",
      n.titulo,
      n.corpo ?? null,
      n.link ?? null,
      n.chave ?? null,
    ]
  );
}

/** Cria o mesmo aviso pra todos os usuários ativos de uma empresa. */
export async function notificarUsuariosDaEmpresa(
  empresaId: number,
  n: NovaNotificacao,
  chaveBase?: string
): Promise<void> {
  await garantirSchema();
  await pool.query(
    `INSERT INTO notificacao (usuario_id, tipo, titulo, corpo, link, chave)
     SELECT u.id, $2, $3, $4, $5,
            CASE WHEN $6::text IS NULL THEN NULL ELSE $6 || ':' || u.id END
       FROM usuario u
      WHERE u.empresa_id = $1 AND u.ativo
     ON CONFLICT (coalesce(usuario_id, 0), coalesce(fornecedor_publico_id, 0), chave) WHERE chave IS NOT NULL DO NOTHING`,
    [empresaId, n.tipo ?? "sistema", n.titulo, n.corpo ?? null, n.link ?? null, chaveBase ?? null]
  );
}

export async function listarNotificacoes(d: Destino, limite = 50): Promise<Notificacao[]> {
  await garantirSchema();
  const { where, params } = condDestino(d);
  params.push(limite);
  const { rows } = await pool.query<Notificacao>(
    `SELECT ${CAMPOS_NOTIF} FROM notificacao
      WHERE ${where}
      ORDER BY criado_em DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

export async function contarNaoLidas(d: Destino): Promise<number> {
  await garantirSchema();
  const { where, params } = condDestino(d);
  const { rows } = await pool.query<{ total: number }>(
    `SELECT count(*)::int AS total FROM notificacao WHERE ${where} AND NOT lida`,
    params
  );
  return rows[0]?.total ?? 0;
}

export async function marcarNotificacaoLida(d: Destino, id: number): Promise<void> {
  await garantirSchema();
  const { where, params } = condDestino(d, 2);
  await pool.query(
    `UPDATE notificacao SET lida = true, lida_em = now() WHERE id = $1 AND ${where} AND NOT lida`,
    [id, ...params]
  );
}

export async function marcarTodasLidas(d: Destino): Promise<void> {
  await garantirSchema();
  const { where, params } = condDestino(d);
  await pool.query(
    `UPDATE notificacao SET lida = true, lida_em = now() WHERE ${where} AND NOT lida`,
    params
  );
}

/**
 * Materializa, pro usuário dado, um aviso por anotação da empresa que está no
 * dia do alerta (ou atrasada) e ainda aberta. Idempotente pela `chave` na
 * primeira vez; depois, se o aviso já foi lido e a anotação continua aberta e
 * devida, "ressuscita" o mesmo aviso (volta a não lido) a cada 2 dias — só
 * para de avisar quando o usuário concluir a anotação ou excluí-la.
 */
export async function sincronizarAvisosDeAnotacoes(
  usuarioId: number,
  empresaId: number
): Promise<void> {
  await garantirSchema();
  await pool.query(
    `INSERT INTO notificacao (usuario_id, tipo, titulo, corpo, link, chave, html)
     SELECT $1::bigint, 'anotacao',
            CASE WHEN de_admin THEN 'Aviso da administração: ' ELSE 'Lembrete: ' END ||
              left(regexp_replace(texto, '<[^>]*>', '', 'g'), 70),
            texto, '/anotacoes', 'anotacao:' || id || ':' || $1::bigint, de_admin
       FROM anotacao
      WHERE empresa_id = $2::bigint AND NOT concluida
        AND data_alerta IS NOT NULL AND data_alerta <= CURRENT_DATE
     ON CONFLICT (coalesce(usuario_id, 0), coalesce(fornecedor_publico_id, 0), chave) WHERE chave IS NOT NULL DO NOTHING`,
    [usuarioId, empresaId]
  );
  await pool.query(
    `UPDATE notificacao n
        SET lida = false, lida_em = NULL, criado_em = now()
       FROM anotacao a
      WHERE n.usuario_id = $1::bigint
        AND n.tipo = 'anotacao'
        AND n.chave = 'anotacao:' || a.id || ':' || $1::bigint
        AND n.lida AND n.lida_em IS NOT NULL AND n.lida_em <= now() - interval '2 days'
        AND a.empresa_id = $2::bigint AND NOT a.concluida
        AND a.data_alerta IS NOT NULL AND a.data_alerta <= CURRENT_DATE`,
    [usuarioId, empresaId]
  );
}

// ---------- pedidos (db/28) ----------

export type PedidoItem = {
  id: number;
  fornecedor_produto_id: number | null;
  nome: string;
  unidade: UnidadePedido;
  qtd: number;
  preco_unit: number;
  subtotal: number;
};

export type PedidoLista = {
  id: number;
  status: StatusPedido;
  observacao: string | null;
  motivo: string | null;
  total: number;
  criado_em: string;
  atualizado_em: string;
  itens: PedidoItem[];
  /** lado do fornecedor */
  empresa_nome?: string;
  empresa_cidade?: string | null;
  empresa_telefone?: string | null;
  empresa_whatsapp?: boolean;
  /** lado da loja */
  fornecedor_nome?: string;
  fornecedor_slug?: string | null;
  fornecedor_telefone?: string | null;
  fornecedor_whatsapp?: boolean;
};

const ITENS_JSON = `COALESCE((
    SELECT json_agg(json_build_object(
      'id', i.id, 'fornecedor_produto_id', i.fornecedor_produto_id, 'nome', i.nome,
      'unidade', i.unidade, 'qtd', i.qtd,
      'preco_unit', i.preco_unit::float8, 'subtotal', i.subtotal::float8) ORDER BY i.id)
    FROM pedido_item i WHERE i.pedido_id = p.id), '[]'::json) AS itens`;

export async function criarPedido(
  empresaId: number,
  usuarioId: number,
  fornecedorPublicoId: number,
  d: {
    observacao?: string | null;
    itens: { fornecedorProdutoId: number; unidade: UnidadePedido; qtd: number }[];
  }
): Promise<{ id: number; total: number; nItens: number }> {
  await garantirSchema();
  const fp = await pool.query<{ situacao: string }>(
    "SELECT situacao FROM fornecedor_publico WHERE id = $1",
    [fornecedorPublicoId]
  );
  if (!fp.rows[0] || fp.rows[0].situacao !== "aprovado") {
    throw Object.assign(new Error("Fornecedor indisponível."), { code: "FORN_INDISP" });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const ins = await cliente.query<{ id: number }>(
      `INSERT INTO pedido (empresa_id, fornecedor_publico_id, criado_por_usuario_id, observacao)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [empresaId, fornecedorPublicoId, usuarioId || null, d.observacao?.trim() || null]
    );
    const pedidoId = ins.rows[0].id;

    let total = 0;
    let nItens = 0;
    for (const it of d.itens ?? []) {
      const qtd = Math.round(Number(it.qtd));
      if (!Number.isInteger(qtd) || qtd <= 0) continue;
      const unidade: UnidadePedido = it.unidade === "caixa" ? "caixa" : "un";
      const prod = await cliente.query(
        `SELECT nome, preco_unidade::float8 AS preco_unidade, preco_desconto::float8 AS preco_desconto,
                desconto_qtd_min, preco_caixa::float8 AS preco_caixa
           FROM fornecedor_produto
          WHERE id = $1 AND fornecedor_publico_id = $2 FOR SHARE`,
        [Number(it.fornecedorProdutoId), fornecedorPublicoId]
      );
      const p = prod.rows[0];
      if (!p) continue;
      const preco = precoAplicavel(p, unidade, qtd);
      if (preco == null) continue;
      const subtotal = Math.round(preco * qtd * 100) / 100;
      total += subtotal;
      nItens += 1;
      await cliente.query(
        `INSERT INTO pedido_item (pedido_id, fornecedor_produto_id, nome, unidade, qtd, preco_unit, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [pedidoId, Number(it.fornecedorProdutoId), p.nome, unidade, qtd, preco, subtotal]
      );
    }
    if (nItens === 0) {
      await cliente.query("ROLLBACK");
      throw Object.assign(new Error("Escolha ao menos um produto."), { code: "SEM_ITEM" });
    }
    total = Math.round(total * 100) / 100;
    await cliente.query("UPDATE pedido SET total = $2 WHERE id = $1", [pedidoId, total]);
    await cliente.query("COMMIT");
    return { id: pedidoId, total, nItens };
  } catch (e) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    cliente.release();
  }
}

export async function listarPedidosDoFornecedor(
  fornecedorId: number,
  situacao?: string
): Promise<PedidoLista[]> {
  await garantirSchema();
  const params: unknown[] = [fornecedorId];
  let filtro = "";
  if (situacao && ["novo", "visto", "atendido", "cancelado"].includes(situacao)) {
    params.push(situacao);
    filtro = `AND p.status = $${params.length}`;
  }
  const { rows } = await pool.query<PedidoLista>(
    `SELECT p.id, p.status, p.observacao, p.motivo, p.total::float8 AS total,
            p.criado_em, p.atualizado_em,
            e.nome AS empresa_nome, e.cidade AS empresa_cidade,
            e.telefone AS empresa_telefone, e.telefone_whatsapp AS empresa_whatsapp,
            ${ITENS_JSON}
       FROM pedido p JOIN empresa e ON e.id = p.empresa_id
      WHERE p.fornecedor_publico_id = $1 ${filtro}
      ORDER BY p.criado_em DESC`,
    params
  );
  return rows;
}

export async function listarPedidosDaLoja(empresaId: number): Promise<PedidoLista[]> {
  await garantirSchema();
  const { rows } = await pool.query<PedidoLista>(
    `SELECT p.id, p.status, p.observacao, p.motivo, p.total::float8 AS total,
            p.criado_em, p.atualizado_em,
            fp.nome AS fornecedor_nome, fp.slug AS fornecedor_slug,
            fp.telefone AS fornecedor_telefone, fp.telefone_whatsapp AS fornecedor_whatsapp,
            ${ITENS_JSON}
       FROM pedido p JOIN fornecedor_publico fp ON fp.id = p.fornecedor_publico_id
      WHERE p.empresa_id = $1
      ORDER BY p.criado_em DESC`,
    [empresaId]
  );
  return rows;
}

type EscopoPedido = { fornecedorId: number } | { empresaId: number };

function condPedido(escopo: EscopoPedido): { where: string; valor: number } {
  return "fornecedorId" in escopo
    ? { where: "fornecedor_publico_id", valor: escopo.fornecedorId }
    : { where: "empresa_id", valor: escopo.empresaId };
}

export async function pedidoDetalhe(id: number, escopo: EscopoPedido): Promise<PedidoLista | null> {
  await garantirSchema();
  const c = condPedido(escopo);
  const { rows } = await pool.query<PedidoLista>(
    `SELECT p.id, p.status, p.observacao, p.motivo, p.total::float8 AS total,
            p.criado_em, p.atualizado_em,
            e.nome AS empresa_nome, e.cidade AS empresa_cidade,
            e.telefone AS empresa_telefone, e.telefone_whatsapp AS empresa_whatsapp,
            fp.nome AS fornecedor_nome, fp.slug AS fornecedor_slug,
            fp.telefone AS fornecedor_telefone, fp.telefone_whatsapp AS fornecedor_whatsapp,
            ${ITENS_JSON}
       FROM pedido p
       JOIN empresa e ON e.id = p.empresa_id
       JOIN fornecedor_publico fp ON fp.id = p.fornecedor_publico_id
      WHERE p.id = $1 AND p.${c.where} = $2`,
    [id, c.valor]
  );
  return rows[0] ?? null;
}

/**
 * Muda o status de um pedido. Valida a transição (proximoStatusValido) e o dono.
 * Devolve o pedido atualizado + os dois lados, pra quem chamou notificar o outro.
 */
export async function mudarStatusPedido(
  id: number,
  escopo: EscopoPedido,
  acao: "visto" | "atender" | "cancelar",
  motivo?: string | null
): Promise<
  | {
      pedido: { id: number; status: StatusPedido; total: number };
      empresaId: number;
      fornecedorId: number;
      quem: "fornecedor" | "loja";
    }
  | { erro: "nao-encontrado" | "transicao-invalida" }
> {
  await garantirSchema();
  const c = condPedido(escopo);
  const atualQ = await pool.query<{ status: StatusPedido; empresa_id: number; fornecedor_publico_id: number }>(
    `SELECT status, empresa_id, fornecedor_publico_id FROM pedido WHERE id = $1 AND ${c.where} = $2`,
    [id, c.valor]
  );
  const linha = atualQ.rows[0];
  if (!linha) return { erro: "nao-encontrado" };

  const quem: "fornecedor" | "loja" = "fornecedorId" in escopo ? "fornecedor" : "loja";
  const novo = proximoStatusValido(linha.status, acao, quem);
  if (!novo) return { erro: "transicao-invalida" };

  const upd = await pool.query<{ id: number; status: StatusPedido; total: number }>(
    `UPDATE pedido
        SET status = $2, motivo = CASE WHEN $2 = 'cancelado' THEN $3 ELSE motivo END,
            atualizado_em = now()
      WHERE id = $1
      RETURNING id, status, total::float8 AS total`,
    [id, novo, (motivo ?? "").trim() || null]
  );
  return {
    pedido: upd.rows[0],
    empresaId: linha.empresa_id,
    fornecedorId: linha.fornecedor_publico_id,
    quem,
  };
}
