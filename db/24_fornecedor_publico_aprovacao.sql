-- 24_fornecedor_publico_aprovacao.sql — o super admin aprova/reprova os
-- cadastros públicos de fornecedor (tela /admin/fornecedores).
-- `situacao` vai de 'pendente' -> 'aprovado' | 'reprovado'.
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts).

ALTER TABLE fornecedor_publico ADD COLUMN IF NOT EXISTS motivo text;
ALTER TABLE fornecedor_publico ADD COLUMN IF NOT EXISTS decidido_em timestamptz;
