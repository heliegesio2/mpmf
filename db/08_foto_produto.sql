-- 08_foto_produto.sql
-- Foto do produto: uma imagem opcional por produto, guardada como data URL
-- (image/jpeg;base64) direto na coluna. A loja tem poucas centenas de itens
-- e o app nao usa armazenamento externo (mesma linha do Pix/sessao feitos a
-- mao), entao o texto na propria tabela resolve. O cliente ja reduz a imagem
-- antes de enviar (ver src/lib/imagemCliente.ts).
--
-- A coluna fica FORA das buscas do dia a dia: buscar_produto e as listas so
-- devolvem "tem_foto" (booleano), e a imagem em si vem por /api/produtos/:id/foto.
-- Idempotente.

ALTER TABLE produto ADD COLUMN IF NOT EXISTS foto text;

COMMENT ON COLUMN produto.foto IS
  'Foto do produto como data URL (data:image/jpeg;base64,...). Opcional. '
  'Servida por /api/produtos/:id/foto; nas listas aparece so como tem_foto.';
