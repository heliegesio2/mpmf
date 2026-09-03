"use client";

import { useEffect, useState } from "react";
import { EMBALAGENS, TIPOS_VENDA } from "@/lib/tipos";
import { mascararMoeda, moedaParaNumero, paraMoeda } from "@/lib/moeda";
import { comprimirImagem } from "@/lib/imagemCliente";
import CameraFoto from "@/components/CameraFoto";

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

function vendaComMargem(compra: number, margemPct: number): number {
  return Math.round(compra * (1 + margemPct / 100) * 100) / 100;
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
  const [fotos, setFotos] = useState<File[]>([]);
  const [margem, setMargem] = useState("38");
  const [propostos, setPropostos] = useState<ItemProposto[]>([]);
  const [linhas, setLinhas] = useState<LinhaEdicao[]>([]);
  const [nota, setNota] = useState<Nota | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [jaProcessada, setJaProcessada] = useState("");
  const [erro, setErro] = useState(false);

  const margemNum = () => {
    const n = Number(margem.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 38;
  };

  useEffect(() => {
    fetch("/api/importar-compra/margem")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.margem === "number") setMargem(String(d.margem));
      })
      .catch(() => {});
  }, []);

  function salvarMargem() {
    const n = margemNum();
    setMargem(String(n));
    fetch("/api/importar-compra/margem", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ margem: n }),
    }).catch(() => {});
    // recalcula o preço de venda de todas as linhas com a nova margem
    setLinhas((ls) =>
      ls.map((l) => ({
        ...l,
        precoVenda: paraMoeda(vendaComMargem(moedaParaNumero(l.precoCompra), n)),
      }))
    );
  }

  async function analisar(arquivo: File) {
    setAnalisando(true);
    setErro(false);
    setJaProcessada("");
    setAviso("Lendo o cupom…");
    setPropostos([]);
    setLinhas([]);
    setNota(null);
    try {
      const comprimida = await comprimirImagem(arquivo);
      const corpo = new FormData();
      corpo.append("foto", comprimida);

      const r = await fetch("/api/importar-compra", { method: "POST", body: corpo });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível ler o cupom.");

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
                compra > 0 ? paraMoeda(vendaComMargem(compra, margemNum())) : l.precoVenda,
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

      setAviso(`${itens.length} produtos atualizados/criados com sucesso.`);
      setPropostos([]);
      setLinhas([]);
      setNota(null);
      setFotos([]);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const rotuloVenda = `Preço de venda (+${margemNum().toLocaleString("pt-BR")}%)`;

  return (
    <main className="tela">
      <header className="marca">Importar compra</header>

      <section className="cartao">
        <h2 className="titulo-cartao">Margem de lucro</h2>
        <p className="ajuda-voz">
          Quanto você quer ganhar sobre o preço de compra. O preço de venda de cada item vem
          calculado com essa margem — dá pra ajustar item a item depois.
        </p>
        <label className="rotulo" style={{ maxWidth: 180 }}>
          Lucro sobre a compra (%)
          <input
            value={margem}
            onChange={(e) => setMargem(e.target.value.replace(/[^\d.,]/g, ""))}
            onBlur={salvarMargem}
            inputMode="decimal"
          />
        </label>
      </section>

      <section className="cartao">
        <h2 className="titulo-cartao">Foto do cupom fiscal</h2>
        <p className="ajuda-voz">
          Tire uma foto do cupom da distribuidora. O sistema lê os itens e sugere o preço de
          venda com a sua margem — confira antes de salvar.
        </p>

        <CameraFoto
          fotos={fotos}
          aoMudar={mudarFotos}
          max={1}
          aoErro={(m) => {
            setErro(true);
            setAviso(m);
          }}
        />

        {aviso && (
          <p className="dica" data-erro={erro} role="status" aria-live="polite">
            {aviso}
          </p>
        )}
        {analisando && <p className="dica">Lendo o cupom…</p>}
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
                  onChange={(e) => mudarCompra(i, e.target.value)}
                  inputMode="decimal"
                />
              </label>

              <label className="rotulo">
                {rotuloVenda}
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
