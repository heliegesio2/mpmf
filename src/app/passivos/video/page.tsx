"use client";

import { useState } from "react";
import Link from "next/link";
import GravadorVideo, { type Quadro } from "@/components/GravadorVideo";
import RevisaoPassivos from "@/components/RevisaoPassivos";
import { analisarImagens, type LinhaPassivo } from "@/lib/passivoCliente";

const MAX_SEGUNDOS = 90;
const MAX_QUADROS_ENVIADOS = 10;

/** Escolhe até `max` quadros espalhados uniformemente pela gravação. */
function amostrarQuadros(quadros: Quadro[], max: number): Quadro[] {
  if (quadros.length <= max) return quadros;
  const passo = quadros.length / max;
  return Array.from({ length: max }, (_, i) => quadros[Math.floor(i * passo)]);
}

export default function PassivosPorVideo() {
  const [linhas, setLinhas] = useState<LinhaPassivo[] | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [erro, setErro] = useState("");

  async function processar({ quadros }: { quadros: Quadro[] }) {
    setAnalisando(true);
    setErro("");
    setLinhas(null);
    try {
      if (quadros.length === 0) throw new Error("Não consegui pegar imagens do vídeo. Tente gravar de novo.");
      const amostra = amostrarQuadros(quadros, MAX_QUADROS_ENVIADOS).map((q) => q.dataUrl);
      setLinhas(await analisarImagens(amostra));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível analisar o vídeo.");
    } finally {
      setAnalisando(false);
    }
  }

  return (
    <main className="tela">
      <header className="marca">
        Passivo por vídeo <span>•</span> levantamento
      </header>

      <p className="dica">
        <Link href="/passivos">← Voltar para o passivo</Link>
      </p>

      <section className="cartao">
        <p className="dica">
          Grave um vídeo percorrendo a loja, mostrando devagar os móveis e equipamentos — banca, cofre,
          congelador, balcão… Até {MAX_SEGUNDOS} segundos. O sistema reconhece cada bem e você confere antes de
          salvar. Precisa de internet.
        </p>

        <GravadorVideo
          maxSegundos={MAX_SEGUNDOS}
          aoGravar={processar}
          aoErro={(m) => setErro(m)}
          ocupado={analisando}
        />

        {analisando && <p className="dica">Identificando os passivos do vídeo…</p>}
        {erro && (
          <p className="dica" data-erro="true" role="status">
            {erro}
          </p>
        )}
      </section>

      {linhas && <RevisaoPassivos linhas={linhas} setLinhas={(f) => setLinhas((l) => f(l ?? []))} origem="video" />}
    </main>
  );
}
