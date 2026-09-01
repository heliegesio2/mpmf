"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CampoVoz, SelecaoVoz } from "@/components/CampoVoz";
import CampoFoto from "@/components/CampoFoto";
import { useVoz } from "@/lib/useVoz";
import { EMBALAGENS, TIPOS_VENDA, rotuloEmbalagem, sufixo } from "@/lib/tipos";
import { capitalizar, numeroFalado, opcaoFalada } from "@/lib/voz";
import { moedaParaNumero, paraMoeda } from "@/lib/moeda";
import { comprimirParaDataURL } from "@/lib/imagemCliente";

/** Limite geral usado quando o produto não tem aviso próprio configurado. */
const LIMIAR_PADRAO = 3;

function estoqueCritico(p: Produto): boolean {
  const est = Number(p.estoque);
  const limite = p.estoque_minimo != null ? Number(p.estoque_minimo) : LIMIAR_PADRAO;
  return Number.isFinite(est) && est <= limite;
}

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

type Formulario = {
  nome: string;
  categoria: string;
  local: string;
  unidade: string;
  tipoVenda: string;
  precoCompra: string;
  preco: string;
  estoque: string;
  estoqueMinimo: string;
  estoqueMinimoEmbalagem: string;
};

const VAZIO: Formulario = {
  nome: "",
  categoria: "",
  local: "",
  unidade: "unidade",
  tipoVenda: "unidade",
  precoCompra: "",
  preco: "",
  estoque: "",
  estoqueMinimo: "",
  estoqueMinimoEmbalagem: "unidade",
};

const moeda = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const num = (v: string) => moedaParaNumero(v);

function ProdutosConteudo() {
  const editarId = useSearchParams().get("editar");
  const aplicouEditarUrl = useRef(false);
  const [itens, setItens] = useState<Produto[]>([]);
  const [filtro, setFiltro] = useState("");
  const [form, setForm] = useState<Formulario>(VAZIO);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [incluindo, setIncluindo] = useState(false);
  const [lendoFoto, setLendoFoto] = useState(false);
  const fotoNovoInput = useRef<HTMLInputElement>(null);
  // foto: preview é o que aparece na tela; fotoNova só é enviada quando muda
  // (null = mantém a atual, "" = remove, "data:..." = grava a nova)
  const [fotoPreview, setFotoPreview] = useState("");
  const [fotoNova, setFotoNova] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [carregando, setCarregando] = useState(true);

  // ---------- voz ----------
  const aplicarFala = useCallback((campo: string, texto: string) => {
    setErro(false);

    if (campo === "filtro") {
      setFiltro(texto);
      return;
    }

    if (campo === "preco" || campo === "precoCompra" || campo === "estoque") {
      const n = numeroFalado(texto);
      if (n === null) {
        setErro(true);
        setAviso(`Não entendi "${texto}" como número. Tente "quatro e cinquenta".`);
        return;
      }
      const ehDinheiro = campo === "preco" || campo === "precoCompra";
      setForm((f) => ({ ...f, [campo]: ehDinheiro ? paraMoeda(n) : n }));
      setAviso("");
      return;
    }

    if (campo === "unidade" || campo === "tipoVenda") {
      const lista = campo === "unidade" ? EMBALAGENS : TIPOS_VENDA;
      const escolha = opcaoFalada(texto, lista);
      if (!escolha) {
        setErro(true);
        setAviso(`Não achei "${texto}" nas opções.`);
        return;
      }
      setForm((f) => ({ ...f, [campo]: escolha }));
      setAviso("");
      return;
    }

    setForm((f) => ({ ...f, [campo]: capitalizar(texto) }));
    setAviso("");
  }, []);

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const campo = campoAtual.current;
      if (campo) aplicarFala(campo, texto);
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  // ---------- dados ----------
  const carregar = useCallback(async (termo: string) => {
    try {
      const r = await fetch(`/api/produtos?todos=1&q=${encodeURIComponent(termo)}`);
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setItens(dados.itens);
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

  // veio da consulta de preço com "editar o item x": abre direto no formulário
  useEffect(() => {
    if (!editarId || aplicouEditarUrl.current) return;
    const alvo = itens.find((p) => String(p.id) === editarId);
    if (alvo) {
      aplicouEditarUrl.current = true;
      editar(alvo);
    }
  }, [editarId, itens]);

  function editar(p: Produto) {
    setEditandoId(p.id);
    setForm({
      nome: p.nome,
      categoria: p.categoria ?? "",
      local: p.local ?? "",
      unidade: p.unidade || "unidade",
      tipoVenda: p.tipo_venda,
      precoCompra: paraMoeda(p.preco_compra),
      preco: paraMoeda(p.preco),
      estoque: p.estoque,
      estoqueMinimo: p.estoque_minimo ? String(Number(p.estoque_minimo)) : "",
      estoqueMinimoEmbalagem: p.estoque_minimo_embalagem || "unidade",
    });
    setFotoPreview(p.tem_foto ? `/api/produtos/${p.id}/foto?t=${Date.now()}` : "");
    setFotoNova(null);
    setAviso("");
    setErro(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function limpar() {
    setEditandoId(null);
    setIncluindo(false);
    setForm(VAZIO);
    setFotoPreview("");
    setFotoNova(null);
  }

  function cancelar() {
    limpar();
    setAviso("");
    setErro(false);
  }

  /** Abre o formulário em branco pra um produto novo. */
  function novoProduto() {
    setEditandoId(null);
    setForm(VAZIO);
    setFotoPreview("");
    setFotoNova(null);
    setAviso("");
    setErro(false);
    setIncluindo(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** "Novo produto por foto": tira a foto, tenta o nome pela IA e abre o
   *  formulário já preenchido pro lojista completar preço e o resto. */
  async function novoPorFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setLendoFoto(true);
    setErro(false);
    setAviso("");
    let dataUrl = "";
    try {
      dataUrl = await comprimirParaDataURL(arquivo);
    } catch {
      setErro(true);
      setAviso("Não consegui usar essa foto. Tente outra.");
      setLendoFoto(false);
      if (fotoNovoInput.current) fotoNovoInput.current.value = "";
      return;
    }

    setEditandoId(null);
    setForm(VAZIO);
    setFotoNova(dataUrl);
    setFotoPreview(dataUrl);
    setIncluindo(true);
    window.scrollTo({ top: 0, behavior: "smooth" });

    try {
      const r = await fetch("/api/produtos/identificar-foto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto: dataUrl }),
      });
      const d = await r.json();
      if (r.ok && typeof d.nome === "string" && d.nome.trim()) {
        setForm((f) => ({ ...f, nome: d.nome.trim() }));
        setAviso("Nome sugerido pela foto — confira e informe o preço.");
      } else {
        setAviso("Não consegui ler o nome pela foto; digite e complete os dados.");
      }
    } catch {
      setAviso("Foto anexada. Digite o nome e complete os dados.");
    } finally {
      setLendoFoto(false);
      if (fotoNovoInput.current) fotoNovoInput.current.value = "";
    }
  }

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const corpo = {
        ...form,
        preco: num(form.preco),
        precoCompra: num(form.precoCompra || "0"),
        estoque: num(form.estoque),
        // só manda a foto quando ela mudou nesta edição
        ...(fotoNova !== null ? { foto: fotoNova } : {}),
      };
      const r = await fetch(
        editandoId ? `/api/produtos/${editandoId}` : "/api/produtos",
        {
          method: editandoId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        }
      );
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");

      setAviso(editandoId ? "Produto alterado." : "Produto incluído.");
      limpar();
      await carregar(filtro);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
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
      if (editandoId === p.id) limpar();
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível excluir o produto.");
    }
  }

  const mudar = (k: keyof Formulario) => (v: string) => setForm({ ...form, [k]: v });

  const comum = (k: keyof Formulario) => ({
    campo: k as string,
    valor: form[k],
    aoMudar: mudar(k),
    ouvindo: ouvindoCampo === k,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  // margem calculada ao vivo
  const compra = num(form.precoCompra || "0");
  const venda = num(form.preco || "0");
  const temMargem = compra > 0 && venda > 0;
  const lucro = venda - compra;
  const margem = temMargem ? (lucro / compra) * 100 : 0;

  const formAberto = incluindo || editandoId !== null;

  return (
    <main className="tela">
      <header className="marca">
        Produtos <span>•</span> {itens.length} cadastrados
      </header>

      {!formAberto && (
        <div className="acoes acoes-produtos">
          <button type="button" className="botao primario" onClick={novoProduto}>
            + Novo produto
          </button>
          <button
            type="button"
            className="botao neutro"
            onClick={() => fotoNovoInput.current?.click()}
            disabled={lendoFoto}
          >
            {lendoFoto ? "Lendo a foto…" : "📷 Novo produto por foto"}
          </button>
          <Link href="/produtos/estoque-foto" className="botao neutro">
            📦 Atualizar estoque por foto
          </Link>
          <input
            ref={fotoNovoInput}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(e) => novoPorFoto(e.target.files?.[0])}
          />
        </div>
      )}

      {formAberto && (
      <section className="cartao" data-editando={editandoId !== null}>
        <h2 className="titulo-cartao">
          {editandoId ? "Alterar produto" : "Incluir produto"}
        </h2>

        <p className="ajuda-voz" data-erro={!disponivel}>
          {disponivel
            ? "Toque no microfone do campo e fale. Para valores, diga “quatro e cinquenta” ou “quatro reais e cinquenta”."
            : "Este navegador não reconhece fala. Abra no Chrome ou no Edge para usar os microfones."}
        </p>

        <div className="grade-form">
          <CampoVoz rotulo="Nome" placeholder="Gulão Assado" largo {...comum("nome")} />

          <SelecaoVoz
            rotulo="Vendido por"
            opcoes={TIPOS_VENDA}
            {...comum("tipoVenda")}
          />

          <SelecaoVoz rotulo="Embalagem" opcoes={EMBALAGENS} {...comum("unidade")} />

          <CampoVoz
            rotulo="Preço de compra"
            placeholder="0,00"
            moeda
            {...comum("precoCompra")}
          />

          <CampoVoz
            rotulo="Preço de venda"
            placeholder="0,00"
            moeda
            {...comum("preco")}
          />

          <CampoVoz
            rotulo="Quantidade em estoque"
            placeholder="12"
            numerico
            {...comum("estoque")}
          />

          <p className="ajuda-voz largo-linha">
            Aviso de estoque baixo: quando a quantidade chegar nesse número (ou menos), o produto
            entra nos alertas dos Relatórios. Deixe em branco pra usar o padrão da loja.
          </p>

          <CampoVoz
            rotulo="Avisar quando cair até"
            placeholder="ex.: 2"
            numerico
            {...comum("estoqueMinimo")}
          />

          <SelecaoVoz
            rotulo="Contando em"
            opcoes={EMBALAGENS}
            {...comum("estoqueMinimoEmbalagem")}
          />

          <CampoVoz rotulo="Categoria" placeholder="Salgadinho" {...comum("categoria")} />

          <CampoVoz
            rotulo="Local na loja"
            placeholder="Balcão vitrine - 2a fila"
            largo
            {...comum("local")}
          />

          <div className="rotulo largo">
            <CampoFoto
              rotulo="Foto do produto"
              preview={fotoPreview}
              aoEscolher={(d) => {
                setFotoNova(d);
                setFotoPreview(d);
                setErro(false);
              }}
              aoRemover={() => {
                setFotoNova("");
                setFotoPreview("");
              }}
              aoErro={(m) => {
                setErro(true);
                setAviso(m);
              }}
              aoIdentificarNome={(nome) =>
                setForm((f) => (f.nome.trim() ? f : { ...f, nome }))
              }
            />
          </div>
        </div>

        {temMargem && (
          <p className="margem" data-negativa={lucro < 0}>
            {lucro < 0 ? "Prejuízo" : "Lucro"} de R$ {moeda.format(Math.abs(lucro))} por{" "}
            {sufixo(form.tipoVenda)} — margem de {margem.toFixed(1)}%
          </p>
        )}

        <div className="acoes">
          <button className="botao primario" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : editandoId ? "Salvar alteração" : "Incluir produto"}
          </button>
          <button className="botao neutro" onClick={cancelar} disabled={salvando}>
            Cancelar
          </button>
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>
      )}

      {!formAberto && (
        <>
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
                      <button className="botao mini" onClick={() => editar(p)}>
                        Editar
                      </button>
                      <button className="botao mini perigo" onClick={() => excluir(p)}>
                        Excluir
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </main>
  );
}

export default function Produtos() {
  return (
    <Suspense fallback={<main className="tela"><p className="vazio">Carregando…</p></main>}>
      <ProdutosConteudo />
    </Suspense>
  );
}
