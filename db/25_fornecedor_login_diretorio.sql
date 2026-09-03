-- 25_fornecedor_login_diretorio.sql
--
-- 1. Login do fornecedor: um `fornecedor_publico` aprovado entra pelo /login
--    com o e-mail/senha do cadastro. A sessão nasce com papel 'fornecedor' e
--    `fornecedorId` no token (src/lib/auth.ts). Nenhuma coluna nova aqui — o
--    `senha_hash` já existe desde o db/23.
--
-- 2. Diretório pras lojas: a loja informa o bairro em /configuracoes; o
--    /diretorio mostra os fornecedores APROVADOS que atendem a cidade (e o
--    bairro, se filtrado).
--
-- Espelhado em MIGRACOES_IDEMPOTENTES (src/lib/db.ts). Não vai pro desktop.

ALTER TABLE empresa ADD COLUMN IF NOT EXISTS bairro text;
