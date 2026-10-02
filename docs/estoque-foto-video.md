# Estoque por foto e por vídeo

Trecho movido do CLAUDE.md (referenciado por lá).

### Shelf-photo stock update (`/produtos/estoque-foto`)

Same vision-extraction shape as the receipt importer (`src/lib/lerEstoqueFoto.ts`), but for counting visible
stock rather than reading a receipt, and it accepts **multiple photos in one request** (`fotos` form field,
repeated) — all images ride in a single Claude call as multiple `image` content blocks, with the prompt told
to treat each photo as a different shelf/area and sum counts for a product that reappears across photos, so
this stays one API call regardless of photo count rather than one per photo. `POST /api/produtos/estoque-foto`
matches each detected product against the catalog via `buscarProduto`, same threshold as the purchase importer.
For a match, the review screen only lets you edit the estoque number — `atualizarEstoqueProduto` in `db.ts` is
a narrow single-column `UPDATE ... SET estoque` (unlike `atualizarProduto`, which replaces the whole row), so
this path never touches price, name, or category. For no match, the item is included by default as a **new**
product (name/embalagem/tipo-venda editable, stock prefilled from the photo count) — sale price has no source
in a shelf photo, so that field starts empty and must be filled before saving, by typing or via the same
voice-input component (`CampoVoz`/`useVoz`) used on the Produtos screen. The new-product line now has **both
`preço de compra` and `preço de venda`** — typing/speaking the purchase price auto-fills the sale price as
`compra × 1.38` (`MARGEM_VENDA = 0.38`, same rule as "Importar compra"), still editable; the confirm route
requires both and passes `precoCompra` to `criarProduto`.

The route's catch-all used to always answer with a hardcoded "tire fotos mais nítidas" message regardless
of the real failure (vision API error, bad JSON, DB error, etc.) — misdiagnosed as a photo-quality problem
when it almost never was. It now returns the real error in `detalhe` (same convention as everywhere else,
see the Produtos section) instead of guessing a cause.

### Stock-by-video (`/produtos/estoque-video`)

The shopkeeper **records** (in-app camera, not a file pick) a short video walking the shelf, optionally
**narrating** "name, quantity" per item ("Batata Mix, 12 pacotes"), optionally with a price too
("…, R$ 10"). Audio-first, with a vision fallback when there's no narration:
- `<GravadorVideo>` (`src/components/GravadorVideo.tsx`) — `getUserMedia({video:{facingMode:"environment"},
  audio:true})` + `MediaRecorder`, live preview, Gravar/Parar, auto-stops at `MAX_SEGUNDOS` (140). While
  recording it grabs a **canvas frame every 1.5 s** (`{t, dataUrl}`), so no seeking a webm blob later.
- Client (`src/lib/audioCliente.ts`) decodes the recorded blob's audio (`decodeAudioData` +
  `OfflineAudioContext`) → **16 kHz mono 16-bit WAV**, capped at 140 s (≈4.3 MB, under the serverless body
  limit). The video itself is never uploaded.
- `POST /api/produtos/estoque-video` → `src/lib/lerEstoqueVideo.ts`: (1) `transcreverAudio` posts the WAV to
  a Whisper endpoint — **OpenAI-compatible**, `TRANSCRICAO_URL` (default Groq `whisper-large-v3-turbo`) +
  `TRANSCRICAO_API_KEY`; `verbose_json` for segment timestamps. Unset key → route 503s with a "not
  configured" message. (2) `interpretarTranscricao` — Claude (`ANTHROPIC_MODEL_VIDEO`, default
  `claude-sonnet-5`, text only) → `[{nome, quantidade|null, preco|null, generico, segundos}]`. It splits the
  spoken numbers: "R$/reais/centavos/a dúzia" → price, a bare count/"pacotes"/"dúzia"(=12) → quantity.
  **`generico: true`** when the name was garbled and Claude guessed. `buscarProduto` matches to the catalog.
  **If the transcript yields zero items** (silent video, or speech Whisper/Claude couldn't parse), the route
  falls back to vision: the client already sends up to 8 of `<GravadorVideo>`'s captured frames (evenly
  sampled, `quadros` form field, data URLs) alongside the audio, and `lerEstoqueDosQuadros` reuses
  `extrairEstoqueDasFotos` (the same shelf-photo vision call from `lerEstoqueFoto.ts`) to read product name +
  visible quantity straight from the frames — no narration needed. The response carries `origem: "fala" |
  "video"` so the client can say which path produced the results; vision-origin items have no `preco`/
  `segundos` (price isn't visible on a shelf count, thumbnail just falls back to the first sampled frame).
- The client picks the recorded frame nearest `segundos + 1` as the product photo (editable per row via
  `<CampoFoto>`).
- `POST /api/produtos/estoque-video/confirmar`: matched → `atualizarEstoqueProduto` and/or
  `atualizarPrecoProduto` (whichever the row carries) + `atualizarFotoProduto`; unmatched → `criarProduto`
  (preco_compra 0, estoque from the count, frame as `foto`; a price is required in the review).
- **Cost** (per minute of video, per run): Groq transcription ≈ US$0.0007/min + Claude Sonnet on the
  ~200-token transcript ≈ US$0.007/min → **≈ US$0.008/min** (~R$0.04). Haiku (`ANTHROPIC_MODEL_VIDEO`)
  roughly halves the Claude part.
