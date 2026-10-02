"use client";

import { useEffect, useState } from "react";
import { EMBALAGENS, TIPOS_VENDA } from "@/lib/tipos";
import { mascararMoeda, moedaParaNumero, paraMoeda } from "@/lib/moeda";
import { numeroFalado } from "@/lib/voz";
import { useVoz } from "@/lib/useVoz";
import { CampoVoz } from "@/components/CampoVoz";
import { comprimirImagem } from "@/lib/imagemCliente";
import CameraFoto from "@/components/CameraFoto";
import GravadorVideo, { type Quadro, type ResultadoGravacao } from "@/components/GravadorVideo";

type Estado = "lista" | "nova";
type ModoCaptura = "foto" | "video";

const MAX_SEGUNDOS_VIDEO_CUPOM = 45;
/** Poucas imagens pra caber no tempo limite da função serverless. */
const MAX_QUADROS_CUPOM = 5;

/** Escolhe até `max` quadros espalhados uniformemente pela gravação. */
function amostrarQuadros(quadros: Quadro[], max: number): Quadro[] {
  if (quadros.length <= max) return quadros;
  const passo = quadros.length / max;
  return Array.from({ length: max }, (_, i) => quadros[Math.floor(i * passo)]);
}

type ItemProposto = {
  descricaoExtraida: string;
  quantidade: number;
  unidade: string;
  precoCompra: number;
  precoVendaSugerido: number;
  produtoSugerido: { id: number; nome: string; score: number } | null;
};

type Nota = {
  hashImagem: string;
  chave: string | null;
  numero: string | null;
  emitente: string | null;
};

type LinhaEdicao = {
  usarSugestao: boolean;
  produtoId: number | null;
  nome: string;
  unidade: string;
  tipoVenda: string;
  precoCompra: string;
  precoVenda: string;
  incluir: boolean;
};

type NotaResumo = {
  id: number;
  numero: string | null;
  emitente: string | null;
  itens: number;
  criado_em: string;
};

type NotaDetalhe = NotaResumo & {
  itensDetalhe: {
    nome: string;
    precoCompra: number;
    precoVenda: number;
    produtoId: number | null;
    novo: boolean;
  }[];
};

function vendaComMargem(compra: number, margemPct: number): number {
  return Math.round(compra * (1 + margemPct / 100) * 100) / 100;
}

/**
 * Arredonda pro preço "redondo" mais próximo pra cima: centavos entre 1 e 50
 * viram ",50" (ex.: 1,10 -> 1,50; 1,22 -> 1,50); centavos entre 51 e 99 viram
 * o próximo inteiro (ex.: 1,77 -> 2,00; 5,25 -> 5,50; 5,77 -> 6,00).
 */
function arredondarPreco(valor: number): number {
  const centavosTotais = Math.round(valor * 100);
  const reais = Math.floor(centavosTotais / 100);
  const centavos = centavosTotais % 100;
  if (centavos === 0) return reais;
  return centavos <= 50 ? reais + 0.5 : reais + 1;
}

function precoVendaFinal(compra: number, margemPct: number, arredondar: boolean): number {
  const bruto = vendaComMargem(compra, margemPct);
  return arredondar ? arredondarPreco(bruto) : bruto;
}

function linhaInicial(item: ItemProposto, arredondar: boolean): LinhaEdicao {
  return {
    usarSugestao: item.produtoSugerido !== null,
    produtoId: item.produtoSugerido?.id ?? null,
    nome: item.produtoSugerido?.nome ?? item.descricaoExtraida,
    unidade: "unidade",
    tipoVenda: "unidade",
    precoCompra: paraMoeda(item.precoCompra),
    precoVenda: paraMoeda(arredondar ? arredondarPreco(item.precoVendaSugerido) : item.precoVendaSugerido),
    incluir: true,
  };
}

function dataHoraBR(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function ImportarCompra() {
  const [estado, setEstado] = useState<Estado>("lista");

  const [historico, setHistorico] = useState<NotaResumo[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);
  const [abertaId, setAbertaId] = useState<number | null>(null);
  const [detalhes, setDetalhes] = useState<Record<number, NotaDetalhe>>({});
  const [carregandoDetalhe, setCarregandoDetalhe] = useState<number | null>(null);

  const [fotos, setFotos] = useState<File[]>([]);
  const [modoCaptura, setModoCaptura] = useState<ModoCaptura>("foto");
  const [margem, setMargem] = useState("38");
  const [arredondar, setArredondar] = useState(false);
  const [propostos, setPropostos] = useState<ItemProposto[]>([]);
  const [linhas, setLinhas] = useState<LinhaEdicao[]>([]);
  const [nota, setNota] = useState<Nota | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [jaProcessada, setJaProcessada] = useState("");
  const [erro, setErro] = useState(false);

  async function carregarHistorico() {
    setCarregandoHistorico(true);
    try {
      const r = await fetch("/api/importar-compra/notas");
      const d = await r.json();
      setHistorico(r.ok && Array.isArray(d.itens) ? d.itens : []);
    } catch {
      /* histórico é só uma listagem — falha aqui não impede nova importação */
    } finally {
      setCarregandoHistorico(false);
    }
  }
  useEffect(() => {
    carregarHistorico();
    fetch("/api/importar-compra/margem")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.margem === "number") setMargem(String(d.margem));
      })
      .catch(() => {});
  }, []);

  async function verItens(id: number) {
    if (abertaId === id) {
      setAbertaId(null);
      return;
    }
    setAbertaId(id);
    if (detalhes[id]) return;
    setCarregandoDetalhe(id);
    try {
      const r = await fetch(`/api/importar-compra/notas/${id}`);
      const d = await r.json();
      if (r.ok && d.item) setDetalhes((ds) => ({ ...ds, [id]: d.item }));
    } catch {
      /* falha ao abrir — tenta de novo no próximo clique */
    } finally {
      setCarregandoDetalhe(null);
    }
  }

  function novaImportacao() {
    setFotos([]);
    setModoCaptura("foto");
    setPropostos([]);
    setLinhas([]);
    setNota(null);
    setAviso("");
    setJaProcessada("");
    setErro(false);
    setEstado("nova");
  }

  const margemNum = () => {
    const n = Number(margem.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 38;
  };

  function aplicarMargem(n: number) {
    setMargem(String(n));
    fetch("/api/importar-compra/margem", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ margem: n }),
    }).catch(() => {});
    setLinhas((ls) =>
      ls.map((l) => ({
        ...l,
        precoVenda: paraMoeda(precoVendaFinal(moedaParaNumero(l.precoCompra), n, arredondar)),
      }))
    );
  }
  const salvarMargem = () => aplicarMargem(margemNum());

  function aplicarArredondar(ligado: boolean) {
    setArredondar(ligado);
    setLinhas((ls) =>
      ls.map((l) => ({
        ...l,
        precoVenda: paraMoeda(precoVendaFinal(moedaParaNumero(l.precoCompra), margemNum(), ligado)),
      }))
    );
  }

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const campo = campoAtual.current;
      if (!campo) return;
      if (campo === "margem") {
        const falado = numeroFalado(texto.replace(/por\s*cento|%/gi, ""));
        const n = falado === null ? NaN : Number(falado);
        if (!Number.isFinite(n) || n < 0) {
          setErro(true);
          setAviso(`Não entendi "${texto}" como percentual.`);
          return;
        }
        setErro(false);
        setAviso("");
        aplicarMargem(n);
        return;
      }
      const m = /^(nome|precoCompra|precoVenda)-(\d+)$/.exec(campo);
      if (!m) return;
      const i = Number(m[2]);
      if (m[1] === "nome") {
        mudarLinha(i, "nome", texto);
        return;
      }
      const falado = numeroFalado(texto);
      if (falado === null) {
        setErro(true);
        setAviso(`Não entendi "${texto}" como valor. Tente "quatro e cinquenta".`);
        return;
      }
      setErro(false);
      setAviso("");
      if (m[1] === "precoCompra") mudarCompra(i, paraMoeda(falado));
      else mudarLinha(i, "precoVenda", paraMoeda(falado));
    },
    aoErrar: (msg) => {
      setErro(true);
      setAviso(msg);
    },
  });

  /** Envia o corpo (foto ou quadros de vídeo) e aplica a resposta — comum às duas origens. */
  async function processarCupom(corpo: FormData, mensagemInicial: string) {
    setAnalisando(true);
    setErro(false);
    setJaProcessada("");
    setAviso(mensagemInicial);
    setPropostos([]);
    setLinhas([]);
    setNota(null);
    try {
      const r = await fetch("/api/importar-compra", { method: "POST", body: corpo });
      const texto = await r.text();
      let dados: any;
      try {
        dados = texto ? JSON.parse(texto) : {};
      } catch {
        throw new Error(
          "O servidor demorou demais ou teve um erro inesperado. Tente de novo com um vídeo mais curto."
        );
      }
      if (!r.ok) {
        throw new Error(
          [dados?.erro, dados?.detalhe].filter(Boolean).join(" — ") || "Não foi possível ler o cupom."
        );
      }

      if (dados.jaProcessada) {
        setJaProcessada(dados.aviso ?? "Essa nota já foi processada.");
        setAviso("");
        setFotos([]);
        return;
      }

      const itens: ItemProposto[] = dados.itens ?? [];
      if (typeof dados.margem === "number") setMargem(String(dados.margem));
      if (dados.nota) setNota(dados.nota as Nota);

      if (itens.length === 0) {
        setAviso("Não encontrei nenhum item nessa nota.");
        return;
      }
      setPropostos(itens);
      setLinhas(itens.map((item) => linhaInicial(item, arredondar)));
      setAviso(`${itens.length} itens encontrados — confira antes de salvar.`);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível ler o cupom.");
    } finally {
      setAnalisando(false);
    }
  }

  async function analisar(arquivo: File) {
    try {
      const comprimida = await comprimirImagem(arquivo);
      const corpo = new FormData();
      corpo.append("foto", comprimida);
      await processarCupom(corpo, "Lendo o cupom…");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível ler o cupom.");
    }
  }

  async function analisarVideo({ quadros }: ResultadoGravacao) {
    const corpo = new FormData();
    amostrarQuadros(quadros, MAX_QUADROS_CUPOM).forEach((q) => corpo.append("quadros", q.dataUrl));
    await processarCupom(corpo, "Lendo os quadros do vídeo…");
  }

  function mudarFotos(fs: File[]) {
    setFotos(fs);
    if (fs[0]) {
      analisar(fs[0]);
    } else {
      setPropostos([]);
      setLinhas([]);
      setNota(null);
      setAviso("");
      setJaProcessada("");
    }
  }

  function mudarLinha(i: number, campo: keyof LinhaEdicao, valor: LinhaEdicao[keyof LinhaEdicao]) {
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }

  function mudarCompra(i: number, texto: string) {
    const mascarado = mascararMoeda(texto);
    const compra = moedaParaNumero(mascarado);
    setLinhas((ls) =>
      ls.map((l, idx) =>
        idx === i
          ? {
              ...l,
              precoCompra: mascarado,
              precoVenda:
                compra > 0 ? paraMoeda(precoVendaFinal(compra, margemNum(), arredondar)) : l.precoVenda,
            }
          : l
      )
    );
  }

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const itens = linhas
        .filter((l) => l.incluir)
        .map((l) => ({
          produtoId: l.usarSugestao ? l.produtoId ?? undefined : undefined,
          nome: l.nome,
          unidade: l.unidade,
          tipoVenda: l.tipoVenda,
          precoCompra: moedaParaNumero(l.precoCompra),
          precoVenda: moedaParaNumero(l.precoVenda),
        }));

      if (itens.length === 0) {
        setErro(true);
        setAviso("Marque pelo menos um item pra salvar.");
        return;
      }

      const r = await fetch("/api/importar-compra/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens, nota }),
      });
      const dados = await r.json();
      if (dados?.jaProcessada) {
        setJaProcessada(dados.aviso ?? "Essa nota já foi processada.");
        setPropostos([]);
        setLinhas([]);
        setNota(null);
        setFotos([]);
        return;
      }
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");

      setPropostos([]);
      setLinhas([]);
      setNota(null);
      setFotos([]);
      setEstado("lista");
      await carregarHistorico();
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const rotuloVenda = `Preço de venda (+${margemNum().toLocaleString("pt-BR")}%)`;
  const vozProps = (campo: string) => ({
    campo,
    ouvindo: ouvindoCampo === campo,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  return (
    <main className="tela">
      <header className="marca">Importar compra</header>

      {estado === "lista" && (
        <>
          <div className="acoes">
            <button type="button" className="botao primario" onClick={novaImportacao}>
              ➕ Nova importação
            </button>
          </div>

          {carregandoHistorico ? (
            <p className="vazio">Carregando…</p>
          ) : historico.length === 0 ? (
            <p className="vazio">Nenhuma nota importada ainda.</p>
          ) : (
            <ul className="lista">
              {historico.map((n) => (
                <li key={n.id} style={{ flexWrap: "wrap" }}>
                  <span className="rotulo-item">
                    {n.emitente || "Fornecedor não identificado"}
                    <span className="sub">
                      {n.numero && `nº ${n.numero} · `}
                      {n.itens} item(ns) · {dataHoraBR(n.criado_em)}
                    </span>
                  </span>
                  <button type="button" className="botao mini" onClick={() => verItens(n.id)}>
                    {abertaId === n.id ? "Ocultar itens" : "Ver itens"}
                  </button>

                  {abertaId === n.id && (
                    <div className="cg-comparar-painel" style={{ width: "100%" }}>
                      {carregandoDetalhe === n.id ? (
                        <p className="dica">Carregando os itens…</p>
                      ) : !detalhes[n.id] ? (
                        <p className="dica" data-erro="true">
                          Não foi possível carregar os itens.
                        </p>
                      ) : (
                        <ul className="lista cg-lista">
                          {detalhes[n.id].itensDetalhe.map((it, i) => (
                            <li className="cg-item" key={i}>
                              <div className="cg-item-topo">
                                <strong>{it.nome}</strong>
                                <span className="cg-preco">R$ {paraMoeda(it.precoVenda)}</span>
                              </div>
                              <div className="cg-comparado" data-sinal="igual">
                                Compra: R$ {paraMoeda(it.precoCompra)}
                                {it.novo ? " · produto novo" : " · produto já cadastrado"}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {estado === "nova" && (
        <>
          <div className="acoes">
            <button type="button" className="botao mini neutro" onClick={() => setEstado("lista")}>
              ← Voltar
            </button>
          </div>

          <section className="cartao">
            <h2 className="titulo-cartao">Margem de lucro</h2>
            <p className="ajuda-voz">
              Quanto você quer ganhar sobre o preço de compra. O preço de venda de cada item vem
              calculado com essa margem — dá pra ajustar item a item depois.
            </p>
            <div style={{ maxWidth: 240 }}>
              <CampoVoz
                rotulo="Lucro sobre a compra (%)"
                valor={margem}
                aoMudar={(v) => setMargem(v.replace(/[^\d.,]/g, ""))}
                aoSair={salvarMargem}
                numerico
                {...vozProps("margem")}
              />
            </div>

            <label className="rotulo largo" style={{ marginTop: 10 }}>
              <input
                type="checkbox"
                checked={arredondar}
                onChange={(e) => aplicarArredondar(e.target.checked)}
              />{" "}
              Arredondar o preço de venda pro valor mais redondo (ex.: R$ 1,22 vira R$ 1,50; R$ 1,77
              vira R$ 2,00)
            </label>
          </section>

          <section className="cartao">
            <h2 className="titulo-cartao">Cupom fiscal</h2>
            <p className="ajuda-voz">
              Tire uma foto do cupom da distribuidora, envie uma que você já tem, ou grave um vídeo
              aproximando a câmera — melhor pra notas pequenas, onde a letra não sai nítida numa foto
              só. O sistema lê os itens e sugere o preço de venda com a sua margem — confira antes de
              salvar.
            </p>

            <div className="acoes">
              <button
                type="button"
                className={`botao mini ${modoCaptura === "foto" ? "primario" : "neutro"}`}
                onClick={() => setModoCaptura("foto")}
                disabled={analisando}
              >
                📷 Foto
              </button>
              <button
                type="button"
                className={`botao mini ${modoCaptura === "video" ? "primario" : "neutro"}`}
                onClick={() => setModoCaptura("video")}
                disabled={analisando}
              >
                🎥 Vídeo
              </button>
            </div>

            {modoCaptura === "foto" ? (
              <CameraFoto
                fotos={fotos}
                aoMudar={mudarFotos}
                max={1}
                aoErro={(m) => {
                  setErro(true);
                  setAviso(m);
                }}
              />
            ) : (
              <GravadorVideo
                maxSegundos={MAX_SEGUNDOS_VIDEO_CUPOM}
                aoGravar={analisarVideo}
                aoErro={(m) => {
                  setErro(true);
                  setAviso(m);
                }}
                ocupado={analisando}
              />
            )}

            {aviso && (
              <p className="dica" data-erro={erro} role="status" aria-live="polite">
                {aviso}
              </p>
            )}
          </section>

          {jaProcessada && (
            <section className="cartao" data-erro="true">
              <h2 className="titulo-cartao">Nota repetida</h2>
              <p className="dica" data-erro="true">
                {jaProcessada}
              </p>
            </section>
          )}

          {nota && (nota.emitente || nota.numero) && linhas.length > 0 && (
            <p className="dica">
              Nota: {[nota.emitente, nota.numero && `nº ${nota.numero}`].filter(Boolean).join(" · ")}
            </p>
          )}

          {linhas.map((linha, i) => {
            const item = propostos[i];
            return (
              <section className="cartao" key={i}>
                <h2 className="titulo-cartao">
                  {item.descricaoExtraida}
                  <span className="sub">
                    {" "}
                    · {item.quantidade} {item.unidade} · compra {paraMoeda(item.precoCompra)}
                  </span>
                </h2>

                <div className="grade-form">
                  <label className="rotulo largo">
                    <input
                      type="checkbox"
                      checked={linha.incluir}
                      onChange={(e) => mudarLinha(i, "incluir", e.target.checked)}
                    />{" "}
                    Incluir este item
                  </label>

                  {item.produtoSugerido && (
                    <label className="rotulo largo">
                      <input
                        type="checkbox"
                        checked={linha.usarSugestao}
                        onChange={(e) => mudarLinha(i, "usarSugestao", e.target.checked)}
                      />{" "}
                      Atualizar produto já cadastrado: <strong>{item.produtoSugerido.nome}</strong>
                    </label>
                  )}

                  {!linha.usarSugestao && (
                    <>
                      <CampoVoz
                        rotulo="Nome do produto novo"
                        valor={linha.nome}
                        aoMudar={(v) => mudarLinha(i, "nome", v)}
                        largo
                        {...vozProps(`nome-${i}`)}
                      />
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
                          {EMBALAGENS.map((e) => (
                            <option key={e.valor} value={e.valor}>
                              {e.rotulo}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}

                  <CampoVoz
                    rotulo="Preço de compra"
                    valor={linha.precoCompra}
                    aoMudar={(v) => mudarCompra(i, v)}
                    moeda
                    {...vozProps(`precoCompra-${i}`)}
                  />

                  <CampoVoz
                    rotulo={rotuloVenda}
                    valor={linha.precoVenda}
                    aoMudar={(v) => mudarLinha(i, "precoVenda", v)}
                    moeda
                    {...vozProps(`precoVenda-${i}`)}
                  />
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
        </>
      )}
    </main>
  );
}
