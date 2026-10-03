-- 44_fornecedor_produto_tipo.sql — catálogo do fornecedor com "venda por" (unidade,
-- caixa, quilo, fardo, pacote, dúzia, saco, bandeja, litro), desconto em % a partir
-- de uma quantidade, "também vende por unidade" (caixa) e pedido com urgência
-- (taxa). No pedido: `urgente` + `taxa_urgencia` (a taxa já está somada em `total`).
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts). Não vai pro desktop.

ALTER TABLE fornecedor_produto ADD COLUMN IF NOT EXISTS tipo_venda text NOT NULL DEFAULT 'unidade';
ALTER TABLE fornecedor_produto ADD COLUMN IF NOT EXISTS desconto_pct numeric;
ALTER TABLE fornecedor_produto ADD COLUMN IF NOT EXISTS permite_unidade boolean NOT NULL DEFAULT false;
ALTER TABLE fornecedor_produto ADD COLUMN IF NOT EXISTS aceita_urgencia boolean NOT NULL DEFAULT false;
ALTER TABLE fornecedor_produto ADD COLUMN IF NOT EXISTS taxa_urgencia numeric;

-- produtos que só tinham preço de caixa passam a ser "vendidos por caixa"
UPDATE fornecedor_produto SET tipo_venda = 'caixa'
 WHERE tipo_venda = 'unidade' AND preco_unidade IS NULL AND preco_caixa IS NOT NULL;

ALTER TABLE pedido ADD COLUMN IF NOT EXISTS urgente boolean NOT NULL DEFAULT false;
ALTER TABLE pedido ADD COLUMN IF NOT EXISTS taxa_urgencia numeric(10,2) NOT NULL DEFAULT 0;
