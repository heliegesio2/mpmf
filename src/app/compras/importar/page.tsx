"use client";

import { useRef, useState } from "react";
import { EMBALAGENS, TIPOS_VENDA } from "@/lib/tipos";
import { mascararMoeda, moedaParaNumero, paraMoeda } from "@/lib/moeda";

type ItemProposto = {
  descricaoExtraida: string;
  quantidade: number;
  unidade: string;
  precoCompra: number;
  precoVendaSugerido: number;
  produtoSugerido: { id: number; nome: string; score: number } | null;
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

const MAX_LADO = 1800;
const QUALIDADE_JPEG = 0.85;

/** Reduz a foto no navegador antes de subir — cupom fotografado no celular
 * costuma vir grande demais pro limite de corpo de requisicao da hospedagem. */
async function comprimirImagem(arquivo: File): Promise<File> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, MAX_LADO / Math.max(bitmap.width, bitmap.height));
  const largura = Math.round(bitmap.width * escala);
  const altura = Math.round(bitmap.height * escala);

  const canvas = document.createElement("canvas");
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext("2d");
  if (!ctx) return arquivo;
  ctx.drawImage(bitmap, 0, 0, largura, altura);

  const blob: Blob | null = await new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALIDADE_JPEG)
  );
  if (!blob) return arquivo;
  return new File([blob], "cupom.jpg", { type: "image/jpeg" });
}

function linhaInicial(item: ItemProposto): LinhaEdicao {
  return {
    usarSugestao: item.produtoSugerido !== null,
    produtoId: item.produtoSugerido?.id ?? null,
    nome: item.produtoSugerido?.nome ?? item.descricaoExtraida,
    unidade: "unidade",
    tipoVenda: "unidade",
    precoCompra: paraMoeda(item.precoCompra),
    precoVenda: paraMoeda(item.precoVendaSugerido),
    incluir: true,
  };
}

export default function ImportarCompra() {
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [propostos, setPropostos] = useState<ItemProposto[]>([]);
  const [linhas, setLinhas] = useState<LinhaEdicao[]>([]);
  const [analisando, setAnalisando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  async function analisar(arquivo: File) {
    setAnalisando(true);
    setErro(false);
    setAviso("Lendo o cupom…");
    setPropostos([]);
    setLinhas([]);
    try {
      const comprimida = await comprimirImagem(arquivo);
      const corpo = new FormData();
      corpo.append("foto", comprimida);

      const r = await fetch("/api/importar-compra", { method: "POST", body: corpo });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível ler o cupom.");

      const itens: ItemProposto[] = dados.itens;
      if (itens.length === 0) {
        setAviso("Não encontrei nenhum item nessa foto.");
        return;
      }
      setPropostos(itens);
      setLinhas(itens.map(linhaInicial));
      setAviso(`${itens.length} itens encontrados — confira antes de salvar.`);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível ler o cupom.");
    } finally {
      setAnalisando(false);
    }
  }

  function mudarLinha(i: number, campo: keyof LinhaEdicao, valor: LinhaEdicao[keyof LinhaEdicao]) {
    setLinhas((ls) => ls.map((l, idx) => (idx === i ? { ...l, [campo]: valor } : l)));
  }

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const itens = linhas
        .map((l, i) => ({ l, item: propostos[i] }))
        .filter(({ l }) => l.incluir)
        .map(({ l }) => ({
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
        body: JSON.stringify({ itens }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");

      setAviso(`${itens.length} produtos atualizados/criados com sucesso.`);
      setPropostos([]);
      setLinhas([]);
      if (inputArquivo.current) inputArquivo.current.value = "";
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <main className="tela">
      <header className="marca">Importar compra</header>

      <section className="cartao">
        <h2 className="titulo-cartao">Foto do cupom fiscal</h2>
        <p className="ajuda-voz">
          Tire uma foto do cupom da distribuidora. O sistema lê os itens e sugere o preço de
          venda com 38% de margem sobre o preço de compra — confira antes de salvar.
        </p>

        <div className="acoes">
          <input
            ref={inputArquivo}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const arquivo = e.target.files?.[0];
              if (arquivo) analisar(arquivo);
            }}
            disabled={analisando}
          />
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>

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
                  <label className="rotulo largo">
                    Nome do produto novo
                    <input
                      value={linha.nome}
                      onChange={(e) => mudarLinha(i, "nome", e.target.value)}
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
                      {EMBALAGENS.map((e) => (
                        <option key={e.valor} value={e.valor}>
                          {e.rotulo}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}

              <label className="rotulo">
                Preço de compra
                <input
                  value={linha.precoCompra}
                  onChange={(e) => mudarLinha(i, "precoCompra", mascararMoeda(e.target.value))}
                  inputMode="decimal"
                />
              </label>

              <label className="rotulo">
                Preço de venda (+38%)
                <input
                  value={linha.precoVenda}
                  onChange={(e) => mudarLinha(i, "precoVenda", mascararMoeda(e.target.value))}
                  inputMode="decimal"
                />
              </label>
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
