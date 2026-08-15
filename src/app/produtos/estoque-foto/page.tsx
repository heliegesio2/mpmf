"use client";

import { useRef, useState } from "react";
import { comprimirImagem } from "@/lib/imagemCliente";
import { CampoVoz } from "@/components/CampoVoz";
import { useVoz } from "@/lib/useVoz";
import { EMBALAGENS, TIPOS_VENDA } from "@/lib/tipos";
import { numeroFalado, semAcento } from "@/lib/voz";
import { mascararMoeda, moedaParaNumero, paraMoeda } from "@/lib/moeda";

type ItemProposto = {
  descricaoDetectada: string;
  quantidadeEstimada: number;
  unidade: string;
  produto: { id: number; nome: string; estoqueAtual: number; score: number } | null;
};

type LinhaEdicao = {
  incluir: boolean;
  novoEstoque: string; // produto ja cadastrado
  nome: string; // produto novo
  preco: string; // produto novo
  estoque: string; // produto novo
  tipoVenda: string;
  unidade: string;
};

/** Casa a unidade que a IA leu ("garrafa", "kg"...) com uma embalagem conhecida. */
function mapearEmbalagem(unidadeDetectada: string): string {
  const alvo = semAcento(unidadeDetectada);
  const achada = EMBALAGENS.find(
    (e) => semAcento(e.valor) === alvo || semAcento(e.rotulo) === alvo
  );
  return achada?.valor ?? "unidade";
}

function linhaInicial(item: ItemProposto): LinhaEdicao {
  return {
    incluir: true,
    novoEstoque: String(item.quantidadeEstimada),
    nome: item.produto?.nome ?? item.descricaoDetectada,
    preco: "",
    estoque: String(item.quantidadeEstimada),
    tipoVenda: "unidade",
    unidade: mapearEmbalagem(item.unidade),
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

  function mudarLinha(i: number, campo: keyof LinhaEdicao, valor: LinhaEdicao[keyof LinhaEdicao]) {
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
        setAviso(`Não entendi "${texto}" como valor. Tente "quatro e cinquenta".`);
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
      const novos = itens.filter((i) => i.produto === null).length;
      setAviso(
        `${itens.length} produtos detectados` +
          (novos > 0 ? ` — ${novos} não estavam no catálogo; informe o preço deles antes de salvar.` : ".")
      );
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível ler as fotos.");
    } finally {
      setAnalisando(false);
    }
  }

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const selecionados = linhas
        .map((l, i) => ({ l, item: propostos[i] }))
        .filter(({ l }) => l.incluir);

      for (const { l, item } of selecionados) {
        if (!item.produto && moedaParaNumero(l.preco) <= 0) {
          setErro(true);
          setAviso(`Informe o preço de venda de "${l.nome}" antes de salvar.`);
          return;
        }
      }

      const itens = selecionados.map(({ l, item }) =>
        item.produto
          ? { produtoId: item.produto.id, novoEstoque: Number(l.novoEstoque.replace(",", ".")) }
          : {
              nome: l.nome,
              unidade: l.unidade,
              tipoVenda: l.tipoVenda,
              preco: moedaParaNumero(l.preco),
              estoque: Number(l.estoque.replace(",", ".")),
            }
      );

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

      setAviso(`${itens.length} produtos atualizados/incluídos com sucesso.`);
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
        <p className="ajuda-voz" data-erro={!disponivel}>
          {disponivel
            ? 'Tire uma ou mais fotos das prateleiras. Produtos já cadastrados têm o estoque sugerido; produtos novos vêm marcados pra incluir — toque no microfone do preço e fale, tipo "sete e noventa".'
            : "Tire uma ou mais fotos das prateleiras (pode selecionar várias de uma vez)."}
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
        return (
          <section className="cartao" key={i}>
            <h2 className="titulo-cartao">
              {item.produto ? item.produto.nome : item.descricaoDetectada}
              <span className="sub">
                {" "}
                · vistos na foto: ~{item.quantidadeEstimada} {item.unidade}
                {item.produto && ` · estoque atual: ${item.produto.estoqueAtual}`}
                {!item.produto && " · não cadastrado ainda"}
              </span>
            </h2>

            <div className="grade-form">
              <label className="rotulo largo">
                <input
                  type="checkbox"
                  checked={linha.incluir}
                  onChange={(e) => mudarLinha(i, "incluir", e.target.checked)}
                />{" "}
                {item.produto ? "Atualizar estoque deste produto" : "Incluir este produto novo"}
              </label>

              {item.produto ? (
                <label className="rotulo">
                  Novo estoque
                  <input
                    value={linha.novoEstoque}
                    onChange={(e) => mudarLinha(i, "novoEstoque", e.target.value)}
                    inputMode="decimal"
                  />
                </label>
              ) : (
                <>
                  <label className="rotulo largo">
                    Nome do produto
                    <input
                      value={linha.nome}
                      onChange={(e) => mudarLinha(i, "nome", e.target.value)}
                    />
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
                      {EMBALAGENS.map((e) => (
                        <option key={e.valor} value={e.valor}>
                          {e.rotulo}
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
