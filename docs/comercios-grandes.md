# Comércios grandes (cotação de concorrentes)

Trecho movido do CLAUDE.md (referenciado por lá).

### Comércios grandes — cotação de preço dos concorrentes (`/produtos/comercios-grandes`)

Módulo "Comércios grandes": **não cadastra produtos** — lê os preços de um concorrente e compara com
os do lojista. **Só visão.** Um `<CampoVoz>` **obrigatório de "Nome do estabelecimento"** precede
qualquer upload (os botões ficam desabilitados enquanto vazio) — é a chave do histórico de preço.
Duas fontes:

- **🎥 Vídeo** — `src/lib/quadrosDeVideo.ts` extrai quadros **no navegador** (sem ffmpeg: `<video>` +
  `currentTime` de 2 em 2 s + `canvas`, ~1100px, teto 70). Lotes de 4 quadros → `POST
  /api/produtos/comercios-grandes` (`fonte=video`, `src/lib/lerMercadoVideo.ts` — lê a etiqueta da
  prateleira) → `[{nome, preco|null, quadro}]`; o quadro vira a miniatura do item.
- **📄 Encarte (PDF ou foto)** — **o PDF é rasterizado no navegador** (`src/lib/pdfParaImagens.ts`,
  `pdfjs-dist`, worker via `new URL(...import.meta.url)`, ~1500px/página, teto 8) e as fotos passam por
  `comprimirImagem`; nos dois casos vira **imagem**, então dá pra recortar a miniatura. `POST
  /api/produtos/comercios-grandes` (`fonte=encarte`, campo `fotos`, 1-10 imagens) → `src/lib/lerEncartePdf.ts`
  (`extrairPrecosDoEncarte`, só blocos `image`, tudo numa chamada) → `[{nome, preco|null, imagem, caixa}]`
  (`caixa` = retângulo 0..1 do produto+preço). O cliente recorta `imagens[imagem]` pela `caixa`
  (`src/lib/recorteMiniatura.ts`) e casa a miniatura no resultado por nome normalizado.

`POST /api/produtos/comercios-grandes` **não grava nada** — só extrai. A tela mostra o **passo a passo**
(`.passos`) e no fim junta tudo e chama **`POST /api/produtos/comercios-grandes/analisar`**
`{estabelecimento, fonte, itens}` (fonte real: `video` | `foto` | `pdf`):
- dedup por nome normalizado (`normalizarNomeProduto` em `src/lib/textoProduto.ts` — puro, também usado
  no cliente), **fica só com os que tiveram preço**;
- `compararCotacoes` → `acharMeuProduto` casa **por proximidade** (tenta o nome cru, sem peso/embalagem
  e só marca+tipo — `variantesBuscaProduto`), pega o melhor `score`: **≥ 0.5 → `confianca:"alta"`**,
  **≥ 0.32 → `"provavel"`** (mostra "Parece ser … (confira)"), senão sem match. Pega o meu produto
  **mesmo cadastrado com outro nome**. Também a última linha de `cotacao_concorrente` (`db/31`) do
  mesmo `estabelecimento`+`nome_norm` **de um dia anterior** vira `precoAnterior`/`dataAnterior`
  (tendência ↑/↓);
- `registrarCotacoes` grava a leitura do dia — **uma linha por produto/estabelecimento/dia**
  (`ux_cotacao_conc_dia`, `ON CONFLICT ... DO UPDATE`); só amarra `produto_id`/`meu_preco` quando a
  confiança é `alta`.

Resultado: resumo ("N encontrados · M com preço · registrado em dd/mm") + lista **só dos com preço**,
ordenada por "mais barato lá" primeiro, cada item com a **miniatura recortada**, o preço do concorrente,
o comparativo com o meu (`.cg-comparado` — barato/caro/igual/provável/sem match) e a tendência
(`.cg-tendencia`). Custo: ~alguns centavos de visão Opus por análise. Sem `ANTHROPIC_API_KEY` → 500
amigável.

**Virou um CRUD (`db/32`)** — cada análise é agrupada num **lote** (`cotacao_lote`: um por
`estabelecimento`+dia, `ON CONFLICT ... DO UPDATE` — reanálise no mesmo dia atualiza o lote em vez de
duplicar), guardando `usuario_id`/`usuario_nome` (snapshot, de `exigirEmpresa().sessao`), `fonte`,
`qtd_produtos` e `data`; `cotacao_concorrente.lote_id` referencia o lote de cada linha. "Meu histórico"
num card → `GET .../lotes?estabelecimento=` (`listarLotesDoEstabelecimento`, ainda por empresa) →
`GET .../lotes/:id` (`loteDetalhe`) — a data, quem lançou e os produtos com o comparativo salvo na hora
(client-state na mesma página, `Estado` ganhou `"lotes"`/`"lote"`).

**Virou compartilhado entre lojas (`db/36`)** — `GET /api/produtos/comercios-grandes/historico`
(`listarEstabelecimentosCotados`) deixou de filtrar por `empresa_id`: um `DISTINCT ON (estabelecimento)`
global pega o **lote mais recente de QUALQUER loja** por estabelecimento, junta com `empresa` pro nome +
`empresaTemLogo`, e recalcula **pra quem está vendo** (nunca usa o `meu_preco` gravado, que é de quem
lançou) quantos produtos daquele lote batem no catálogo do visitante (`acharMeuProduto`, exportado). O
card (`.cg-card-rico`) mostra isso tudo de cara — logo (ou 🏬), "por `<empresa>`" (ou "por você"), data,
produtos encontrados, **produtos que você vende** — sem precisar entrar em nada; um clique em **"Comparar
preços"** abre um painel na própria página (`GET .../lotes/:id/comparar` → `compararLoteParaEmpresa`,
mesma lógica recalculada) com o resumo ("N compatíveis — X mais caro, Y mais barato") e uma lista
`.cg-item` em linhas separadas, nunca lado a lado. Ao registrar um lote, `notificarParceirosSobreCotacao`
avisa (tipo `cotacao`, ícone 💹) todas as **outras** lojas `situacao='aprovada'` — exceto quem silenciou
esse estabelecimento (`cotacao_silenciada (empresa_id, estabelecimento)`, toggle em `.cg-card-rico` via
`POST .../silenciar`) — link `/produtos/comercios-grandes`, chave `cotacao:<loteId>` (idempotente).
`empresa.logo`/`fornecedor_publico.logo` (data URL, fora do select comum → `tem_logo`) são editáveis em
`/configuracoes` e `/fornecedor` (`<CampoFoto semCaptura>`, salva na hora via `PUT /api/empresa/logo` /
`PUT /api/fornecedor/logo`); a logo de **qualquer** empresa é servida cross-tenant por
`GET /api/empresas/:id/logo` (só precisa estar logado — é branding, não é dado sensível) — é o que o
card do parceiro usa.
