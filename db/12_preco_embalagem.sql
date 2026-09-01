-- 12_preco_embalagem.sql
-- Preco da embalagem fechada (fardo, caixa, saco...) quando o produto tambem
-- e vendido inteiro, com preco diferente do avulso/por quilo.
-- NULL = so vende avulso. Idempotente; espelhado em MIGRACOES_IDEMPOTENTES.

ALTER TABLE produto ADD COLUMN IF NOT EXISTS preco_embalagem numeric(10,2);

COMMENT ON COLUMN produto.preco_embalagem IS
  'Preco da embalagem inteira (fardo/caixa/...). NULL = so vende avulso/por quilo.';
