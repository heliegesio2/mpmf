"use client";

import { useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import CampoFoto from "@/components/CampoFoto";
import GravadorVideo, { type Quadro } from "@/components/GravadorVideo";
import { useVoz } from "@/lib/useVoz";
import { TIPOS_VENDA, EMBALAGENS } from "@/lib/tipos";
import { numeroFalado } from "@/lib/voz";
import { mascararMoeda, moedaParaNumero, paraMoeda } from "@/lib/moeda";
import { extrairAudioWav, MAX_SEGUNDOS } from "@/lib/audioCliente";

type ItemProposto = {
  nomeDetectado: string;
  quantidadeDetectada: number | null;
  precoDetectado: number | null;
  generico: boolean;
  segundos: number;
  produto: {
    id: number;
    nome: string;
    estoqueAtual: number;
    precoAtual: number;
    tipoVenda: string;
    score: number;
  } | null;
};

type Linha = {
  incluir: boolean;
  // produto já cadastrado
  mudarEstoque: boolean;
  estoque: string;
  mudarPreco: boolean;
  preco: string;
  // produto novo
  nome: string;
  tipoVenda: string;
  unidade: string;
  foto: string;
};

/** Quadro mais perto do segundo em que o produto foi falado. */
function fotoDoItem(item: ItemProposto, quadros: Quadro[]): string {
  if (!quadros.length) return "";
  const alvo = item.segundos >= 0 ? item.segundos + 1 : 0;
  let melhor = quadros[0];
  for (const q of quadros) {
    if (Math.abs(q.t - alvo) < Math.abs(melhor.t - alvo)) melhor = q;
  }
  return melhor.dataUrl;
}

function linhaInicial(item: ItemProposto, foto: string): Linha {
  const temQtd = item.quantidadeDetectada !== null;
  const temPreco = item.precoDetectado !== null;
  return {
    incluir: true,
    mudarEstoque: temQtd,
    estoque: String(item.quantidadeDetectada ?? item.produto?.estoqueAtual ?? 0),
    mudarPreco: temPreco,
    preco: paraMoeda(item.precoDetectado ?? item.produto?.precoAtual ?? 0),
    nome: item.produto?.nome ?? item.nomeDetectado,
    tipoVenda: item.produto?.tipoVenda ?? "unidade",
    unidade: "unidade",
    foto,
  };
}

export default function EstoquePorVideo() {
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
      if (!campo) return;
      const n = numeroFalado(texto);
      if (n === null) {
        setErro(true);
        setAviso(`Não entendi "${texto}" como número.`);
        return;
      }
      if (campo.startsWith("preco-")) mudarLinha(Number(campo.slice(6)), "preco", paraMoeda(n));
      else if (campo.startsWith("estoque-")) mudarLinha(Number(campo.slice(8)), "estoque", String(n));
      setErro(false);
      setAviso("");
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  async function processar({ blob, quadros }: { blob: Blob; quadros: Quadro[] }) {
    setProcessando(true);
    setErro(false);
    setPropostos([]);
    setLinhas([]);
    setTranscricao("");
    try {
      setAviso("Tirando o áudio do vídeo…");
      const { blob: wav, cortado } = await extrairAudioWav(blob);

      setAviso("Transcrevendo a fala e lendo os produtos…");
      const corpo = new FormData();
      corpo.append("audio", wav, "audio.wav");
      const r = await fetch("/api/produtos/estoque-video", { method: "POST", body: corpo });
      const dados = await r.json();
      if (!r.ok) {
        throw new Error(
          [dados?.erro, dados?.detalhe].filter(Boolean).join(" — ") || "Não foi possível ler o vídeo."
        );
      }

      setTranscricao(dados.transcricao ?? "");
      const itens: ItemProposto[] = dados.itens ?? [];
      if (itens.length === 0) {
        setAviso(
          "Não entendi nenhum produto na fala. Fale pausado: nome, quantidade (e o preço, se quiser)."
        );
        return;
      }

      setPropostos(itens);
      setLinhas(itens.map((it) => linhaInicial(it, fotoDoItem(it, quadros))));

      const novos = itens.filter((i) => !i.produto).length;
      const genericos = itens.filter((i) => i.generico).length;
      const comPreco = itens.filter((i) => i.precoDetectado !== null).length;
      setAviso(
        `${itens.length} produtos lidos` +
          (cortado ? ` (só os primeiros ${MAX_SEGUNDOS} s)` : "") +
          (comPreco ? ` · ${comPreco} com preço falado` : "") +
          (novos ? ` · ${novos} não estão no catálogo` : "") +
          (genericos ? ` · ${genericos} com nome deduzido (confira)` : "") +
          "."
      );
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível ler o vídeo.");
    } finally {
      setProcessando(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const sel = linhas.map((l, i) => ({ l, item: propostos[i] })).filter(({ l }) => l.incluir);

      for (const { l, item } of sel) {
        if (!item.produto && moedaParaNumero(l.preco) <= 0) {
          setErro(true);
          setAviso(`Informe um preço para "${l.nome}".`);
          return;
        }
      }

      const itens = sel.map(({ l, item }) => {
        if (item.produto) {
          return {
            produtoId: item.produto.id,
            ...(l.mudarEstoque ? { novoEstoque: Number(l.estoque.replace(",", ".")) } : {}),
            ...(l.mudarPreco ? { novoPreco: moedaParaNumero(l.preco) } : {}),
            ...(l.foto ? { foto: l.foto } : {}),
          };
        }
        return {
          nome: l.nome,
          preco: moedaParaNumero(l.preco),
          estoque: Number(l.estoque.replace(",", ".")) || 0,
          tipoVenda: l.tipoVenda,
          unidade: l.unidade,
          ...(l.foto ? { foto: l.foto } : {}),
        };
      });

      if (itens.length === 0) {
        setErro(true);
        setAviso("Marque pelo menos um item.");
        return;
      }

      const r = await fetch("/api/produtos/estoque-video/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");

      setAviso(`${itens.length} produtos atualizados/incluídos.`);
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
      <header className="marca">Estoque por vídeo</header>

      <section className="cartao">
        <h2 className="titulo-cartao">Gravar a contagem</h2>
        <p className="ajuda-voz">
          Toque em <strong>Gravar vídeo</strong>, aponte a câmera pros produtos e vá falando, um por
          um: <strong>nome e quantidade</strong> — “Batata Mix, 12 pacotes”. Se falar o preço junto
          (“…, R$ 10”), o preço também é atualizado. Até {MAX_SEGUNDOS}s. Precisa de internet.
        </p>

        <GravadorVideo
          maxSegundos={MAX_SEGUNDOS}
          aoGravar={processar}
          aoErro={(m) => {
            setErro(true);
            setAviso(m);
          }}
          ocupado={processando || salvando}
        />

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
                falado: “{item.nomeDetectado}”
                {item.quantidadeDetectada !== null && ` · qtd ${item.quantidadeDetectada}`}
                {item.precoDetectado !== null && ` · R$ ${paraMoeda(item.precoDetectado)}`}
                {item.produto
                  ? ` · estoque atual ${item.produto.estoqueAtual}`
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
                {item.produto ? "Aplicar neste produto" : "Incluir este produto novo"}
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

              {item.produto ? (
                <>
                  <label className="rotulo">
                    <input
                      type="checkbox"
                      checked={linha.mudarEstoque}
                      onChange={(e) => mudarLinha(i, "mudarEstoque", e.target.checked)}
                    />{" "}
                    Atualizar estoque
                  </label>
                  <label className="rotulo">
                    Novo estoque
                    <span className="entrada" data-ouvindo={ouvindoCampo === `estoque-${i}`}>
                      <input
                        value={linha.estoque}
                        onChange={(e) => mudarLinha(i, "estoque", e.target.value)}
                        inputMode="decimal"
                        disabled={!linha.mudarEstoque}
                      />
                      <button
                        type="button"
                        className="mic-campo"
                        disabled={!disponivel || !linha.mudarEstoque}
                        onClick={() =>
                          ouvindoCampo === `estoque-${i}` ? parar() : ouvir(`estoque-${i}`)
                        }
                        aria-label="Falar a quantidade"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
                          <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                        </svg>
                      </button>
                    </span>
                  </label>

                  <label className="rotulo">
                    <input
                      type="checkbox"
                      checked={linha.mudarPreco}
                      onChange={(e) => mudarLinha(i, "mudarPreco", e.target.checked)}
                    />{" "}
                    Atualizar preço
                  </label>
                  <CampoVoz
                    rotulo="Novo preço"
                    campo={`preco-${i}`}
                    valor={linha.preco}
                    aoMudar={(v) => mudarLinha(i, "preco", mascararMoeda(v))}
                    placeholder="0,00"
                    moeda
                    ouvindo={ouvindoCampo === `preco-${i}`}
                    temVoz={disponivel && linha.mudarPreco}
                    aoOuvir={ouvir}
                    aoParar={parar}
                  />
                </>
              ) : (
                <>
                  <label className="rotulo largo">
                    Nome do produto
                    <input value={linha.nome} onChange={(e) => mudarLinha(i, "nome", e.target.value)} />
                  </label>
                  <CampoVoz
                    rotulo="Preço de venda"
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
                  <label className="rotulo">
                    Estoque inicial
                    <input
                      value={linha.estoque}
                      onChange={(e) => mudarLinha(i, "estoque", e.target.value)}
                      inputMode="decimal"
                    />
                  </label>
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
