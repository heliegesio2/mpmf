"use client";

import { useRef, useState } from "react";
import { comprimirImagem } from "@/lib/imagemCliente";

type ItemProposto = {
  descricaoDetectada: string;
  quantidadeEstimada: number;
  unidade: string;
  produto: { id: number; nome: string; estoqueAtual: number; score: number } | null;
};

type LinhaEdicao = {
  incluir: boolean;
  novoEstoque: string;
};

function linhaInicial(item: ItemProposto): LinhaEdicao {
  return {
    incluir: item.produto !== null,
    novoEstoque: String(item.quantidadeEstimada),
  };
}

export default function EstoquePorFoto() {
  const inputArquivo = useRef<HTMLInputElement>(null);
  const [propostos, setPropostos] = useState<ItemProposto[]>([]);
  const [linhas, setLinhas] = useState<LinhaEdicao[]>([]);
  const [analisando, setAnalisando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  async function analisar(arquivos: FileList) {
    setAnalisando(true);
    setErro(false);
    setAviso(`Lendo ${arquivos.length} foto(s)…`);
    setPropostos([]);
    setLinhas([]);
    try {
      const comprimidas = await Promise.all(
        Array.from(arquivos).map((a, i) => comprimirImagem(a, `prateleira-${i}.jpg`))
      );
      const corpo = new FormData();
      comprimidas.forEach((a) => corpo.append("fotos", a));

      const r = await fetch("/api/produtos/estoque-foto", { method: "POST", body: corpo });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível ler as fotos.");

      const itens: ItemProposto[] = dados.itens;
      if (itens.length === 0) {
        setAviso("Não encontrei nenhum produto nessas fotos.");
        return;
      }
      setPropostos(itens);
      setLinhas(itens.map(linhaInicial));
      const semCatalogo = itens.filter((i) => i.produto === null).length;
      setAviso(
        `${itens.length} produtos detectados` +
          (semCatalogo > 0 ? ` — ${semCatalogo} não estão no catálogo e ficam de fora.` : ".")
      );
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível ler as fotos.");
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
        .filter(({ l, item }) => l.incluir && item.produto)
        .map(({ l, item }) => ({
          produtoId: item.produto!.id,
          novoEstoque: Number(l.novoEstoque.replace(",", ".")),
        }));

      if (itens.length === 0) {
        setErro(true);
        setAviso("Marque pelo menos um item pra salvar.");
        return;
      }

      const r = await fetch("/api/produtos/estoque-foto/confirmar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itens }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");

      setAviso(`Estoque atualizado em ${itens.length} produtos.`);
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
      <header className="marca">Estoque por foto</header>

      <section className="cartao">
        <h2 className="titulo-cartao">Fotos da prateleira</h2>
        <p className="ajuda-voz">
          Tire uma ou mais fotos das prateleiras (pode selecionar várias de uma vez). O sistema
          estima quantas embalagens de cada produto estão visíveis e sugere o novo estoque — só
          pra produtos que já estão cadastrados. Confira antes de salvar.
        </p>

        <div className="acoes">
          <input
            ref={inputArquivo}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) analisar(e.target.files);
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
        if (!item.produto) {
          return (
            <section className="cartao" key={i}>
              <h2 className="titulo-cartao">
                {item.descricaoDetectada}
                <span className="sub"> · não está no catálogo, ignorado</span>
              </h2>
            </section>
          );
        }
        return (
          <section className="cartao" key={i}>
            <h2 className="titulo-cartao">
              {item.produto.nome}
              <span className="sub">
                {" "}
                · vistos na foto: ~{item.quantidadeEstimada} {item.unidade} · estoque atual:{" "}
                {item.produto.estoqueAtual}
              </span>
            </h2>

            <div className="grade-form">
              <label className="rotulo largo">
                <input
                  type="checkbox"
                  checked={linha.incluir}
                  onChange={(e) => mudarLinha(i, "incluir", e.target.checked)}
                />{" "}
                Atualizar estoque deste produto
              </label>

              <label className="rotulo">
                Novo estoque
                <input
                  value={linha.novoEstoque}
                  onChange={(e) => mudarLinha(i, "novoEstoque", e.target.value)}
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
            {salvando ? "Salvando…" : "Confirmar e salvar estoque"}
          </button>
        </div>
      )}
    </main>
  );
}
