"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import FotoAmpliavel from "@/components/FotoAmpliavel";
import { extrairQuadros, type QuadroVideo } from "@/lib/quadrosDeVideo";
import { comprimirParaDataURL } from "@/lib/imagemCliente";
import { mascararMoeda, moedaParaNumero, paraMoeda } from "@/lib/moeda";

type Estado = "parado" | "importando" | "extraindo" | "processando" | "revisao" | "salvando";

type Produto = {
  chave: string;
  nome: string;
  preco: string; // venda (lida da etiqueta)
  precoCompra: string;
  foto: string; // data URL
  jaCadastrado: { id: number; nome: string } | null;
  incluir: boolean;
};

const LOTE = 4;
const FLASH = "mpmf.produtoFlash";

function chaveNome(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function dataUrlParaFile(dataUrl: string, nome: string): File {
  const [cab, b64] = dataUrl.split(",");
  const tipo = /:(.*?);/.exec(cab)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], nome, { type: tipo });
}

export default function ComerciosGrandes() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [estado, setEstado] = useState<Estado>("parado");
  const [quadros, setQuadros] = useState({ feitos: 0, total: 0 });
  const [lotes, setLotes] = useState({ feitos: 0, total: 0 });
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [erro, setErro] = useState("");

  const passos: { id: Estado; rotulo: () => string }[] = [
    { id: "importando", rotulo: () => "Importando o arquivo" },
    {
      id: "extraindo",
      rotulo: () => `Extraindo quadros${quadros.total ? ` (${quadros.feitos}/${quadros.total})` : "…"}`,
    },
    {
      id: "processando",
      rotulo: () =>
        `Lendo os produtos${lotes.total ? ` (${lotes.feitos}/${lotes.total})` : "…"}`,
    },
    { id: "revisao", rotulo: () => `Pronto — ${produtos.length} produto(s)` },
  ];
  const ordem: Estado[] = ["importando", "extraindo", "processando", "revisao"];
  function statusPasso(id: Estado): "feito" | "agora" | "espera" {
    if (estado === "parado") return "espera";
    const iAtual = ordem.indexOf(estado === "salvando" ? "revisao" : estado);
    const iPasso = ordem.indexOf(id);
    if (iPasso < iAtual) return "feito";
    if (iPasso === iAtual) return "agora";
    return "espera";
  }

  function mesclar(novos: {
    nome: string;
    preco: number | null;
    foto: string;
    jaCadastrado: { id: number; nome: string } | null;
  }[]) {
    setProdutos((atuais) => {
      const mapa = new Map(atuais.map((p) => [p.chave, p]));
      for (const n of novos) {
        const k = chaveNome(n.nome);
        if (!k) continue;
        const existe = mapa.get(k);
        if (existe) {
          if (moedaParaNumero(existe.preco) <= 0 && n.preco) {
            mapa.set(k, { ...existe, preco: paraMoeda(n.preco), foto: existe.foto || n.foto });
          }
          continue;
        }
        mapa.set(k, {
          chave: k,
          nome: n.nome,
          preco: n.preco ? paraMoeda(n.preco) : "",
          precoCompra: "",
          foto: n.foto,
          jaCadastrado: n.jaCadastrado,
          incluir: !n.jaCadastrado && Boolean(n.preco),
        });
      }
      return [...mapa.values()];
    });
  }

  async function importar(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro("");
    setProdutos([]);
    setQuadros({ feitos: 0, total: 0 });
    setLotes({ feitos: 0, total: 0 });
    setEstado("importando");
    try {
      setEstado("extraindo");
      const qs: QuadroVideo[] = await extrairQuadros(arquivo, {
        intervalo: 2,
        max: 70,
        aoAvancar: (feitos, total) => setQuadros({ feitos, total }),
      });
      if (qs.length === 0) throw new Error("Não consegui pegar nenhum quadro do vídeo.");

      setEstado("processando");
      const totalLotes = Math.ceil(qs.length / LOTE);
      setLotes({ feitos: 0, total: totalLotes });

      for (let b = 0; b < totalLotes; b++) {
        const inicio = b * LOTE;
        const doLote = qs.slice(inicio, inicio + LOTE);
        const fd = new FormData();
        doLote.forEach((q, i) => fd.append("fotos", dataUrlParaFile(q.dataUrl, `q${inicio + i}.jpg`)));
        try {
          const r = await fetch("/api/produtos/comercios-grandes", { method: "POST", body: fd });
          const d = await r.json();
          if (r.ok && Array.isArray(d.itens)) {
            mesclar(
              d.itens.map((it: { nome: string; preco: number | null; quadro: number; jaCadastrado: null | { id: number; nome: string } }) => ({
                nome: it.nome,
                preco: it.preco,
                foto: doLote[Math.min(it.quadro ?? 0, doLote.length - 1)]?.dataUrl ?? "",
                jaCadastrado: it.jaCadastrado,
              }))
            );
          }
        } catch {
          /* um lote que falha não derruba os outros */
        }
        setLotes({ feitos: b + 1, total: totalLotes });
      }

      setEstado("revisao");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível processar o vídeo.");
      setEstado("parado");
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function set(chave: string, patch: Partial<Produto>) {
    setProdutos((ps) => ps.map((p) => (p.chave === chave ? { ...p, ...patch } : p)));
  }

  async function salvar() {
    const marcados = produtos.filter((p) => p.incluir && moedaParaNumero(p.preco) > 0);
    if (marcados.length === 0) {
      setErro("Marque ao menos um produto com preço pra salvar.");
      return;
    }
    setEstado("salvando");
    setErro("");
    try {
      const itens = await Promise.all(
        marcados.map(async (p) => ({
          nome: p.nome.trim(),
          preco: moedaParaNumero(p.preco),
          precoCompra: p.precoCompra.trim() ? moedaParaNumero(p.precoCompra) : undefined,
          foto: p.foto ? await comprimirParaDataURL(dataUrlParaFile(p.foto, "f.jpg")) : undefined,
        }))
      );
      const r = await fetch("/api/produtos/comercios-grandes/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — "));
      try {
        sessionStorage.setItem(FLASH, `${d.criados} produto(s) incluídos pelo vídeo.`);
      } catch {
        /* sem sessionStorage */
      }
      router.push("/produtos");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
      setEstado("revisao");
    }
  }

  const emProcesso = (["importando", "extraindo", "processando", "salvando"] as Estado[]).includes(
    estado
  );

  return (
    <main className="tela">
      <header className="marca">
        Comércios grandes <span>•</span> catálogo por vídeo
      </header>

      {estado === "parado" && (
        <section className="cartao">
          <p className="dica">
            Grave um vídeo passando pelas prateleiras de um supermercado, com as etiquetas de preço à
            mostra. O sistema lê os produtos e os preços das etiquetas (não precisa narrar nada) e
            monta uma lista pra você revisar e incluir no catálogo.
          </p>
          <div className="acoes">
            <button type="button" className="botao primario" onClick={() => inputRef.current?.click()}>
              🎥 Escolher vídeo
            </button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => importar(e.target.files?.[0])}
          />
        </section>
      )}

      {emProcesso && (
        <section className="cartao">
          <ol className="passos">
            {passos.map((p) => {
              const s = statusPasso(p.id);
              return (
                <li key={p.id} className="passo" data-status={s}>
                  <span className="passo-marca" aria-hidden="true">
                    {s === "feito" ? "✓" : s === "agora" ? "●" : "○"}
                  </span>
                  {p.rotulo()}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {erro && <p className="dica" data-erro="true">{erro}</p>}

      {produtos.length > 0 && (
        <>
          <p className="contagem">
            {produtos.length} produto(s) · {produtos.filter((p) => p.incluir).length} marcados
          </p>
          <ul className="lista lista-forn-produtos">
            {produtos.map((p) => (
              <li className="forn-produto" key={p.chave}>
                <div className="forn-produto-foto">
                  {p.foto ? <FotoAmpliavel src={p.foto} alt={p.nome} /> : <span aria-hidden="true">📦</span>}
                </div>
                <div className="forn-produto-info">
                  <div className="forn-produto-topo">
                    <label className="check-whatsapp">
                      <input
                        type="checkbox"
                        checked={p.incluir}
                        onChange={(e) => set(p.chave, { incluir: e.target.checked })}
                        disabled={estado === "salvando"}
                      />
                      incluir
                    </label>
                    {p.jaCadastrado && (
                      <span className="selo" data-situacao="aprovada">
                        já no catálogo
                      </span>
                    )}
                  </div>
                  <input
                    className="filtro-bairro"
                    value={p.nome}
                    onChange={(e) => set(p.chave, { nome: e.target.value })}
                    disabled={estado === "salvando"}
                  />
                  <div className="forn-preco-bloco">
                    <label>
                      Venda (etiqueta)
                      <span className="entrada" data-moeda="true">
                        <span className="prefixo">R$</span>
                        <input
                          inputMode="decimal"
                          value={p.preco}
                          onChange={(e) => set(p.chave, { preco: mascararMoeda(e.target.value) })}
                          disabled={estado === "salvando"}
                        />
                      </span>
                    </label>
                    <label>
                      Compra (opcional)
                      <span className="entrada" data-moeda="true">
                        <span className="prefixo">R$</span>
                        <input
                          inputMode="decimal"
                          value={p.precoCompra}
                          onChange={(e) => set(p.chave, { precoCompra: mascararMoeda(e.target.value) })}
                          disabled={estado === "salvando"}
                        />
                      </span>
                    </label>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {(estado === "revisao" || estado === "salvando") && produtos.length > 0 && (
        <section className="cartao pedido-fechamento">
          <div className="acoes">
            <button
              className="botao primario grande"
              onClick={salvar}
              disabled={estado === "salvando"}
            >
              {estado === "salvando"
                ? "Salvando…"
                : `Salvar ${produtos.filter((p) => p.incluir).length} no catálogo`}
            </button>
            {estado === "revisao" && (
              <button
                type="button"
                className="botao neutro"
                onClick={() => {
                  setEstado("parado");
                  setProdutos([]);
                }}
              >
                Recomeçar
              </button>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
