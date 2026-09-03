"use client";

import { useRef, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import CampoFoto from "@/components/CampoFoto";
import { useVoz } from "@/lib/useVoz";
import { TIPOS_VENDA, EMBALAGENS } from "@/lib/tipos";
import { numeroFalado } from "@/lib/voz";
import { mascararMoeda, moedaParaNumero, paraMoeda } from "@/lib/moeda";
import { extrairAudioWav, MAX_SEGUNDOS } from "@/lib/audioCliente";
import { capturarQuadros } from "@/lib/videoCliente";

type ItemProposto = {
  nomeDetectado: string;
  precoDetectado: number;
  generico: boolean;
  segundos: number;
  produto: { id: number; nome: string; precoAtual: number; tipoVenda: string; score: number } | null;
};

type Linha = {
  incluir: boolean;
  preco: string; // novo preço (existente) OU preço do produto novo
  nome: string; // produto novo
  tipoVenda: string;
  unidade: string;
  foto: string; // quadro do vídeo (data URL) — "" = sem foto
};

function linhaInicial(item: ItemProposto, foto: string): Linha {
  return {
    incluir: true,
    preco: paraMoeda(item.precoDetectado),
    nome: item.produto?.nome ?? item.nomeDetectado,
    tipoVenda: item.produto?.tipoVenda ?? "unidade",
    unidade: "unidade",
    foto,
  };
}

export default function PrecoPorVideo() {
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [propostos, setPropostos] = useState<ItemProposto[]>([]);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [transcricao, setTranscricao] = useState("");
  const [processando, setProcessando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  function mudarLinha(i: number, campo: keyof Linha, valor: Linha[keyof Linha]) {
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const campo = campoAtual.current;
      if (!campo || !campo.startsWith("preco-")) return;
      const i = Number(campo.slice("preco-".length));
      const n = numeroFalado(texto);
      if (n === null) {
        setErro(true);
        setAviso(`Não entendi "${texto}" como valor.`);
        return;
      }
      mudarLinha(i, "preco", paraMoeda(n));
      setErro(false);
      setAviso("");
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  async function processar(arquivo: File) {
    setProcessando(true);
    setErro(false);
    setPropostos([]);
    setLinhas([]);
    setTranscricao("");
    try {
      setAviso("Extraindo o áudio do vídeo…");
      const { blob, cortado } = await extrairAudioWav(arquivo);

      setAviso("Transcrevendo a fala e lendo os produtos…");
      const corpo = new FormData();
      corpo.append("audio", blob, "audio.wav");
      const r = await fetch("/api/produtos/preco-video", { method: "POST", body: corpo });
      const dados = await r.json();
      if (!r.ok) {
        throw new Error([dados?.erro, dados?.detalhe].filter(Boolean).join(" — ") || "Não foi possível ler o vídeo.");
      }

      setTranscricao(dados.transcricao ?? "");
      const itens: ItemProposto[] = dados.itens ?? [];
      if (itens.length === 0) {
        setAviso("Não entendi nenhum produto com preço nessa fala. Fale mais devagar: nome, preço, nome, preço…");
        return;
      }

      // pega um quadro do vídeo por produto (~1 s depois de ele ser falado) pra virar a foto
      setAviso("Separando a foto de cada produto…");
      let fotos: (string | null)[] = itens.map(() => null);
      try {
        fotos = await capturarQuadros(
          arquivo,
          itens.map((i) => (i.segundos >= 0 ? i.segundos + 1 : -1))
        );
      } catch {
        /* sem foto — segue só com nome/preço */
      }

      setPropostos(itens);
      setLinhas(itens.map((it, idx) => linhaInicial(it, fotos[idx] ?? "")));

      const novos = itens.filter((i) => !i.produto).length;
      const genericos = itens.filter((i) => i.generico).length;
      const comFoto = fotos.filter(Boolean).length;
      setAviso(
        `${itens.length} produtos lidos` +
          (cortado ? ` (só os primeiros ${MAX_SEGUNDOS} s do vídeo)` : "") +
          (comFoto ? ` · ${comFoto} com foto do vídeo` : "") +
          (novos ? ` · ${novos} não estão no catálogo` : "") +
          (genericos ? ` · ${genericos} com nome deduzido (confira)` : "") +
          "."
      );
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível ler o vídeo.");
    } finally {
      setProcessando(false);
      if (inputArquivo.current) inputArquivo.current.value = "";
    }
  }

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const selecionados = linhas
        .map((l, i) => ({ l, item: propostos[i] }))
        .filter(({ l }) => l.incluir);

      for (const { l } of selecionados) {
        if (moedaParaNumero(l.preco) <= 0) {
          setErro(true);
          setAviso(`Informe um preço válido para "${l.nome}".`);
          return;
        }
      }

      const itens = selecionados.map(({ l, item }) =>
        item.produto
          ? {
              produtoId: item.produto.id,
              novoPreco: moedaParaNumero(l.preco),
              ...(l.foto ? { foto: l.foto } : {}),
            }
          : {
              nome: l.nome,
              preco: moedaParaNumero(l.preco),
              tipoVenda: l.tipoVenda,
              unidade: l.unidade,
              ...(l.foto ? { foto: l.foto } : {}),
            }
      );

      if (itens.length === 0) {
        setErro(true);
        setAviso("Marque pelo menos um item pra salvar.");
        return;
      }

      const r = await fetch("/api/produtos/preco-video/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");

      setAviso(`${itens.length} preços atualizados/produtos incluídos.`);
      setPropostos([]);
      setLinhas([]);
      setTranscricao("");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="tela">
      <header className="marca">Preço por vídeo</header>

      <section className="cartao">
        <h2 className="titulo-cartao">Vídeo com os preços</h2>
        <p className="ajuda-voz">
          Grave um vídeo curto (até {MAX_SEGUNDOS} s) falando, um por um: <strong>nome do produto</strong> e{" "}
          <strong>preço</strong> — “Batata Mix, 10 reais. Paçoquinha, 50 centavos…”. O sistema ouve a fala,
          casa com o catálogo e deixa você conferir antes de salvar. Precisa de internet.
        </p>

        <div className="acoes">
          <input
            ref={inputArquivo}
            type="file"
            accept="video/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) processar(f);
            }}
            disabled={processando}
          />
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {processando ? aviso || "Processando…" : aviso}
        </p>

        {transcricao && (
          <details className="transcricao-video">
            <summary>Ver a transcrição</summary>
            <p>{transcricao}</p>
          </details>
        )}
      </section>

      {linhas.map((linha, i) => {
        const item = propostos[i];
        return (
          <section className="cartao" key={i}>
            <h2 className="titulo-cartao">
              {item.produto ? item.produto.nome : linha.nome}
              <span className="sub">
                {" · "}
                falado: “{item.nomeDetectado}” por R$ {paraMoeda(item.precoDetectado)}
                {item.produto
                  ? ` · preço atual R$ ${paraMoeda(item.produto.precoAtual)}`
                  : " · não cadastrado"}
                {item.generico && " · nome deduzido"}
              </span>
            </h2>

            <div className="grade-form">
              <label className="rotulo largo">
                <input
                  type="checkbox"
                  checked={linha.incluir}
                  onChange={(e) => mudarLinha(i, "incluir", e.target.checked)}
                />{" "}
                {item.produto ? "Atualizar o preço deste produto" : "Incluir este produto novo"}
              </label>

              <div className="rotulo largo">
                <CampoFoto
                  rotulo="Foto (do vídeo — confira ou troque)"
                  preview={linha.foto}
                  aoEscolher={(d) => mudarLinha(i, "foto", d)}
                  aoRemover={linha.foto ? () => mudarLinha(i, "foto", "") : undefined}
                  aoErro={(m) => {
                    setErro(true);
                    setAviso(m);
                  }}
                />
              </div>

              {!item.produto && (
                <label className="rotulo largo">
                  Nome do produto
                  <input value={linha.nome} onChange={(e) => mudarLinha(i, "nome", e.target.value)} />
                </label>
              )}

              <CampoVoz
                rotulo={item.produto ? "Novo preço de venda" : "Preço de venda"}
                campo={`preco-${i}`}
                valor={linha.preco}
                aoMudar={(v) => mudarLinha(i, "preco", mascararMoeda(v))}
                placeholder="0,00"
                moeda
                ouvindo={ouvindoCampo === `preco-${i}`}
                temVoz={disponivel}
                aoOuvir={ouvir}
                aoParar={parar}
              />

              {!item.produto && (
                <>
                  <label className="rotulo">
                    Vendido por
                    <select
                      value={linha.tipoVenda}
                      onChange={(e) => mudarLinha(i, "tipoVenda", e.target.value)}
                    >
                      {TIPOS_VENDA.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="rotulo">
                    Embalagem
                    <select
                      value={linha.unidade}
                      onChange={(e) => mudarLinha(i, "unidade", e.target.value)}
                    >
                      {EMBALAGENS.map((emb) => (
                        <option key={emb.valor} value={emb.valor}>
                          {emb.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </section>
        );
      })}

      {linhas.length > 0 && (
        <div className="acoes">
          <button className="botao primario" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Confirmar e salvar"}
          </button>
        </div>
      )}
    </main>
  );
}
