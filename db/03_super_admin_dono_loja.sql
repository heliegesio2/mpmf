-- 03_super_admin_dono_loja.sql
-- O super admin passa a poder ser dono de uma loja (empresa_id preenchido),
-- alem de continuar aprovando/reprovando outras empresas.
--
-- Antes: usuario_empresa_check exigia empresa_id NULL para todo super_admin.
-- Depois: super_admin pode ter empresa_id ou nao; admin/operador continuam
-- exigindo empresa_id sempre.
--
-- COMO RODAR: execute este arquivo no banco de producao (mesmo processo do
-- 00_completo.sql). Pode rodar de novo sem problema (idempotente).

ALTER TABLE usuario DROP CONSTRAINT IF EXISTS usuario_empresa_check;
ALTER TABLE usuario ADD CONSTRAINT usuario_empresa_check
  CHECK (papel = 'super_admin' OR empresa_id IS NOT NULL);

-- Liga o super admin (super@sistema.com) a loja "Mercadinho".
-- Ajuste o e-mail e/ou o nome da empresa abaixo se forem diferentes no seu banco.
UPDATE usuario
   SET empresa_id = (SELECT id FROM empresa WHERE nome = 'Mercadinho' LIMIT 1)
 WHERE email = 'super@sistema.com'
   AND papel = 'super_admin';

-- ---------- Conferencia ----------
SELECT u.nome, u.email, u.papel, u.empresa_id, e.nome AS empresa_nome
  FROM usuario u LEFT JOIN empresa e ON e.id = u.empresa_id
 WHERE u.papel = 'super_admin';
