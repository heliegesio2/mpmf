"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVoz } from "@/lib/useVoz";
import { rotuloEmbalagem, sufixo } from "@/lib/tipos";
import { comprimirParaDataURL } from "@/lib/imagemCliente";

type Produto = {
  id: number;
  nome: string;
  categoria: string | null;
  local: string | null;
  unidade: string;
  tipo_venda: string;
  preco: string;
  preco_compra: string;
  estoque: string;
  estoque_minimo: string | null;
  estoque_minimo_embalagem: string | null;
  tem_foto?: boolean;
};

const CHAVE_FOTO = "mpmf.novoProdutoFoto";
const CHAVE_FLASH = "mpmf.produtoFlash";

/** Limite geral pra quem não configurou aviso próprio no produto. */
const LIMIAR_PADRAO = 3;

function estoqueCritico(p: Produto): boolean {
  const est = Number(p.estoque);
  const limite = p.estoque_minimo != null ? Number(p.estoque_minimo) : LIMIAR_PADRAO;
  return Number.isFinite(est) && est <= limite;
}

const moeda = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function Produtos() {
  const router = useRouter();
  const [itens, setItens] = useState<Produto[]>([]);
  const [filtro, setFiltro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [lendoFoto, setLendoFoto] = useState(false);
  const fotoInput = useRef<HTMLInputElement>(null);

  const { ouvir, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      if (campoAtual.current === "filtro") setFiltro(texto);
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  const carregar = useCallback(async (termo: string) => {
    try {
      const r = await fetch(`/api/produtos?todos=1&q=${encodeURIComponent(termo)}`);
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setItens(dados.itens);
      setErro(false);
    } catch {
      setErro(true);
      setAviso("Não foi possível carregar a lista.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => carregar(filtro), 250);
    return () => clearTimeout(t);
  }, [filtro, carregar]);

  // aviso rápido depois de salvar/excluir na tela de formulário
  useEffect(() => {
    try {
      const flash = sessionStorage.getItem(CHAVE_FLASH);
      if (flash) {
        sessionStorage.removeItem(CHAVE_FLASH);
        setAviso(flash);
        setErro(false);
      }
    } catch {
      /* sem sessionStorage */
    }
  }, []);

  async function novoPorFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setLendoFoto(true);
    setErro(false);
    try {
      const dataUrl = await comprimirParaDataURL(arquivo);
      try {
        sessionStorage.setItem(CHAVE_FOTO, dataUrl);
      } catch {
        /* sem sessionStorage: segue sem a foto pré-carregada */
      }
      router.push("/produtos/novo");
    } catch {
      setErro(true);
      setAviso("Não consegui usar essa foto. Tente outra.");
      setLendoFoto(false);
    } finally {
      if (fotoInput.current) fotoInput.current.value = "";
    }
  }

  async function excluir(p: Produto) {
    if (!confirm(`Excluir "${p.nome}"? Essa ação não tem volta.`)) return;
    try {
      const r = await fetch(`/api/produtos/${p.id}`, { method: "DELETE" });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setAviso("Produto excluído.");
      setErro(false);
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível excluir o produto.");
    }
  }

  return (
    <main className="tela">
      <header className="marca">
        Produtos <span>•</span> {itens.length} cadastrados
      </header>

      <div className="acoes acoes-produtos">
        <Link href="/produtos/novo" className="botao primario">
          + Novo produto
        </Link>
        <button
          type="button"
          className="botao neutro"
          onClick={() => fotoInput.current?.click()}
          disabled={lendoFoto}
        >
          {lendoFoto ? "Lendo a foto…" : "📷 Novo produto por foto"}
        </button>
        <Link href="/produtos/estoque-foto" className="botao neutro">
          📦 Atualizar estoque por foto
        </Link>
        <input
          ref={fotoInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => novoPorFoto(e.target.files?.[0])}
        />
      </div>

      <div className="campo simples">
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar por nome do produto"
          aria-label="Filtrar produtos"
          autoComplete="off"
        />
        <button
          type="button"
          className="mic-campo"
          data-ouvindo={ouvindoCampo === "filtro"}
          disabled={!disponivel}
          onClick={() => ouvir("filtro")}
          aria-label="Falar o filtro"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {aviso && (
        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      )}

      {carregando ? (
        <p className="vazio">Carregando produtos…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">
          {filtro ? "Nenhum produto com esse filtro." : "Nenhum produto cadastrado ainda."}
        </p>
      ) : (
        <div className="grade-produtos">
          {itens.map((p) => {
            const c = Number(p.preco_compra);
            const v = Number(p.preco);
            const m = c > 0 ? ((v - c) / c) * 100 : null;
            const critico = estoqueCritico(p);
            return (
              <article className="card-produto" key={p.id}>
                <div className="card-produto-foto">
                  {p.tem_foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/produtos/${p.id}/foto`} alt={p.nome} />
                  ) : (
                    <span className="sem-foto" aria-hidden="true">
                      📷
                    </span>
                  )}
                </div>

                <div className="card-produto-corpo">
                  <strong className="card-produto-nome">{p.nome}</strong>
                  <span className="sub">
                    {[p.categoria, rotuloEmbalagem(p.unidade)].filter(Boolean).join(" · ")}
                  </span>

                  <div className="card-produto-valores">
                    <span className="preco">
                      R$ {moeda.format(v)}/{sufixo(p.tipo_venda)}
                    </span>
                    <span className="custo">
                      custo R$ {moeda.format(c)}
                      {m !== null && ` · ${m.toFixed(0)}%`}
                    </span>
                  </div>

                  <span className="estoque-cel" data-critico={critico}>
                    {p.estoque} em estoque{critico ? " · repor" : ""}
                  </span>
                </div>

                <div className="card-produto-acoes">
                  <Link href={`/produtos/editar/${p.id}`} className="botao mini">
                    Editar
                  </Link>
                  <button className="botao mini perigo" onClick={() => excluir(p)}>
                    Excluir
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
