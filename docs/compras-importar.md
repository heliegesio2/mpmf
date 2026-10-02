# Importar compra (/compras/importar)

Trecho movido do CLAUDE.md (referenciado por lá).

### Purchase-receipt import (`/compras/importar`)

`src/lib/importarCompra.ts` (`extrairCupom`) sends one or more images of a supplier's purchase receipt
(NFC-e) to Claude (`@anthropic-ai/sdk`, model `ANTHROPIC_MODEL` env var or `claude-opus-5` default) as a
vision request constrained with `output_config.format` (structured outputs) so the response is
guaranteed-parseable JSON — no free-text parsing. It returns `{ nota: {chaveAcesso, numero, emitente},
itens: [...] }`. The prompt explicitly tells the model to cross-check smudged/creased digits against
`quantidade × valorUnitario ≈ valorTotal`, which in practice resolves illegible printed numbers correctly,
and to read the 44-digit chave de acesso. `POST /api/importar-compra` (multipart) runs the extraction and,
per item, calls the existing `buscarProduto` (the same fuzzy-match SQL function the voice search uses) to
suggest a matching catalog product above a similarity threshold — nothing is written to the database at
this step. The client reviews/edits every line (matched-product toggle, editable **preço de compra + preço
de venda**) before `POST /api/importar-compra/confirmar` applies it: matched items go through
`atualizarProduto` (preserving all fields except price), unmatched ones create a new product via
`criarProduto`. Stock (`estoque`) is deliberately left untouched by this flow.

**Two capture modes**, toggled by a 📷/🎥 button pair on the "nova importação" screen (`modoCaptura` state
in `src/app/compras/importar/page.tsx`):
- **Foto** — `<CameraFoto max={1}>` (real camera, not a file picker), analysis fires automatically once a
  photo is added. `extrairCupom` gets called with a single `ImagemEntrada`.
- **Vídeo** — two ways to get frames, same downstream handling: `<GravadorVideo maxSegundos={45}>`
  (same live-recording component as "estoque por vídeo") for filming up close on the spot, **or** "📁
  Enviar vídeo já gravado" (a plain `<input type="file" accept="video/*">`) for a video the shopkeeper
  already has (e.g. received over WhatsApp) — that path runs `extrairQuadros` (`src/lib/quadrosDeVideo.ts`,
  the same browser-side no-ffmpeg frame extractor `comercios-grandes` uses for its video upload) to turn
  the file into frames client-side. Either way, this is for small/hard-to-read receipts where a single
  photo doesn't capture the fine print legibly. The client samples up to 5 frames evenly (`amostrarQuadros`,
  capped low on purpose — see below) and sends them as repeated `quadros` form fields (data URLs); the
  server (`importarDeVideo` in `route.ts`) decodes them (`quadroParaImagem`/`amostrarUniforme`, shared with
  `estoque-video`'s route in `src/lib/quadroImagem.ts`) and passes **all frames in one `extrairCupom` call**
  — the prompt is told they may be multiple angles/zooms of the SAME note and to not duplicate an item seen
  in more than one frame. The duplicate-note hash in this path is computed over the joined frame data URLs
  (not file bytes, since there's no single uploaded file) — the chave-de-acesso dedupe after extraction is
  what actually catches a receipt re-captured a second time with a different set of frames.

  **Frame count is capped at 5, not higher** — an earlier version sent up to 8, and a 15-30s recording
  (plenty for panning over a small note) made the multi-image Opus call slow enough to occasionally exceed
  the serverless function's time limit, which made Vercel return an HTML error page instead of JSON and
  broke `response.json()` client-side with a cryptic "Unexpected token" error. Both `POST`'s own
  `request.formData()` parsing and the client's response parsing (`processarCupom` in `page.tsx`) are now
  wrapped so a non-JSON or malformed response surfaces a readable message instead of an uncaught parse
  error — but the frame cap is what actually avoids triggering the timeout in the first place.

**Margem de lucro** — `empresa.margem_padrao` (`db/30`, numeric, default 38) is the store's target profit
% over purchase price. `GET/PUT /api/importar-compra/margem` (`margemPadraoEmpresa` /
`definirMargemPadraoEmpresa`). The screen shows it as an editable field up top; the read route uses it for
the suggested sale price (`compra × (1 + margem/100)`), and changing the field recomputes every line's
sale price client-side and saves the new default. `db/09`'s old hardcoded `× 1.38` is gone here (the
shelf-photo / video flows still use their own `MARGEM_VENDA = 0.38`).

**Nota repetida** — `compra_nota` (`db/30`: `empresa_id`, `chave`, `hash_imagem` sha256 of the uploaded
bytes, `numero`, `emitente`, `itens`). `POST /api/importar-compra` computes the image hash and calls
`notaCompraExistente(empresaId, hash, chave)` — **first by hash before spending a vision call** (identical
re-upload), then by the extracted chave de acesso (re-photographed note). A hit returns `{ jaProcessada:
true, aviso }` and the UI shows a "Nota repetida" card instead of line items. The note is recorded only at
`POST /api/importar-compra/confirmar` (after the products are actually written), which also re-checks and
409s on a repeat. The client round-trips `nota: {hashImagem, chave, numero, emitente}` from read to confirm.
The upload photo is downscaled/re-encoded to JPEG client-side (`comprimirImagem`, max 1800px long edge)
before it's sent — both to stay under serverless request-body limits and to control vision token cost.

**Virou uma tela de listagem (`db/37`)** — `/compras/importar` agora tem dois estados client-side
(`Estado = "lista" | "nova"`): por padrão mostra as **últimas notas confirmadas** (`GET
/api/importar-compra/notas` → `listarNotasCompra`: emitente, número, quantidade de itens, quando) com um
botão **"➕ Nova importação"** que abre o fluxo de sempre (foto → revisão → confirmar); ao salvar, volta
pra lista e recarrega. Cada linha tem **"Ver itens"**, que expande ali mesmo (sem navegar, mesmo padrão
`.cg-comparar-painel`/`.cg-item` do Comércios grandes) trazendo `GET /api/importar-compra/notas/:id`
(`notaCompraDetalhe`) — nome, preço de compra, preço de venda e se era produto novo ou já cadastrado,
pra cada item daquela nota. Isso existe porque `compra_nota` só guardava a **contagem** de itens; agora
`compra_nota_item` (`compra_nota_id`, `produto_id`, `nome`, `preco_compra`, `preco_venda`, `novo`) grava
uma linha por item, escrita em `POST /api/importar-compra/confirmar` logo depois de
`registrarNotaCompra` (que passou a devolver o `id` — `ON CONFLICT ... DO UPDATE ... RETURNING id`, pra
sempre ter onde pendurar os itens mesmo numa corrida).

The client-side JPEG compression (`src/lib/imagemCliente.ts`, `comprimirImagem`) is shared with the shelf-photo
stock update below — don't duplicate it per screen.
