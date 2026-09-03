"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CampoFoto from "@/components/CampoFoto";
import { CampoVoz } from "@/components/CampoVoz";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";
import { moedaParaNumero, paraMoeda } from "@/lib/moeda";
import { CATEGORIAS_FORNECEDOR_PRODUTO } from "@/lib/fornecedorProduto";

const FLASH = "mpmf.fornProdutoFlash";

type ProdutoApi = {
  id: number;
  nome: string;
  categoria: string;
  preco_unidade: number | null;
  preco_desconto: number | null;
  desconto_qtd_min: number | null;
  preco_caixa: number | null;
  caixa_qtd: number | null;
  tem_foto: boolean;
};

export default function FormularioFornecedorProduto({ produtoId }: { produtoId?: number }) {
  const router = useRouter();
  const editando = produtoId != null;

  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [categoriaLivre, setCategoriaLivre] = useState("");
  const [categoriasUsadas, setCategoriasUsadas] = useState<string[]>([]);

  const [precoUnidade, setPrecoUnidade] = useState("");
  const [temDesconto, setTemDesconto] = useState(false);
  const [descontoQtd, setDescontoQtd] = useState("");
  const [precoDesconto, setPrecoDesconto] = useState("");
  const [temCaixa, setTemCaixa] = useState(false);
  const [caixaQtd, setCaixaQtd] = useState("");
  const [precoCaixa, setPrecoCaixa] = useState("");

  const [fotoOriginal, setFotoOriginal] = useState(""); // como veio da câmera
  const [fotoMelhorada, setFotoMelhorada] = useState(""); // com fundo branco (IA)
  const [usarMelhorada, setUsarMelhorada] = useState(true);
  const [fotoAtualUrl, setFotoAtualUrl] = useState(""); // foto já salva (modo edição)
  const [melhorando, setMelhorando] = useState(false);

  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(false);
  const [aviso, setAviso] = useState("");

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const k = campoAtual.current;
      if (k === "nome") setNome(capitalizar(texto));
      else if (k === "precoUnidade") setPrecoUnidade(paraMoeda(texto));
      else if (k === "precoDesconto") setPrecoDesconto(paraMoeda(texto));
      else if (k === "precoCaixa") setPrecoCaixa(paraMoeda(texto));
      setErro(false);
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });
  const voz = (campo: string) => ({
    campo,
    ouvindo: ouvindoCampo === campo,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/fornecedor/produtos");
      const d = await r.json();
      if (r.ok) setCategoriasUsadas(d.categorias ?? []);
      if (editando) {
        const it: ProdutoApi | undefined = (d.itens ?? []).find(
          (p: ProdutoApi) => p.id === produtoId
        );
        if (!it) throw new Error("Produto não encontrado.");
        setNome(it.nome);
        const known = (CATEGORIAS_FORNECEDOR_PRODUTO as readonly string[]).includes(it.categoria);
        setCategoria(it.categoria ? (known ? it.categoria : "outros") : "");
        if (it.categoria && !known) setCategoriaLivre(it.categoria);
        setPrecoUnidade(it.preco_unidade != null ? paraMoeda(it.preco_unidade) : "");
        if (it.preco_desconto != null) {
          setTemDesconto(true);
          setPrecoDesconto(paraMoeda(it.preco_desconto));
          setDescontoQtd(it.desconto_qtd_min ? String(it.desconto_qtd_min) : "");
        }
        if (it.preco_caixa != null) {
          setTemCaixa(true);
          setPrecoCaixa(paraMoeda(it.preco_caixa));
          setCaixaQtd(it.caixa_qtd ? String(it.caixa_qtd) : "");
        }
        if (it.tem_foto) setFotoAtualUrl(`/api/fornecedor/produtos/${produtoId}/foto`);
      }
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, [editando, produtoId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function aoEscolherFoto(dataUrl: string) {
    setErro(false);
    setFotoOriginal(dataUrl);
    setFotoMelhorada("");
    setFotoAtualUrl("");
    setUsarMelhorada(true);
    setMelhorando(true);
    try {
      const r = await fetch("/api/fornecedor/produtos/melhorar-foto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto: dataUrl }),
      });
      const d = await r.json();
      if (r.ok && d.melhorada && d.foto) setFotoMelhorada(d.foto);
      else setUsarMelhorada(false);
    } catch {
      setUsarMelhorada(false);
    } finally {
      setMelhorando(false);
    }
  }

  const fotoParaSalvar = () => {
    if (!fotoOriginal) return undefined; // não mexe na foto atual
    return usarMelhorada && fotoMelhorada ? fotoMelhorada : fotoOriginal;
  };

  const categoriaFinal =
    categoria === "outros" ? categoriaLivre.trim() : categoria;

  function validar(): string | null {
    if (nome.trim().length < 2) return "Informe o nome do produto.";
    if (moedaParaNumero(precoUnidade) <= 0 && moedaParaNumero(precoCaixa) <= 0)
      return "Informe pelo menos o preço por unidade ou o da caixa.";
    if (temDesconto && (moedaParaNumero(precoDesconto) <= 0 || Number(descontoQtd) < 2))
      return "No desconto, informe a quantidade mínima (2+) e o preço.";
    if (temCaixa && moedaParaNumero(precoCaixa) <= 0)
      return "Informe o preço da caixa.";
    return null;
  }

  async function salvar() {
    const problema = validar();
    if (problema) {
      setErro(true);
      setAviso(problema);
      return;
    }
    setSalvando(true);
    setErro(false);
    try {
      const corpo = {
        nome: nome.trim(),
        categoria: categoriaFinal,
        precoUnidade: moedaParaNumero(precoUnidade) || null,
        precoDesconto: temDesconto ? moedaParaNumero(precoDesconto) || null : null,
        descontoQtdMin: temDesconto ? Number(descontoQtd) || null : null,
        precoCaixa: temCaixa ? moedaParaNumero(precoCaixa) || null : null,
        caixaQtd: temCaixa ? Number(caixaQtd) || null : null,
        foto: fotoParaSalvar(),
      };
      const r = await fetch(
        editando ? `/api/fornecedor/produtos/${produtoId}` : "/api/fornecedor/produtos",
        {
          method: editando ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        }
      );
      const d = await r.json();
      if (!r.ok) throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — "));
      try {
        sessionStorage.setItem(FLASH, editando ? "Produto atualizado." : "Produto adicionado ao seu catálogo.");
      } catch {
        /* sem sessionStorage */
      }
      router.push("/fornecedor/produtos");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <main className="tela">
        <p className="vazio">Carregando…</p>
      </main>
    );
  }

  const previewFoto =
    (usarMelhorada && fotoMelhorada) || fotoOriginal || fotoAtualUrl || "";

  return (
    <main className="tela">
      <header className="marca">
        {editando ? "Editar produto" : "Novo produto"} <span>•</span> catálogo
      </header>

      <section className="cartao">
        <p className="ajuda-voz" data-erro={!disponivel}>
          {disponivel
            ? "Toque no microfone do campo e fale."
            : "Este navegador não reconhece fala. Abra no Chrome ou no Edge."}
        </p>

        <div className="grade-form">
          <div className="rotulo largo">
            <CampoFoto
              rotulo="Foto do produto"
              semCaptura
              alta
              urlIdentificar="/api/fornecedor/produtos/identificar-foto"
              aoIdentificarNome={(n) => {
                if (!nome.trim()) setNome(n);
              }}
              preview={previewFoto}
              aoEscolher={aoEscolherFoto}
              aoRemover={
                fotoOriginal || fotoAtualUrl
                  ? () => {
                      setFotoOriginal("");
                      setFotoMelhorada("");
                      setFotoAtualUrl("");
                    }
                  : undefined
              }
              aoErro={(m) => {
                setErro(true);
                setAviso(m);
              }}
            />
            {melhorando && <p className="dica">✨ Melhorando a imagem…</p>}
            {fotoOriginal && fotoMelhorada && !melhorando && (
              <div className="melhorar-foto">
                <button
                  type="button"
                  className="botao mini"
                  data-escolhido={usarMelhorada}
                  onClick={() => setUsarMelhorada(true)}
                >
                  ✨ Com fundo branco
                </button>
                <button
                  type="button"
                  className="botao mini"
                  data-escolhido={!usarMelhorada}
                  onClick={() => setUsarMelhorada(false)}
                >
                  Foto original
                </button>
              </div>
            )}
          </div>

          <CampoVoz
            rotulo="Nome do produto"
            placeholder="Ex.: Salgadinho Fandangos 43g"
            largo
            valor={nome}
            aoMudar={setNome}
            {...voz("nome")}
          />

          <div className="rotulo largo">
            <span className="campo-foto-rotulo">Categoria</span>
            <div className="categorias-conta">
              {CATEGORIAS_FORNECEDOR_PRODUTO.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="botao pagamento"
                  data-escolhido={categoria === c}
                  onClick={() => setCategoria(c)}
                >
                  {c}
                </button>
              ))}
              {categoriasUsadas.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="botao pagamento"
                  data-escolhido={categoria === c}
                  onClick={() => setCategoria(c)}
                >
                  {c}
                </button>
              ))}
              <button
                type="button"
                className="botao pagamento"
                data-escolhido={categoria === "outros"}
                onClick={() => setCategoria("outros")}
              >
                Outros
              </button>
            </div>
            {categoria === "outros" && (
              <input
                className="filtro-bairro"
                value={categoriaLivre}
                onChange={(e) => setCategoriaLivre(e.target.value)}
                placeholder="Digite a categoria (ex.: bebidas quentes)"
              />
            )}
          </div>

          <CampoVoz
            rotulo="Preço por unidade"
            placeholder="0,00"
            moeda
            largo
            valor={precoUnidade}
            aoMudar={setPrecoUnidade}
            {...voz("precoUnidade")}
          />

          <label className="rotulo largo check-whatsapp">
            <input
              type="checkbox"
              checked={temDesconto}
              onChange={(e) => setTemDesconto(e.target.checked)}
            />
            Tem desconto por quantidade
          </label>
          {temDesconto && (
            <>
              <label className="rotulo">
                A partir de quantas unidades
                <input
                  type="number"
                  min={2}
                  inputMode="numeric"
                  value={descontoQtd}
                  onChange={(e) => setDescontoQtd(e.target.value)}
                  placeholder="Ex.: 10"
                />
              </label>
              <CampoVoz
                rotulo="Preço por unidade nesse volume"
                placeholder="0,00"
                moeda
                valor={precoDesconto}
                aoMudar={setPrecoDesconto}
                {...voz("precoDesconto")}
              />
            </>
          )}

          <label className="rotulo largo check-whatsapp">
            <input
              type="checkbox"
              checked={temCaixa}
              onChange={(e) => setTemCaixa(e.target.checked)}
            />
            Vende a caixa / fardo fechado
          </label>
          {temCaixa && (
            <>
              <label className="rotulo">
                Unidades por caixa (opcional)
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={caixaQtd}
                  onChange={(e) => setCaixaQtd(e.target.value)}
                  placeholder="Ex.: 24"
                />
              </label>
              <CampoVoz
                rotulo="Preço da caixa"
                placeholder="0,00"
                moeda
                valor={precoCaixa}
                aoMudar={setPrecoCaixa}
                {...voz("precoCaixa")}
              />
            </>
          )}
        </div>

        <div className="acoes">
          <button className="botao primario" onClick={salvar} disabled={salvando || melhorando}>
            {salvando ? "Salvando…" : editando ? "Salvar" : "Adicionar ao catálogo"}
          </button>
          <button
            type="button"
            className="botao neutro"
            onClick={() => router.push("/fornecedor/produtos")}
            disabled={salvando}
          >
            Cancelar
          </button>
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>
    </main>
  );
}
