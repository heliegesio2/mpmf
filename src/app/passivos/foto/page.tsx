"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import RevisaoPassivos from "@/components/RevisaoPassivos";
import { comprimirParaDataURL } from "@/lib/imagemCliente";
import { analisarImagens, type LinhaPassivo } from "@/lib/passivoCliente";

const MAX_FOTOS = 8;

export default function PassivosPorFoto() {
  const input = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [linhas, setLinhas] = useState<LinhaPassivo[] | null>(null);
  const [lendo, setLendo] = useState(false);
  const [analisando, setAnalisando] = useState(false);
  const [erro, setErro] = useState("");

  async function adicionar(arquivos: FileList | null) {
    if (!arquivos || arquivos.length === 0) return;
    setLendo(true);
    setErro("");
    try {
      const novas: string[] = [];
      for (const f of Array.from(arquivos).slice(0, MAX_FOTOS - fotos.length)) {
        novas.push(await comprimirParaDataURL(f, { maxLado: 1280, qualidade: 0.8 }));
      }
      setFotos((x) => [...x, ...novas].slice(0, MAX_FOTOS));
      setLinhas(null);
    } catch {
      setErro("Não consegui usar uma das fotos. Tente outra.");
    } finally {
      setLendo(false);
      if (input.current) input.current.value = "";
    }
  }

  async function analisar() {
    setAnalisando(true);
    setErro("");
    try {
      setLinhas(await analisarImagens(fotos));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível analisar.");
    } finally {
      setAnalisando(false);
    }
  }

  return (
    <main className="tela">
      <header className="marca">
        Passivo por foto <span>•</span> levantamento
      </header>

      <p className="dica">
        <Link href="/passivos">← Voltar para o passivo</Link>
      </p>

      <section className="cartao">
        <p className="dica">
          Fotografe os móveis e equipamentos da loja — banca, cofre, congelador, balcão, prateleiras… Até{" "}
          {MAX_FOTOS} fotos; o sistema reconhece cada bem e você confere antes de salvar.
        </p>

        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => adicionar(e.target.files)}
        />

        {fotos.length > 0 && (
          <div className="passivo-fotos">
            {fotos.map((f, i) => (
              <div key={i} className="passivo-foto-item">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f} alt={`Foto ${i + 1}`} />
                <button
                  type="button"
                  className="botao mini perigo"
                  onClick={() => {
                    setFotos((x) => x.filter((_, k) => k !== i));
                    setLinhas(null);
                  }}
                  aria-label={`Remover foto ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="acoes">
          <button
            type="button"
            className="botao neutro"
            onClick={() => input.current?.click()}
            disabled={lendo || analisando || fotos.length >= MAX_FOTOS}
          >
            {lendo ? "Preparando…" : fotos.length === 0 ? "📷 Tirar ou escolher fotos" : "📷 Adicionar mais fotos"}
          </button>
          <button
            type="button"
            className="botao primario"
            onClick={analisar}
            disabled={fotos.length === 0 || analisando || lendo}
          >
            {analisando ? "Identificando…" : "Identificar passivos"}
          </button>
        </div>

        {erro && (
          <p className="dica" data-erro="true" role="status">
            {erro}
          </p>
        )}
      </section>

      {linhas && <RevisaoPassivos linhas={linhas} setLinhas={(f) => setLinhas((l) => f(l ?? []))} origem="foto" />}
    </main>
  );
}
