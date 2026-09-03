-- 21_emprestimo_item.sql — o que foi retirado no empréstimo.
-- A tela "Cascos" virou "Empréstimos"; o registro agora diz QUAL item o
-- cliente levou (engradado, botijão, vasilhame...), não só a quantidade.
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts) e no schema do desktop.

ALTER TABLE casco ADD COLUMN IF NOT EXISTS item text;
