"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatarQuantidade, interpretarItem } from "@/lib/falaVenda";
import { EMBALAGENS, TIPOS_VENDA, sufixo } from "@/lib/tipos";
import { capitalizar, numeroFalado } from "@/lib/voz";
import { mascararMoeda, moedaParaNumero, paraMoeda } from "@/lib/moeda";
import PainelPix from "@/components/PainelPix";
import CampoFoto from "@/components/CampoFoto";
import { useCarrinho, type ItemCarrinho, type ProdutoCarrinho } from "@/lib/carrinho";

type Produto = ProdutoCarrinho;

/** Quando a fala casa com mais de um produto, o caixa escolhe qual entra. */
type Escolha = {
  opcoes: Produto[];
  quantidade: number;
  emPeso: boolean;
  termo: string;
};

/** Produto falado que não está no cadastro: inclui na hora, com foto e preço. */
type ProdutoNovo = {
  nome: string;
  quantidade: number;
  emPeso: boolean;
  tipoVenda: string;
  embalagem: string;
  estoque: string;
  estoqueMinimo: string;
  estoqueMinimoEmbalagem: string;
};

type Item = ItemCarrinho;

type Pagamento = "dinheiro" | "pix" | "debito" | "credito";

const PAGAMENTOS: { valor: Pagamento; rotulo: string }[] = [
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "pix", rotulo: "Pix" },
  { valor: "debito", rotulo: "Débito" },
  { valor: "credito", rotulo: "Crédito" },
];

const num = (v: string) => moedaParaNumero(v);

const moeda = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Miniatura do produto; some sozinha se ele não tiver foto (404). */
function FotoProduto({ id }: { id: number }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="miniatura-produto"
      src={`/api/produtos/${id}/foto`}
      alt=""
      onError={() => setFalhou(true)}
    />
  );
}

export default function Venda() {
  const { itens, setItens, limpar: limparCarrinho } = useCarrinho();
  const [pagamento, setPagamento] = useState<Pagamento | null>(null);
  const [fechada, setFechada] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [disponivel, setDisponivel] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [recebido, setRecebido] = useState("");
  const [pixAprovado, setPixAprovado] = useState(false);
  const [procurando, setProcurando] = useState(false);
  const [escolha, setEscolha] = useState<Escolha | null>(null);
  const escolhaAberta = useRef(false);
  const [novo, setNovo] = useState<ProdutoNovo | null>(null);
  const [novoPreco, setNovoPreco] = useState("");
  const [novaFoto, setNovaFoto] = useState<string | null>(null);
  const [salvandoNovo, setSalvandoNovo] = useState(false);
  const novoAberto = useRef(false);
  /** Identificador desta venda, usado no Pix. */
  const [txid] = useState(() => `V${Date.now().toString(36).toUpperCase()}`);

  const reconhecimento = useRef<any>(null);
  /** Para onde vai o que for falado. */
  const destino = useRef<"itens" | "recebido" | "novoPreco">("itens");
  // cópia dos itens no momento de fechar, pro comprovante — o carrinho em si
  // é esvaziado assim que a venda fecha (comportamento de carrinho de verdade).
  const [finalizada, setFinalizada] = useState<Item[] | null>(null);

  const itensVenda = fechada && finalizada ? finalizada : itens;
  const total = itensVenda.reduce(
    (s, i) => s + Number(i.produto.preco) * i.quantidade,
    0
  );

  const emDinheiro = pagamento === "dinheiro";
  const emPix = pagamento === "pix";
  const valorRecebido = num(recebido || "0");
  const troco = valorRecebido - total;
  const faltaDinheiro = emDinheiro && valorRecebido < total;

  /** Interpreta a frase, procura o produto e joga no carrinho. */
  /** Coloca o produto no carrinho, somando se ele já estiver lá. */
  const adicionarProduto = useCallback(
    (produto: Produto, quantidade: number, emPeso: boolean) => {
      // "duzentos gramas" só faz sentido em produto vendido por quilo
      const qtd =
        emPeso && produto.tipo_venda !== "quilo"
          ? Math.max(1, Math.round(quantidade))
          : quantidade;

      setItens((atuais) => {
        const igual = atuais.find((i) => i.produto.id === produto.id);
        if (igual) {
          return atuais.map((i) =>
            i.produto.id === produto.id
              ? { ...i, quantidade: Number((i.quantidade + qtd).toFixed(3)) }
              : i
          );
        }
        return [
          ...atuais,
          { chave: `${produto.id}-${Date.now()}`, produto, quantidade: qtd },
        ];
      });

      setErro(false);
      setAviso(`${produto.nome} adicionado.`);
    },
    []
  );

  const adicionarPorFala = useCallback(
    async (frase: string) => {
      // com a lista de escolha aberta, o caixa precisa decidir antes de seguir
      if (escolhaAberta.current) {
        setErro(true);
        setAviso("Escolha um dos produtos da lista antes de falar o próximo.");
        return;
      }
      if (novoAberto.current) {
        setErro(true);
        setAviso("Termine de incluir o produto novo antes de falar o próximo.");
        return;
      }

      const lido = interpretarItem(frase);
      if (!lido) {
        setErro(true);
        setAviso(`Não entendi "${frase}".`);
        return;
      }

      /** Procura o termo; se não achar, tenta só a última palavra.
       *  "maco de cigarro" não bate com nenhum nome, mas "cigarro" bate. */
      async function procurar(termo: string): Promise<Produto[]> {
        const r = await fetch(`/api/produtos?q=${encodeURIComponent(termo)}`);
        const dados = await r.json();
        if (!r.ok) throw new Error(dados?.erro);
        return (dados.itens ?? []) as Produto[];
      }

      setProcurando(true);
      try {
        let achados = await procurar(lido.termo);

        if (achados.length === 0) {
          const ultima = lido.termo.split(" ").filter(Boolean).at(-1);
          if (ultima && ultima !== lido.termo && ultima.length > 2) {
            achados = await procurar(ultima);
          }
        }

        if (achados.length === 0) {
          // não está no cadastro: abre o quadro pra incluir na hora
          novoAberto.current = true;
          setNovo({
            nome: capitalizar(lido.termo),
            quantidade: lido.quantidade,
            emPeso: lido.emPeso,
            tipoVenda: lido.emPeso ? "quilo" : "unidade",
            embalagem: "unidade",
            estoque: "",
            estoqueMinimo: "",
            estoqueMinimoEmbalagem: "unidade",
          });
          setNovoPreco("");
          setNovaFoto(null);
          setErro(false);
          setAviso("");
          return;
        }

        // A busca devolve até 8 resultados por semelhança, e os últimos costumam
        // ser parentes distantes. Só entram na escolha os que chegam perto do
        // primeiro colocado — senão a lista viraria ruído.
        const melhor = achados[0].score ?? 1;
        const candidatos = achados.filter(
          (p) => (p.score ?? 0) >= melhor - 0.15
        );

        if (candidatos.length === 1) {
          adicionarProduto(candidatos[0], lido.quantidade, lido.emPeso);
          return;
        }

        escolhaAberta.current = true;
        setEscolha({
          opcoes: candidatos,
          quantidade: lido.quantidade,
          emPeso: lido.emPeso,
          termo: lido.termo,
        });
        setErro(false);
        setAviso("");
      } catch {
        setErro(true);
        setAviso("Não foi possível consultar o produto.");
      } finally {
        setProcurando(false);
      }
    },
    [adicionarProduto]
  );

  function confirmarEscolha(produto: Produto) {
    if (!escolha) return;
    adicionarProduto(produto, escolha.quantidade, escolha.emPeso);
    escolhaAberta.current = false;
    setEscolha(null);
  }

  function cancelarEscolha() {
    escolhaAberta.current = false;
    setEscolha(null);
    setAviso("");
    setErro(false);
  }

  function fecharNovo() {
    novoAberto.current = false;
    setNovo(null);
    setNovoPreco("");
    setNovaFoto(null);
    setSalvandoNovo(false);
  }

  function cancelarNovo() {
    fecharNovo();
    setAviso("");
    setErro(false);
  }

  /** Cria o produto no cadastro e já joga na venda. */
  async function salvarNovo() {
    if (!novo) return;
    const nome = novo.nome.trim();
    const preco = moedaParaNumero(novoPreco);
    if (nome.length < 2) {
      setErro(true);
      setAviso("Dê um nome ao produto.");
      return;
    }
    if (preco <= 0) {
      setErro(true);
      setAviso("Informe o preço de venda do produto.");
      return;
    }

    setSalvandoNovo(true);
    setErro(false);
    try {
      const r = await fetch("/api/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          tipoVenda: novo.tipoVenda,
          unidade: novo.embalagem,
          preco,
          precoCompra: 0,
          estoque: novo.estoque === "" ? 0 : Number(novo.estoque.replace(",", ".")),
          estoqueMinimo: novo.estoqueMinimo,
          estoqueMinimoEmbalagem: novo.estoqueMinimoEmbalagem,
          ...(novaFoto ? { foto: novaFoto } : {}),
        }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível incluir o produto.");

      const { quantidade, emPeso } = novo;
      fecharNovo();
      adicionarProduto(dados.item as Produto, quantidade, emPeso);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível incluir o produto.");
      setSalvandoNovo(false);
    }
  }

  // ---------- reconhecimento de fala (um item por vez) ----------
  // Igual à tela de consulta de preço: cada toque no microfone ouve uma frase
  // só e para. Falar item por item deixa a transcrição e a busca bem mais
  // certeiras que o modo contínuo, que emendava produtos e errava mais.
  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    setDisponivel(true);
    const sr = new SR();
    sr.lang = "pt-BR";
    sr.continuous = false;
    sr.interimResults = true;
    sr.maxAlternatives = 1;

    sr.onresult = (e: any) => {
      const texto = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join("")
        .trim();
      const final = e.results[e.results.length - 1].isFinal;

      if (destino.current === "recebido" || destino.current === "novoPreco") {
        if (!final) return;
        const n = numeroFalado(texto);
        if (n === null) {
          setErro(true);
          setAviso(`Não entendi "${texto}" como valor.`);
        } else {
          if (destino.current === "novoPreco") setNovoPreco(paraMoeda(n));
          else setRecebido(paraMoeda(n));
          setErro(false);
          setAviso("");
        }
        return;
      }

      // mostra no campo o que está sendo falado, como na tela de consulta
      setDigitado(texto);
      if (final && texto) {
        adicionarPorFala(texto);
        setDigitado("");
      }
    };
    sr.onerror = (e: any) => {
      if (e.error === "no-speech") return; // silêncio não é erro
      setErro(true);
      setAviso(
        e.error === "not-allowed"
          ? "Libere o microfone nas permissões do navegador."
          : "Não entendi. Fale de novo."
      );
    };
    sr.onend = () => {
      setOuvindo(false);
      setAviso((a) =>
        a === "Ouvindo. Diga um produto." ||
        a === "Ouvindo. Diga o valor entregue." ||
        a === "Ouvindo. Diga o preço."
          ? ""
          : a
      );
    };

    reconhecimento.current = sr;
    return () => sr.abort();
  }, [adicionarPorFala]);

  /** Liga o microfone apontando para um destino. Ouve uma frase e para. */
  function ligarMicrofone(alvo: "itens" | "recebido" | "novoPreco") {
    const sr = reconhecimento.current;
    if (!sr) return;
    destino.current = alvo;
    if (alvo === "itens") setDigitado("");
    setOuvindo(true);
    setErro(false);
    setAviso(
      alvo === "recebido"
        ? "Ouvindo. Diga o valor entregue."
        : alvo === "novoPreco"
          ? "Ouvindo. Diga o preço."
          : "Ouvindo. Diga um produto."
    );
    try {
      sr.start();
    } catch {
      /* já iniciado */
    }
  }

  function desligarMicrofone() {
    reconhecimento.current?.stop();
    setOuvindo(false);
    setAviso("");
  }

  function alternarMicrofone() {
    if (ouvindo) {
      desligarMicrofone();
      return;
    }
    ligarMicrofone("itens");
  }

  // ---------- ações do carrinho ----------
  function mudarQuantidade(chave: string, delta: number) {
    setItens((atuais) =>
      atuais
        .map((i) =>
          i.chave === chave
            ? {
                ...i,
                quantidade: Number(
                  (i.quantidade + (i.produto.tipo_venda === "quilo" ? delta * 0.1 : delta)).toFixed(3)
                ),
              }
            : i
        )
        .filter((i) => i.quantidade > 0)
    );
  }

  function remover(chave: string) {
    setItens((atuais) => atuais.filter((i) => i.chave !== chave));
  }

  function novaVenda() {
    reconhecimento.current?.abort();
    setOuvindo(false);
    limparCarrinho();
    setFinalizada(null);
    setPagamento(null);
    setFechada(false);
    setAviso("");
    setErro(false);
    setDigitado("");
    setRecebido("");
    setPixAprovado(false);
    escolhaAberta.current = false;
    setEscolha(null);
    fecharNovo();
  }

  function fechar() {
    if (!pagamento || itens.length === 0 || faltaDinheiro) return;
    reconhecimento.current?.abort();
    setOuvindo(false);
    setFinalizada(itens);
    limparCarrinho();
    setFechada(true);
  }

  // ---------- venda finalizada ----------
  if (fechada) {
    const rotulo = PAGAMENTOS.find((p) => p.valor === pagamento)?.rotulo;
    return (
      <main className="tela">
        <section className="etiqueta">
          <h1 className="nome">Venda concluída</h1>
          <p className="meta">
            {itensVenda.length} {itensVenda.length === 1 ? "item" : "itens"} · {rotulo}
          </p>
          <div className="valor">
            <span className="cifrao">R$</span>
            <span className="numero">{moeda.format(total)}</span>
          </div>
        </section>

        <ul className="lista">
          {itensVenda.map((i) => (
            <li key={i.chave}>
              <FotoProduto id={i.produto.id} />
              <span className="rotulo-item">
                {i.produto.nome}
                <span className="sub">
                  {formatarQuantidade(i.quantidade, i.produto.tipo_venda)} × R${" "}
                  {moeda.format(Number(i.produto.preco))}
                </span>
              </span>
              <span className="preco">
                R$ {moeda.format(Number(i.produto.preco) * i.quantidade)}
              </span>
            </li>
          ))}
        </ul>

        {emDinheiro && (
          <section className="fechamento">
            <div className="linha-troco">
              <span>Recebido</span>
              <strong>R$ {moeda.format(valorRecebido)}</strong>
            </div>
            <div className="linha-troco destaque">
              <span>Troco</span>
              <strong>R$ {moeda.format(Math.max(0, troco))}</strong>
            </div>
          </section>
        )}

        <button className="botao primario grande" onClick={novaVenda}>
          Nova venda
        </button>
      </main>
    );
  }

  // ---------- venda em andamento ----------
  return (
    <main className="tela">
      <header className="marca">
        Venda <span>•</span> {itens.length} {itens.length === 1 ? "item" : "itens"}
      </header>

      <div className="campo">
        <input
          value={digitado}
          onChange={(e) => {
            if (ouvindo) desligarMicrofone();
            setDigitado(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && digitado.trim()) {
              adicionarPorFala(digitado);
              setDigitado("");
            }
          }}
          placeholder="Fale ou digite: 200 gramas de tomate"
          aria-label="Item da venda"
          autoComplete="off"
        />
        {procurando && <span className="girando" aria-label="Buscando" />}

        <button
          type="button"
          className="microfone"
          data-ouvindo={ouvindo}
          disabled={!disponivel}
          onClick={alternarMicrofone}
          aria-label={ouvindo ? "Parar de ouvir" : "Falar os itens"}
          title={disponivel ? undefined : "Este navegador não reconhece fala. Use o Chrome."}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <p className="dica" data-erro={erro} role="status" aria-live="polite">
        {aviso}
      </p>

      {escolha && (
        <section className="escolha">
          <p className="escolha-titulo">
            {escolha.opcoes.length} produtos parecidos com “{escolha.termo}”. Qual entra?
          </p>

          <ul className="escolha-lista">
            {escolha.opcoes.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => confirmarEscolha(p)}>
                  <FotoProduto id={p.id} />
                  <span className="rotulo-item">
                    {p.nome}
                    <span className="sub">
                      {[p.categoria, formatarQuantidade(escolha.quantidade, p.tipo_venda)]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className="preco">
                    R$ {moeda.format(Number(p.preco))}/{sufixo(p.tipo_venda)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <button type="button" className="botao neutro" onClick={cancelarEscolha}>
            Nenhum desses
          </button>
        </section>
      )}

      {novo && (
        <section className="escolha">
          <p className="escolha-titulo">
            “{novo.nome}” não está no cadastro. Tire a foto e informe o preço para
            incluir agora e já colocar na venda.
          </p>

          <div className="grade-form">
            <div className="rotulo largo">
              <CampoFoto
                rotulo="Foto do produto"
                preview={novaFoto ?? ""}
                aoEscolher={(d) => {
                  setNovaFoto(d);
                  setErro(false);
                }}
                aoRemover={novaFoto ? () => setNovaFoto(null) : undefined}
                aoErro={(m) => {
                  setErro(true);
                  setAviso(m);
                }}
                aoIdentificarNome={(nome) => setNovo((n) => (n ? { ...n, nome } : n))}
              />
            </div>

            <label className="rotulo largo">
              Nome
              <span className="entrada">
                <input
                  value={novo.nome}
                  onChange={(e) => setNovo({ ...novo, nome: e.target.value })}
                  autoComplete="off"
                />
              </span>
            </label>

            <label className="rotulo">
              Preço de venda
              <span
                className="entrada"
                data-moeda="true"
                data-ouvindo={ouvindo && destino.current === "novoPreco"}
              >
                <span className="prefixo">R$</span>
                <input
                  value={novoPreco}
                  inputMode="decimal"
                  placeholder="0,00"
                  onChange={(e) => {
                    if (ouvindo) desligarMicrofone();
                    setNovoPreco(mascararMoeda(e.target.value));
                  }}
                />
                <button
                  type="button"
                  className="mic-campo"
                  data-ouvindo={ouvindo && destino.current === "novoPreco"}
                  disabled={!disponivel}
                  onClick={() =>
                    ouvindo && destino.current === "novoPreco"
                      ? desligarMicrofone()
                      : ligarMicrofone("novoPreco")
                  }
                  aria-label="Falar o preço"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                  </svg>
                </button>
              </span>
            </label>

            <label className="rotulo">
              Vendido por
              <span className="entrada">
                <select
                  value={novo.tipoVenda}
                  onChange={(e) => setNovo({ ...novo, tipoVenda: e.target.value })}
                >
                  {TIPOS_VENDA.map((t) => (
                    <option key={t.valor} value={t.valor}>
                      {t.rotulo}
                    </option>
                  ))}
                </select>
              </span>
            </label>

            <label className="rotulo">
              Embalagem
              <span className="entrada">
                <select
                  value={novo.embalagem}
                  onChange={(e) => setNovo({ ...novo, embalagem: e.target.value })}
                >
                  {EMBALAGENS.map((emb) => (
                    <option key={emb.valor} value={emb.valor}>
                      {emb.rotulo}
                    </option>
                  ))}
                </select>
              </span>
            </label>

            <label className="rotulo">
              Quantidade em estoque
              <span className="entrada">
                <input
                  value={novo.estoque}
                  inputMode="decimal"
                  placeholder="12"
                  onChange={(e) => setNovo({ ...novo, estoque: e.target.value })}
                />
              </span>
            </label>

            <p className="ajuda-voz largo-linha">
              Aviso de estoque baixo (opcional): quando a quantidade chegar nesse número ou menos,
              o produto entra nos alertas dos Relatórios.
            </p>

            <label className="rotulo">
              Avisar quando cair até
              <span className="entrada">
                <input
                  value={novo.estoqueMinimo}
                  inputMode="decimal"
                  placeholder="ex.: 2"
                  onChange={(e) => setNovo({ ...novo, estoqueMinimo: e.target.value })}
                />
              </span>
            </label>

            <label className="rotulo">
              Contando em
              <span className="entrada">
                <select
                  value={novo.estoqueMinimoEmbalagem}
                  onChange={(e) => setNovo({ ...novo, estoqueMinimoEmbalagem: e.target.value })}
                >
                  {EMBALAGENS.map((emb) => (
                    <option key={emb.valor} value={emb.valor}>
                      {emb.rotulo}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </div>

          <div className="acoes">
            <button
              type="button"
              className="botao primario"
              onClick={salvarNovo}
              disabled={salvandoNovo}
            >
              {salvandoNovo ? "Incluindo…" : "Incluir e adicionar à venda"}
            </button>
            <button type="button" className="botao neutro" onClick={cancelarNovo}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      {itens.length === 0 && !procurando && !escolha && !novo ? (
        <p className="vazio">
          Toque no microfone e diga um item por vez: “um pirulito”. Toque de novo
          para o próximo: “duzentos gramas de tomate”, “um maço de cigarro”.
        </p>
      ) : (
        <ul className="lista">
          {procurando && (
            <li className="linha-buscando">
              <span className="girando" />
              Procurando o produto…
            </li>
          )}
          {itens.map((i) => (
            <li key={i.chave}>
              <FotoProduto id={i.produto.id} />
              <span className="rotulo-item">
                {i.produto.nome}
                <span className="sub">
                  R$ {moeda.format(Number(i.produto.preco))}/{sufixo(i.produto.tipo_venda)}
                </span>
              </span>

              <span className="contador">
                <button
                  className="botao mini"
                  onClick={() => mudarQuantidade(i.chave, -1)}
                  aria-label={`Diminuir ${i.produto.nome}`}
                >
                  −
                </button>
                <span className="qtd">
                  {formatarQuantidade(i.quantidade, i.produto.tipo_venda)}
                </span>
                <button
                  className="botao mini"
                  onClick={() => mudarQuantidade(i.chave, 1)}
                  aria-label={`Aumentar ${i.produto.nome}`}
                >
                  +
                </button>
              </span>

              <span className="preco">
                R$ {moeda.format(Number(i.produto.preco) * i.quantidade)}
              </span>

              <button
                className="botao mini perigo"
                onClick={() => remover(i.chave)}
                aria-label={`Tirar ${i.produto.nome}`}
              >
                Tirar
              </button>
            </li>
          ))}
        </ul>
      )}

      {itens.length > 0 && (
        <section className="fechamento">
          <div className="linha-total">
            <span>Total</span>
            <strong>R$ {moeda.format(total)}</strong>
          </div>

          <p className="rotulo-pagamento">Forma de pagamento</p>
          <div className="pagamentos">
            {PAGAMENTOS.map((p) => (
              <button
                key={p.valor}
                className="botao pagamento"
                data-escolhido={pagamento === p.valor}
                onClick={() => {
                  setPagamento(p.valor);
                  setPixAprovado(false);
                }}
              >
                {p.rotulo}
              </button>
            ))}
          </div>

          {emPix && (
            <PainelPix
              valor={total}
              txid={txid}
              aoAprovar={() => setPixAprovado(true)}
            />
          )}

          {emDinheiro && (
            <div className="troco">
              <label className="rotulo">
                Valor entregue
                <span
                  className="entrada"
                  data-ouvindo={ouvindo && destino.current === "recebido"}
                  data-moeda="true"
                >
                  <span className="prefixo">R$</span>
                  <input
                    value={recebido}
                    inputMode="decimal"
                    placeholder="0,00"
                    onChange={(e) => {
                      if (ouvindo) desligarMicrofone();
                      setRecebido(mascararMoeda(e.target.value));
                    }}
                  />
                  <button
                    type="button"
                    className="mic-campo"
                    data-ouvindo={ouvindo && destino.current === "recebido"}
                    disabled={!disponivel}
                    onClick={() =>
                      ouvindo && destino.current === "recebido"
                        ? desligarMicrofone()
                        : ligarMicrofone("recebido")
                    }
                    aria-label="Falar o valor entregue"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
                      <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  </button>
                </span>
              </label>

              <div className="resultado-troco" data-falta={faltaDinheiro}>
                {faltaDinheiro ? (
                  <>
                    <span>Falta</span>
                    <strong>R$ {moeda.format(total - valorRecebido)}</strong>
                  </>
                ) : (
                  <>
                    <span>Troco</span>
                    <strong>R$ {moeda.format(Math.max(0, troco))}</strong>
                  </>
                )}
              </div>
            </div>
          )}

          <div className="acoes">
            <button
              className="botao primario grande"
              onClick={fechar}
              disabled={!pagamento || faltaDinheiro}
            >
              {!pagamento
                ? "Escolha o pagamento"
                : faltaDinheiro
                  ? "Valor entregue é menor que o total"
                  : emPix && !pixAprovado
                    ? `Confirmar recebimento — R$ ${moeda.format(total)}`
                    : `Finalizar — R$ ${moeda.format(total)}`}
            </button>
            <button className="botao neutro" onClick={novaVenda}>
              Cancelar venda
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
