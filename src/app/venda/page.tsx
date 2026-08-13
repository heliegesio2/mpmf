"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatarQuantidade, interpretarItem } from "@/lib/falaVenda";
import { sufixo } from "@/lib/tipos";
import { numeroFalado } from "@/lib/voz";
import { mascararMoeda, moedaParaNumero, paraMoeda } from "@/lib/moeda";
import PainelPix from "@/components/PainelPix";

type Produto = {
  id: number;
  nome: string;
  categoria?: string | null;
  unidade: string;
  tipo_venda: string;
  preco: string;
  score?: number;
};

/** Quando a fala casa com mais de um produto, o caixa escolhe qual entra. */
type Escolha = {
  opcoes: Produto[];
  quantidade: number;
  emPeso: boolean;
  termo: string;
};

type Item = {
  chave: string;
  produto: Produto;
  quantidade: number;
};

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

export default function Venda() {
  const [itens, setItens] = useState<Item[]>([]);
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
  /** Identificador desta venda, usado no Pix. */
  const [txid] = useState(() => `V${Date.now().toString(36).toUpperCase()}`);

  const reconhecimento = useRef<any>(null);
  const querOuvir = useRef(false);
  /** Para onde vai o que for falado: itens do carrinho ou valor entregue. */
  const destino = useRef<"itens" | "recebido">("itens");

  const total = itens.reduce(
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
          setErro(true);
          setAviso(`Não achei "${lido.termo}" no cadastro.`);
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

  // ---------- reconhecimento contínuo ----------
  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    setDisponivel(true);
    const sr = new SR();
    sr.lang = "pt-BR";
    sr.continuous = true;
    sr.interimResults = false;
    sr.maxAlternatives = 1;

    sr.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (!e.results[i].isFinal) continue;
        const texto = e.results[i][0].transcript.trim();
        if (!texto) continue;

        if (destino.current === "recebido") {
          const n = numeroFalado(texto);
          if (n === null) {
            setErro(true);
            setAviso(`Não entendi "${texto}" como valor.`);
          } else {
            setRecebido(paraMoeda(n));
            setErro(false);
            setAviso("");
          }
        } else {
          adicionarPorFala(texto);
        }
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
      // o Chrome encerra sozinho depois de um tempo; religa enquanto o caixa quiser
      if (querOuvir.current) {
        try {
          sr.start();
          return;
        } catch {
          /* ignora */
        }
      }
      setOuvindo(false);
    };

    reconhecimento.current = sr;
    return () => {
      querOuvir.current = false;
      sr.abort();
    };
  }, [adicionarPorFala]);

  /** Liga o microfone apontando para um destino. Usado no foco dos campos. */
  function ligarMicrofone(alvo: "itens" | "recebido") {
    const sr = reconhecimento.current;
    if (!sr) return;
    destino.current = alvo;
    if (querOuvir.current) return;

    querOuvir.current = true;
    setOuvindo(true);
    setErro(false);
    setAviso(
      alvo === "recebido"
        ? "Ouvindo. Diga o valor entregue."
        : "Ouvindo. Diga os itens, um de cada vez."
    );
    try {
      sr.start();
    } catch {
      /* já iniciado */
    }
  }

  function desligarMicrofone() {
    querOuvir.current = false;
    reconhecimento.current?.stop();
    setOuvindo(false);
    setAviso("");
  }

  function alternarMicrofone() {
    const sr = reconhecimento.current;
    if (!sr) return;

    destino.current = "itens";

    if (querOuvir.current) {
      querOuvir.current = false;
      sr.stop();
      setOuvindo(false);
      setAviso("");
      return;
    }

    querOuvir.current = true;
    setOuvindo(true);
    setErro(false);
    setAviso("Ouvindo. Diga os itens, um de cada vez.");
    try {
      sr.start();
    } catch {
      /* já iniciado */
    }
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
    querOuvir.current = false;
    reconhecimento.current?.stop();
    setOuvindo(false);
    setItens([]);
    setPagamento(null);
    setFechada(false);
    setAviso("");
    setErro(false);
    setDigitado("");
    setRecebido("");
    setPixAprovado(false);
    escolhaAberta.current = false;
    setEscolha(null);
  }

  function fechar() {
    if (!pagamento || itens.length === 0 || faltaDinheiro) return;
    querOuvir.current = false;
    reconhecimento.current?.stop();
    setOuvindo(false);
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
            {itens.length} {itens.length === 1 ? "item" : "itens"} · {rotulo}
          </p>
          <div className="valor">
            <span className="cifrao">R$</span>
            <span className="numero">{moeda.format(total)}</span>
          </div>
        </section>

        <ul className="lista">
          {itens.map((i) => (
            <li key={i.chave}>
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

      {itens.length === 0 && !procurando && !escolha ? (
        <p className="vazio">
          Toque no microfone e diga os itens: “um pirulito”, “duzentos gramas de
          tomate”, “um maço de cigarro”.
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
