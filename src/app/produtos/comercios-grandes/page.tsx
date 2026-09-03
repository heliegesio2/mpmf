"use client";

import { useMemo, useRef, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import { useVoz } from "@/lib/useVoz";
import { extrairQuadros, type QuadroVideo } from "@/lib/quadrosDeVideo";
import { pdfParaImagens } from "@/lib/pdfParaImagens";
import { recortarMiniatura } from "@/lib/recorteMiniatura";
import { normalizarNomeProduto } from "@/lib/textoProduto";
import { comprimirImagem } from "@/lib/imagemCliente";
import { paraMoeda } from "@/lib/moeda";
import FotoAmpliavel from "@/components/FotoAmpliavel";

type Estado =
  | "parado"
  | "rasterizando"
  | "extraindo"
  | "lendo"
  | "analisando"
  | "resultado";

type FonteReal = "video" | "foto" | "pdf";

type Bruto = { nome: string; preco: number | null };

type Confianca = "alta" | "provavel" | null;

type Resultado = {
  nome: string;
  preco: number;
  produtoId: number | null;
  meuNome: string | null;
  meuPreco: number | null;
  confianca: Confianca;
  precoAnterior: number | null;
  dataAnterior: string | null;
  foto?: string;
};

type Analise = {
  estabelecimento: string;
  registradoEm: string;
  resumo: { total: number; comPreco: number };
  itens: Resultado[];
};

const LOTE = 4;

function dataBR(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function dataUrlParaFile(dataUrl: string, nome: string): File {
  const [cab, b64] = dataUrl.split(",");
  const tipo = /:(.*?);/.exec(cab)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], nome, { type: tipo });
}

function fileParaDataUrl(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(new Error("arquivo"));
    r.readAsDataURL(f);
  });
}

export default function ComerciosGrandes() {
  const inputVideo = useRef<HTMLInputElement>(null);
  const inputEncarte = useRef<HTMLInputElement>(null);

  const [estabelecimento, setEstabelecimento] = useState("");
  const [estado, setEstado] = useState<Estado>("parado");
  const [fonteExibida, setFonteExibida] = useState<"video" | "encarte">("video");
  const [quadros, setQuadros] = useState({ feitos: 0, total: 0 });
  const [paginas, setPaginas] = useState({ feitas: 0, total: 0 });
  const [lotes, setLotes] = useState({ feitos: 0, total: 0 });
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [erro, setErro] = useState("");

  const { ouvir, parar, ouvindoCampo, disponivel } = useVoz({
    aoFinalizar: (texto) => setEstabelecimento((e) => (e ? `${e} ${texto}` : texto).trim()),
    aoErrar: (m) => setErro(m),
  });

  const nomeOk = estabelecimento.trim().length >= 2;
  const emProcesso = estado !== "parado" && estado !== "resultado";

  const passos = useMemo(() => {
    if (fonteExibida === "video") {
      return [
        {
          id: "extraindo" as Estado,
          rotulo: `Extraindo quadros${quadros.total ? ` (${quadros.feitos}/${quadros.total})` : "…"}`,
        },
        {
          id: "lendo" as Estado,
          rotulo: `Lendo os preços${lotes.total ? ` (lote ${lotes.feitos}/${lotes.total})` : "…"}`,
        },
        { id: "analisando" as Estado, rotulo: "Comparando com os seus preços" },
      ];
    }
    return [
      {
        id: "rasterizando" as Estado,
        rotulo: `Preparando as páginas${paginas.total ? ` (${paginas.feitas}/${paginas.total})` : "…"}`,
      },
      { id: "lendo" as Estado, rotulo: "Lendo o encarte" },
      { id: "analisando" as Estado, rotulo: "Comparando com os seus preços" },
    ];
  }, [fonteExibida, quadros, lotes, paginas]);

  const ordem: Estado[] = ["rasterizando", "extraindo", "lendo", "analisando", "resultado"];
  function statusPasso(id: Estado): "feito" | "agora" | "espera" {
    const iAtual = ordem.indexOf(estado);
    const iPasso = ordem.indexOf(id);
    if (iAtual < 0) return "espera";
    if (iPasso < iAtual) return "feito";
    if (iPasso === iAtual) return "agora";
    return "espera";
  }

  async function analisar(brutos: Bruto[], fonte: FonteReal, fotos: Map<string, string>) {
    setEstado("analisando");
    const r = await fetch("/api/produtos/comercios-grandes/analisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estabelecimento: estabelecimento.trim(), fonte, itens: brutos }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.erro ?? "Não foi possível analisar.");
    const itens: Resultado[] = (d.itens ?? []).map((it: Resultado) => ({
      ...it,
      foto: fotos.get(normalizarNomeProduto(it.nome)) || undefined,
    }));
    setAnalise({ ...(d as Analise), itens });
    setEstado("resultado");
  }

  async function usarVideo(arquivo: File | undefined) {
    if (!arquivo || !nomeOk) return;
    setErro("");
    setAnalise(null);
    setFonteExibida("video");
    setQuadros({ feitos: 0, total: 0 });
    setLotes({ feitos: 0, total: 0 });
    setEstado("extraindo");
    try {
      const qs: QuadroVideo[] = await extrairQuadros(arquivo, {
        intervalo: 2,
        max: 70,
        aoAvancar: (feitos, total) => setQuadros({ feitos, total }),
      });
      if (qs.length === 0) throw new Error("Não consegui pegar nenhum quadro do vídeo.");

      setEstado("lendo");
      const totalLotes = Math.ceil(qs.length / LOTE);
      setLotes({ feitos: 0, total: totalLotes });
      const brutos: Bruto[] = [];
      const fotos = new Map<string, string>();
      for (let b = 0; b < totalLotes; b++) {
        const inicio = b * LOTE;
        const doLote = qs.slice(inicio, inicio + LOTE);
        const fd = new FormData();
        fd.append("fonte", "video");
        doLote.forEach((q, i) => fd.append("fotos", dataUrlParaFile(q.dataUrl, `q${b}_${i}.jpg`)));
        try {
          const res = await fetch("/api/produtos/comercios-grandes", { method: "POST", body: fd });
          const d = await res.json();
          if (res.ok && Array.isArray(d.itens)) {
            for (const it of d.itens as { nome: string; preco: number | null; quadro: number }[]) {
              brutos.push({ nome: it.nome, preco: it.preco });
              const frame = doLote[Math.min(it.quadro ?? 0, doLote.length - 1)]?.dataUrl;
              const chave = normalizarNomeProduto(it.nome);
              if (frame && !fotos.has(chave)) {
                fotos.set(chave, await recortarMiniatura(frame, null));
              }
            }
          }
        } catch {
          /* um lote que falha não derruba os outros */
        }
        setLotes({ feitos: b + 1, total: totalLotes });
      }

      await analisar(brutos, "video", fotos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível processar o vídeo.");
      setEstado("parado");
    } finally {
      if (inputVideo.current) inputVideo.current.value = "";
    }
  }

  async function usarEncarte(lista: FileList | null) {
    const arquivos = lista ? Array.from(lista) : [];
    if (arquivos.length === 0 || !nomeOk) return;
    setErro("");
    setAnalise(null);
    setFonteExibida("encarte");
    setPaginas({ feitas: 0, total: 0 });

    const pdf = arquivos.find((f) => f.type === "application/pdf");
    const fonte: FonteReal = pdf ? "pdf" : "foto";
    try {
      let imagens: string[];
      if (pdf) {
        setEstado("rasterizando");
        imagens = await pdfParaImagens(pdf, {
          maxPaginas: 8,
          aoAvancar: (feitas, total) => setPaginas({ feitas, total }),
        });
      } else {
        setEstado("rasterizando");
        const fotos = arquivos.filter((f) => f.type.startsWith("image/")).slice(0, 10);
        setPaginas({ feitas: 0, total: fotos.length });
        imagens = [];
        for (const f of fotos) {
          imagens.push(await fileParaDataUrl(await comprimirImagem(f)));
          setPaginas({ feitas: imagens.length, total: fotos.length });
        }
      }
      if (imagens.length === 0) throw new Error("Não consegui abrir esse arquivo.");

      setEstado("lendo");
      const fd = new FormData();
      fd.append("fonte", "encarte");
      imagens.forEach((d, i) => fd.append("fotos", dataUrlParaFile(d, `p${i}.jpg`)));
      const res = await fetch("/api/produtos/comercios-grandes", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.erro ?? "Não foi possível ler o encarte.");

      const lidos = (d.itens ?? []) as {
        nome: string;
        preco: number | null;
        imagem: number;
        caixa: { x0: number; y0: number; x1: number; y1: number } | null;
      }[];
      const brutos: Bruto[] = [];
      const fotos = new Map<string, string>();
      for (const it of lidos) {
        brutos.push({ nome: it.nome, preco: it.preco });
        const chave = normalizarNomeProduto(it.nome);
        const fonteImg = imagens[Math.min(it.imagem ?? 0, imagens.length - 1)] ?? imagens[0];
        if (fonteImg && !fotos.has(chave)) {
          fotos.set(chave, await recortarMiniatura(fonteImg, it.caixa));
        }
      }

      await analisar(brutos, fonte, fotos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível ler o encarte.");
      setEstado("parado");
    } finally {
      if (inputEncarte.current) inputEncarte.current.value = "";
    }
  }

  function recomecar() {
    setAnalise(null);
    setErro("");
    setEstado("parado");
  }

  return (
    <main className="tela">
      <header className="marca">
        Comércios grandes <span>•</span> preços dos concorrentes
      </header>

      {estado === "parado" && (
        <section className="cartao">
          <p className="dica">
            Descubra por quanto um concorrente está vendendo. Grave um vídeo passando pelas
            prateleiras <strong>ou</strong> envie o encarte de ofertas (PDF ou foto). O sistema lê os
            preços, recorta a foto de cada produto, compara com os seus e guarda a data pra mostrar
            depois se subiu ou baixou.
          </p>

          <CampoVoz
            rotulo="Nome do estabelecimento (obrigatório)"
            campo="estabelecimento"
            valor={estabelecimento}
            aoMudar={setEstabelecimento}
            placeholder="Ex.: Supermercado G7, Atacadão…"
            ouvindo={ouvindoCampo === "estabelecimento"}
            temVoz={disponivel}
            aoOuvir={ouvir}
            aoParar={parar}
            largo
          />

          <div className="acoes" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="botao primario"
              disabled={!nomeOk}
              onClick={() => inputVideo.current?.click()}
            >
              🎥 Escolher vídeo
            </button>
            <button
              type="button"
              className="botao neutro"
              disabled={!nomeOk}
              onClick={() => inputEncarte.current?.click()}
            >
              📄 Encarte (PDF ou foto)
            </button>
          </div>
          {!nomeOk && <p className="dica">Preencha o nome do estabelecimento pra continuar.</p>}

          <input
            ref={inputVideo}
            type="file"
            accept="video/*"
            hidden
            onChange={(e) => usarVideo(e.target.files?.[0])}
          />
          <input
            ref={inputEncarte}
            type="file"
            accept="application/pdf,image/*"
            multiple
            hidden
            onChange={(e) => usarEncarte(e.target.files)}
          />
        </section>
      )}

      {emProcesso && (
        <section className="cartao">
          <p className="dica">
            Concorrente: <strong>{estabelecimento.trim()}</strong>
          </p>
          <ol className="passos">
            {passos.map((p) => {
              const s = statusPasso(p.id);
              return (
                <li key={p.id} className="passo" data-status={s}>
                  <span className="passo-marca" aria-hidden="true">
                    {s === "feito" ? "✓" : s === "agora" ? "●" : "○"}
                  </span>
                  {p.rotulo}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {erro && (
        <p className="dica" data-erro="true">
          {erro}
        </p>
      )}

      {estado === "resultado" && analise && (
        <>
          <section className="cartao">
            <h2 className="titulo-cartao">{analise.estabelecimento}</h2>
            <p className="dica">
              <strong>{analise.resumo.total}</strong> produto(s) encontrado(s) ·{" "}
              <strong>{analise.resumo.comPreco}</strong> com preço · registrado em{" "}
              {dataBR(analise.registradoEm)}
            </p>
            {analise.resumo.comPreco === 0 && (
              <p className="dica" data-erro="true">
                Nenhum preço legível dessa vez. Tente um vídeo mais perto das etiquetas ou um encarte
                mais nítido.
              </p>
            )}
          </section>

          <ul className="lista cg-lista">
            {analise.itens.map((r, i) => {
              const dif = r.meuPreco !== null ? Math.round((r.preco - r.meuPreco) * 100) / 100 : null;
              const sinal = dif === null ? "" : dif < 0 ? "barato" : dif > 0 ? "caro" : "igual";
              const dir =
                r.precoAnterior === null
                  ? ""
                  : r.preco > r.precoAnterior
                    ? "subiu"
                    : r.preco < r.precoAnterior
                      ? "baixou"
                      : "estavel";
              return (
                <li className="cg-item" key={i}>
                  <div className="cg-item-linha">
                    {r.foto ? (
                      <FotoAmpliavel src={r.foto} alt={r.nome} className="cg-mini" />
                    ) : (
                      <span className="cg-mini cg-mini-vazia" aria-hidden="true">
                        🏷️
                      </span>
                    )}
                    <div className="cg-item-corpo">
                      <div className="cg-item-topo">
                        <strong>{r.nome}</strong>
                        <span className="cg-preco">R$ {paraMoeda(r.preco)}</span>
                      </div>

                      {r.meuPreco !== null ? (
                        <div className="cg-comparado" data-sinal={sinal}>
                          {r.confianca === "provavel" && "Parece ser "}
                          {r.confianca === "provavel" ? (
                            <em>{r.meuNome}</em>
                          ) : (
                            <>Você vende {r.meuNome ? <em>{r.meuNome}</em> : "esse item"}</>
                          )}{" "}
                          a R$ {paraMoeda(r.meuPreco)} —{" "}
                          {dif! < 0
                            ? `R$ ${paraMoeda(Math.abs(dif!))} mais barato lá`
                            : dif! > 0
                              ? `R$ ${paraMoeda(dif!)} mais caro lá`
                              : "mesmo preço"}
                          {r.confianca === "provavel" && " (confira)"}
                        </div>
                      ) : (
                        <div className="cg-comparado" data-sinal="sem">
                          Você não tem esse produto no catálogo
                        </div>
                      )}

                      {r.precoAnterior !== null && (
                        <div className="cg-tendencia" data-dir={dir}>
                          {dir === "subiu" ? "↑ subiu" : dir === "baixou" ? "↓ baixou" : "→ estável"}{" "}
                          desde {dataBR(r.dataAnterior)} (era R$ {paraMoeda(r.precoAnterior)})
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="acoes">
            <button type="button" className="botao neutro" onClick={recomecar}>
              Nova análise
            </button>
          </div>
        </>
      )}
    </main>
  );
}
