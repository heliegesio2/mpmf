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

type Forma = "dinheiro" | "debito" | "credito" | "pix" | "fiado";

const FORMAS: { valor: Forma; rotulo: string }[] = [
  { valor: "dinheiro", rotulo: "Dinheiro" },
  { valor: "debito", rotulo: "Débito" },
  { valor: "credito", rotulo: "Crédito" },
  { valor: "pix", rotulo: "Pix" },
  { valor: "fiado", rotulo: "Fiado" },
];

const rotuloForma = (f: Forma) => FORMAS.find((x) => x.valor === f)?.rotulo ?? f;

/** Uma parte do pagamento — a venda pode ter várias (dividido). */
type PartePagamento = {
  id: string;
  forma: Forma;
  valor: number;
  pixOk?: boolean;
  clienteId?: number;
  clienteNome?: string;
};

const arredondar = (n: number) => Math.round(n * 100) / 100;

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
  const [partes, setPartes] = useState<PartePagamento[]>([]);
  const [fechada, setFechada] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [disponivel, setDisponivel] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [recebido, setRecebido] = useState("");
  const [procurando, setProcurando] = useState(false);
  /** Busca de cliente aberta pra qual parte de fiado (id da parte), ou null. */
  const [buscaCliente, setBuscaCliente] = useState<string | null>(null);
  const [termoCliente, setTermoCliente] = useState("");
  const [clientes, setClientes] = useState<{ id: number; nome: string }[]>([]);
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
  // cópia da venda no momento de fechar, pro comprovante — o carrinho em si
  // é esvaziado assim que a venda fecha (comportamento de carrinho de verdade).
  const [finalizada, setFinalizada] = useState<{ itens: Item[]; partes: PartePagamento[] } | null>(
    null
  );

  const itensVenda = fechada && finalizada ? finalizada.itens : itens;
  const partesVenda = fechada && finalizada ? finalizada.partes : partes;
  const total = arredondar(
    itensVenda.reduce((s, i) => s + Number(i.produto.preco) * i.quantidade, 0)
  );

  const somaPartes = arredondar(partes.reduce((s, p) => s + p.valor, 0));
  const falta = arredondar(Math.max(0, total - somaPartes));
  const parteDinheiro = partes.find((p) => p.forma === "dinheiro");
  const valorRecebido = num(recebido || "0");
  // troco é sobre a parte em dinheiro; sem valor entregue, assume troco exato
  const trocoBase = parteDinheiro ? (recebido ? valorRecebido : parteDinheiro.valor) : 0;
  const troco = arredondar(trocoBase - (parteDinheiro?.valor ?? 0));
  const faltaDinheiro = Boolean(parteDinheiro && recebido && valorRecebido < parteDinheiro.valor);

  const pixPendente = partes.some((p) => p.forma === "pix" && !p.pixOk);
  const fiadoSemCliente = partes.some((p) => p.forma === "fiado" && !p.clienteId);
  const podeFinalizar =
    itens.length > 0 &&
    partes.length > 0 &&
    falta <= 0.009 &&
    !faltaDinheiro &&
    !pixPendente &&
    !fiadoSemCliente;

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
      if (!r.ok) {
        throw new Error(
          [dados?.erro, dados?.detalhe].filter(Boolean).join(" — ") ||
            "Não foi possível incluir o produto."
        );
      }

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

  // ---------- pagamento dividido ----------
  useEffect(() => {
    if (buscaCliente === null) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/clientes?q=${encodeURIComponent(termoCliente)}`);
        const d = await r.json();
        if (r.ok) setClientes((d.itens ?? []).slice(0, 8).map((c: any) => ({ id: c.id, nome: c.nome })));
      } catch {
        /* ignora — o caixa tenta de novo */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [termoCliente, buscaCliente]);

  function adicionarParte(forma: Forma) {
    const restante = arredondar(Math.max(0, total - somaPartes));
    const id = `${forma}-${Date.now().toString(36)}`;
    setPartes((ps) => [...ps, { id, forma, valor: restante || 0 }]);
    if (forma === "fiado") setBuscaCliente(id);
    if (forma === "dinheiro") destino.current = "recebido";
    setErro(false);
    setAviso("");
  }

  function mudarValorParte(id: string, texto: string) {
    setPartes((ps) => ps.map((p) => (p.id === id ? { ...p, valor: num(texto), pixOk: false } : p)));
  }

  function removerParte(id: string) {
    setPartes((ps) => ps.filter((p) => p.id !== id));
    if (buscaCliente === id) setBuscaCliente(null);
  }

  function escolherCliente(parteId: string, id: number, nome: string) {
    setPartes((ps) => ps.map((p) => (p.id === parteId ? { ...p, clienteId: id, clienteNome: nome } : p)));
    setBuscaCliente(null);
    setClientes([]);
    setTermoCliente("");
  }

  function novaVenda() {
    reconhecimento.current?.abort();
    setOuvindo(false);
    limparCarrinho();
    setFinalizada(null);
    setPartes([]);
    setBuscaCliente(null);
    setFechada(false);
    setFinalizando(false);
    setAviso("");
    setErro(false);
    setDigitado("");
    setRecebido("");
    escolhaAberta.current = false;
    setEscolha(null);
    fecharNovo();
  }

  async function fechar() {
    if (!podeFinalizar || finalizando) return;
    setFinalizando(true);
    setErro(false);
    try {
      // lança os fiados antes de concluir; se algum falhar, não fecha a venda
      for (const p of partes.filter((x) => x.forma === "fiado")) {
        const r = await fetch("/api/fiado", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clienteId: p.clienteId,
            valor: p.valor,
            descricao: `Venda — ${itens.length} ${itens.length === 1 ? "item" : "itens"}`,
          }),
        });
        const d = await r.json();
        if (!r.ok) {
          throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — ") || "Falha ao lançar o fiado.");
        }
      }
      reconhecimento.current?.abort();
      setOuvindo(false);
      setFinalizada({ itens: [...itens], partes: [...partes] });
      limparCarrinho();
      setFechada(true);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível finalizar.");
    } finally {
      setFinalizando(false);
    }
  }

  // ---------- venda finalizada ----------
  if (fechada) {
    const formas = partesVenda.map((p) => rotuloForma(p.forma)).join(" + ");
    return (
      <main className="tela">
        <section className="etiqueta">
          <h1 className="nome">Venda concluída</h1>
          <p className="meta">
            {itensVenda.length} {itensVenda.length === 1 ? "item" : "itens"} · {formas}
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

        {partesVenda.length > 0 && (
          <section className="fechamento">
            {partesVenda.map((p) => (
              <div className="linha-troco" key={p.id}>
                <span>
                  {rotuloForma(p.forma)}
                  {p.forma === "fiado" && p.clienteNome ? ` — ${p.clienteNome}` : ""}
                </span>
                <strong>R$ {moeda.format(p.valor)}</strong>
              </div>
            ))}
            {troco > 0 && (
              <div className="linha-troco destaque">
                <span>Troco</span>
                <strong>R$ {moeda.format(troco)}</strong>
              </div>
            )}
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

          <p className="rotulo-pagamento">
            {partes.length === 0 ? "Forma de pagamento" : "Adicionar outra forma (dividir)"}
          </p>
          <div className="pagamentos">
            {FORMAS.map((f) => (
              <button
                key={f.valor}
                className="botao pagamento"
                onClick={() => adicionarParte(f.valor)}
              >
                {f.rotulo}
              </button>
            ))}
          </div>

          {partes.map((p) => (
            <div className="parte-pagto" key={p.id}>
              <div className="parte-linha">
                <span className="parte-forma">{rotuloForma(p.forma)}</span>
                <span className="entrada" data-moeda="true">
                  <span className="prefixo">R$</span>
                  <input
                    value={p.valor ? p.valor.toFixed(2).replace(".", ",") : ""}
                    inputMode="decimal"
                    placeholder="0,00"
                    onChange={(e) => mudarValorParte(p.id, mascararMoeda(e.target.value))}
                  />
                </span>
                <button
                  type="button"
                  className="botao mini perigo"
                  onClick={() => removerParte(p.id)}
                  aria-label={`Tirar ${rotuloForma(p.forma)}`}
                >
                  Tirar
                </button>
              </div>

              {p.forma === "pix" && p.valor > 0 && (
                <PainelPix
                  valor={p.valor}
                  txid={`${txid}-${p.id}`}
                  confirmado={Boolean(p.pixOk)}
                  aoConfirmar={() =>
                    setPartes((ps) => ps.map((x) => (x.id === p.id ? { ...x, pixOk: true } : x)))
                  }
                />
              )}

              {p.forma === "dinheiro" && (
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
                      placeholder={p.valor.toFixed(2).replace(".", ",")}
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
              )}

              {p.forma === "fiado" && (
                <div className="fiado-cliente">
                  {p.clienteNome && buscaCliente !== p.id ? (
                    <p className="parte-forma">
                      Cliente: <strong>{p.clienteNome}</strong>{" "}
                      <button
                        type="button"
                        className="botao mini"
                        onClick={() => setBuscaCliente(p.id)}
                      >
                        Trocar
                      </button>
                    </p>
                  ) : (
                    <>
                      <div className="campo simples">
                        <input
                          value={termoCliente}
                          onChange={(e) => setTermoCliente(e.target.value)}
                          placeholder="Buscar cliente por nome"
                          autoComplete="off"
                          autoFocus
                        />
                      </div>
                      <ul className="escolha-lista">
                        {clientes.map((c) => (
                          <li key={c.id}>
                            <button type="button" onClick={() => escolherCliente(p.id, c.id, c.nome)}>
                              <span className="rotulo-item">{c.nome}</span>
                            </button>
                          </li>
                        ))}
                        {clientes.length === 0 && (
                          <li className="vazio" style={{ padding: 12 }}>
                            Nenhum cliente. Cadastre em “Clientes”.
                          </li>
                        )}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}

          {partes.length > 0 && (
            <div className="resultado-troco" data-falta={falta > 0.009 || faltaDinheiro}>
              {faltaDinheiro ? (
                <>
                  <span>Falta em dinheiro</span>
                  <strong>R$ {moeda.format((parteDinheiro?.valor ?? 0) - valorRecebido)}</strong>
                </>
              ) : falta > 0.009 ? (
                <>
                  <span>Falta</span>
                  <strong>R$ {moeda.format(falta)}</strong>
                </>
              ) : troco > 0 ? (
                <>
                  <span>Troco</span>
                  <strong>R$ {moeda.format(troco)}</strong>
                </>
              ) : (
                <>
                  <span>Pago</span>
                  <strong>R$ {moeda.format(somaPartes)}</strong>
                </>
              )}
            </div>
          )}

          <div className="acoes">
            <button
              className="botao primario grande"
              onClick={fechar}
              disabled={!podeFinalizar || finalizando}
            >
              {finalizando
                ? "Finalizando…"
                : partes.length === 0
                  ? "Escolha o pagamento"
                  : falta > 0.009
                    ? `Falta R$ ${moeda.format(falta)}`
                    : fiadoSemCliente
                      ? "Escolha o cliente do fiado"
                      : pixPendente
                        ? "Confirme o Pix"
                        : faltaDinheiro
                          ? "Valor entregue menor que a parte em dinheiro"
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
