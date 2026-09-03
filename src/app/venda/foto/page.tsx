"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { comprimirImagem } from "@/lib/imagemCliente";
import { useCarrinho, type ProdutoCarrinho } from "@/lib/carrinho";
import { formatarMoeda } from "@/lib/moeda";
import { sufixo } from "@/lib/tipos";

type Prod = { id: number; nome: string; preco: number; tipo_venda: string };
type ItemDetectado = {
  descricaoDetectada: string;
  quantidade: number;
  principal: Prod | null;
  alternativas: Prod[];
};
type Linha = {
  det: ItemDetectado;
  escolhido: Prod | null;
  quantidade: string;
  incluir: boolean;
};

const moeda = (v: number) => "R$ " + formatarMoeda(Math.round(v * 100));

export default function VendaPorFoto() {
  const router = useRouter();
  const { setItens: setCarrinho } = useCarrinho();
  const inputRef = useRef<HTMLInputElement>(null);

  const [fotos, setFotos] = useState<File[]>([]);
  const [analisando, setAnalisando] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [trocando, setTrocando] = useState<number | null>(null);
  const [buscaTermo, setBuscaTermo] = useState("");
  const [buscaResult, setBuscaResult] = useState<Prod[]>([]);

  function adicionarFotos(fl: FileList | null) {
    if (!fl) return;
    setFotos((f) => [...f, ...Array.from(fl)].slice(0, 6));
    if (inputRef.current) inputRef.current.value = "";
  }

  async function analisar() {
    if (fotos.length === 0) return;
    setAnalisando(true);
    setErro(false);
    setAviso(`Lendo ${fotos.length} foto(s)…`);
    setLinhas([]);
    try {
      const comp = await Promise.all(fotos.map((a, i) => comprimirImagem(a, `balcao-${i}.jpg`)));
      const fd = new FormData();
      comp.forEach((a) => fd.append("fotos", a));
      const r = await fetch("/api/venda/foto", { method: "POST", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não foi possível ler a foto.");

      const dets: ItemDetectado[] = d.itens ?? [];
      if (dets.length === 0) {
        setAviso("Não reconheci nenhum produto na foto.");
        return;
      }
      setLinhas(
        dets.map((det) => ({
          det,
          escolhido: det.principal,
          quantidade: String(det.quantidade),
          incluir: Boolean(det.principal),
        }))
      );
      const semMatch = dets.filter((x) => !x.principal).length;
      setAviso(
        `${dets.length} produtos reconhecidos` +
          (semMatch ? ` · ${semMatch} não estão no catálogo` : "") +
          ". Confira e adicione ao carrinho."
      );
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível ler a foto.");
    } finally {
      setAnalisando(false);
    }
  }

  function set(i: number, patch: Partial<Linha>) {
    setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  }

  async function buscar(termo: string) {
    setBuscaTermo(termo);
    if (termo.trim().length < 2) {
      setBuscaResult([]);
      return;
    }
    try {
      const d = await fetch(`/api/produtos?q=${encodeURIComponent(termo)}`).then((r) => r.json());
      setBuscaResult(
        (d.itens ?? []).slice(0, 6).map((p: { id: number; nome: string; preco: string; tipo_venda: string }) => ({
          id: p.id,
          nome: p.nome,
          preco: Number(p.preco),
          tipo_venda: p.tipo_venda,
        }))
      );
    } catch {
      setBuscaResult([]);
    }
  }

  const marcados = linhas.filter((l) => l.incluir && l.escolhido);
  const total = marcados.reduce((s, l) => {
    const q = Number(l.quantidade.replace(",", ".")) || 0;
    return s + (l.escolhido?.preco ?? 0) * q;
  }, 0);

  function adicionarAoCarrinho() {
    if (marcados.length === 0) {
      setErro(true);
      setAviso("Marque ao menos um produto pra incluir.");
      return;
    }
    setCarrinho((atuais) => {
      const copia = [...atuais];
      for (const l of marcados) {
        const p = l.escolhido!;
        const q = Math.round((Number(l.quantidade.replace(",", ".")) || 1) * 1000) / 1000;
        const idx = copia.findIndex((i) => i.produto.id === p.id);
        if (idx >= 0) {
          copia[idx] = {
            ...copia[idx],
            quantidade: Number((copia[idx].quantidade + q).toFixed(3)),
          };
        } else {
          const produto: ProdutoCarrinho = {
            id: p.id,
            nome: p.nome,
            tipo_venda: p.tipo_venda,
            preco: String(p.preco),
          };
          copia.push({ chave: `${p.id}-${Date.now()}`, produto, quantidade: q });
        }
      }
      return copia;
    });
    router.push("/venda");
  }

  return (
    <main className="tela">
      <header className="marca">
        Venda por foto <span>•</span> balcão
      </header>

      <section className="cartao">
        <p className="dica">
          Fotografe os produtos que o cliente pôs no balcão. O sistema reconhece cada um, procura no
          seu catálogo e monta o carrinho.
        </p>

        <div className="venda-foto-thumbs">
          {fotos.map((f, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={URL.createObjectURL(f)} alt="" />
          ))}
        </div>

        <div className="acoes">
          <button type="button" className="botao neutro" onClick={() => inputRef.current?.click()}>
            {fotos.length === 0 ? "📷 Tirar / escolher foto" : "+ Outra foto"}
          </button>
          {fotos.length > 0 && (
            <button
              type="button"
              className="botao primario"
              onClick={analisar}
              disabled={analisando}
            >
              {analisando ? "Lendo…" : "Ler produtos"}
            </button>
          )}
          {fotos.length > 0 && !analisando && (
            <button type="button" className="botao mini perigo" onClick={() => setFotos([])}>
              Limpar
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => adicionarFotos(e.target.files)}
        />

        {aviso && (
          <p className="dica" data-erro={erro} role="status" aria-live="polite">
            {aviso}
          </p>
        )}
      </section>

      {linhas.length > 0 && (
        <>
          <ul className="lista lista-venda-foto">
            {linhas.map((l, i) => {
              const p = l.escolhido;
              const porPeso = p?.tipo_venda === "quilo";
              return (
                <li className="venda-foto-item" key={i} data-sem={!p}>
                  <label className="venda-foto-incluir">
                    <input
                      type="checkbox"
                      checked={l.incluir}
                      disabled={!p}
                      onChange={(e) => set(i, { incluir: e.target.checked })}
                    />
                  </label>

                  <div className="venda-foto-corpo">
                    {p ? (
                      <>
                        <strong>{p.nome}</strong>
                        <span className="sub">
                          {moeda(p.preco)}/{sufixo(p.tipo_venda)} · detectado: “{l.det.descricaoDetectada}”
                        </span>
                        {porPeso && (
                          <span className="sub" data-erro="true">
                            ⚠️ produto por peso — a foto não diz o peso, confira a quantidade
                          </span>
                        )}
                        <div className="venda-foto-controles">
                          <input
                            className="pedir-qtd"
                            inputMode="decimal"
                            value={l.quantidade}
                            onChange={(e) => set(i, { quantidade: e.target.value })}
                            aria-label="Quantidade"
                          />
                          <span className="pedir-preco">{moeda(p.preco * (Number(l.quantidade.replace(",", ".")) || 0))}</span>
                          <button
                            type="button"
                            className="botao mini"
                            onClick={() => {
                              setTrocando(trocando === i ? null : i);
                              setBuscaTermo("");
                              setBuscaResult([]);
                            }}
                          >
                            trocar
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <strong>não encontrei no catálogo</strong>
                        <span className="sub">detectado: “{l.det.descricaoDetectada}”</span>
                        <div className="venda-foto-controles">
                          <button
                            type="button"
                            className="botao mini"
                            onClick={() => {
                              setTrocando(trocando === i ? null : i);
                              setBuscaTermo(l.det.descricaoDetectada);
                              buscar(l.det.descricaoDetectada);
                            }}
                          >
                            procurar
                          </button>
                          <Link className="botao mini" href="/produtos/novo">
                            cadastrar
                          </Link>
                        </div>
                      </>
                    )}

                    {trocando === i && (
                      <div className="venda-foto-troca">
                        {l.det.alternativas.length > 0 && (
                          <div className="venda-foto-alts">
                            {l.det.alternativas.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                className="botao mini"
                                onClick={() => {
                                  set(i, { escolhido: a, incluir: true });
                                  setTrocando(null);
                                }}
                              >
                                {a.nome} · {moeda(a.preco)}
                              </button>
                            ))}
                          </div>
                        )}
                        <input
                          className="filtro-bairro"
                          value={buscaTermo}
                          onChange={(e) => buscar(e.target.value)}
                          placeholder="Buscar produto pelo nome"
                        />
                        {buscaResult.map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            className="botao mini"
                            onClick={() => {
                              set(i, { escolhido: b, incluir: true });
                              setTrocando(null);
                              setBuscaResult([]);
                            }}
                          >
                            {b.nome} · {moeda(b.preco)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          <section className="cartao pedido-fechamento">
            <div className="linha-total">
              <span>{marcados.length} item(ns)</span>
              <strong>{moeda(total)}</strong>
            </div>
            <div className="acoes">
              <button className="botao primario grande" onClick={adicionarAoCarrinho}>
                Adicionar ao carrinho
              </button>
              <Link className="botao neutro" href="/venda">
                Voltar pra venda
              </Link>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
