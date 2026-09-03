"use client";

import { useMemo, useRef, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import { useVoz } from "@/lib/useVoz";
import { extrairQuadros, type QuadroVideo } from "@/lib/quadrosDeVideo";
import { paraMoeda } from "@/lib/moeda";

type Estado = "parado" | "extraindo" | "lendo" | "analisando" | "resultado";

type Fonte = "video" | "pdf";

type Bruto = { nome: string; preco: number | null };

type Resultado = {
  nome: string;
  preco: number;
  produtoId: number | null;
  meuNome: string | null;
  meuPreco: number | null;
  precoAnterior: number | null;
  dataAnterior: string | null;
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

export default function ComerciosGrandes() {
  const inputVideo = useRef<HTMLInputElement>(null);
  const inputEncarte = useRef<HTMLInputElement>(null);

  const [estabelecimento, setEstabelecimento] = useState("");
  const [estado, setEstado] = useState<Estado>("parado");
  const [fonte, setFonte] = useState<Fonte>("video");
  const [quadros, setQuadros] = useState({ feitos: 0, total: 0 });
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
    if (fonte === "video") {
      return [
        { id: "extraindo" as Estado, rotulo: `Extraindo quadros${quadros.total ? ` (${quadros.feitos}/${quadros.total})` : "…"}` },
        { id: "lendo" as Estado, rotulo: `Lendo os preços${lotes.total ? ` (lote ${lotes.feitos}/${lotes.total})` : "…"}` },
        { id: "analisando" as Estado, rotulo: "Comparando com os seus preços" },
      ];
    }
    return [
      { id: "lendo" as Estado, rotulo: "Lendo o encarte" },
      { id: "analisando" as Estado, rotulo: "Comparando com os seus preços" },
    ];
  }, [fonte, quadros, lotes]);

  const ordem: Estado[] = ["extraindo", "lendo", "analisando", "resultado"];
  function statusPasso(id: Estado): "feito" | "agora" | "espera" {
    if (!emProcesso && estado !== "resultado") return "espera";
    const iAtual = ordem.indexOf(estado);
    const iPasso = ordem.indexOf(id);
    if (iPasso < iAtual) return "feito";
    if (iPasso === iAtual) return "agora";
    return "espera";
  }

  async function analisar(brutos: Bruto[], daFonte: Fonte) {
    setEstado("analisando");
    const r = await fetch("/api/produtos/comercios-grandes/analisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estabelecimento: estabelecimento.trim(), fonte: daFonte, itens: brutos }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d?.erro ?? "Não foi possível analisar.");
    setAnalise(d as Analise);
    setEstado("resultado");
  }

  async function usarVideo(arquivo: File | undefined) {
    if (!arquivo || !nomeOk) return;
    setErro("");
    setAnalise(null);
    setFonte("video");
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
      for (let b = 0; b < totalLotes; b++) {
        const doLote = qs.slice(b * LOTE, b * LOTE + LOTE);
        const fd = new FormData();
        fd.append("fonte", "video");
        doLote.forEach((q, i) => fd.append("fotos", dataUrlParaFile(q.dataUrl, `q${b}_${i}.jpg`)));
        try {
          const res = await fetch("/api/produtos/comercios-grandes", { method: "POST", body: fd });
          const d = await res.json();
          if (res.ok && Array.isArray(d.itens)) brutos.push(...d.itens);
        } catch {
          /* um lote que falha não derruba os outros */
        }
        setLotes({ feitos: b + 1, total: totalLotes });
      }

      await analisar(brutos, "video");
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
    const ehPdf = arquivos.some((f) => f.type === "application/pdf");
    setErro("");
    setAnalise(null);
    setFonte("pdf");
    setEstado("lendo");
    try {
      const fd = new FormData();
      if (ehPdf) {
        fd.append("pdf", arquivos.find((f) => f.type === "application/pdf")!);
      } else {
        fd.append("fonte", "foto");
        arquivos.slice(0, 8).forEach((f) => fd.append("fotos", f));
      }
      const res = await fetch("/api/produtos/comercios-grandes", { method: "POST", body: fd });
      const d = await res.json();
      if (!res.ok) throw new Error(d?.erro ?? "Não foi possível ler o encarte.");
      await analisar(Array.isArray(d.itens) ? d.itens : [], "pdf");
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
            preços, compara com os seus e guarda a data pra mostrar depois se subiu ou baixou.
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
                  <div className="cg-item-topo">
                    <strong>{r.nome}</strong>
                    <span className="cg-preco">R$ {paraMoeda(r.preco)}</span>
                  </div>

                  {r.meuPreco !== null ? (
                    <div className="cg-comparado" data-sinal={sinal}>
                      Você vende a R$ {paraMoeda(r.meuPreco)}
                      {r.meuNome ? ` (${r.meuNome})` : ""} —{" "}
                      {dif! < 0
                        ? `R$ ${paraMoeda(Math.abs(dif!))} mais barato lá`
                        : dif! > 0
                          ? `R$ ${paraMoeda(dif!)} mais caro lá`
                          : "mesmo preço"}
                    </div>
                  ) : (
                    <div className="cg-comparado" data-sinal="sem">
                      Você não tem esse produto no catálogo
                    </div>
                  )}

                  {r.precoAnterior !== null && (
                    <div className="cg-tendencia" data-dir={dir}>
                      {dir === "subiu" ? "↑ subiu" : dir === "baixou" ? "↓ baixou" : "→ estável"} desde{" "}
                      {dataBR(r.dataAnterior)} (era R$ {paraMoeda(r.precoAnterior)})
                    </div>
                  )}
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
