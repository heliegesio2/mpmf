"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import CampoFoto from "@/components/CampoFoto";
import { CampoVoz } from "@/components/CampoVoz";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";
import { moedaParaNumero, paraMoeda } from "@/lib/moeda";
import { CATEGORIAS_FORNECEDOR_PRODUTO, TIPOS_VENDA, type TipoVenda } from "@/lib/fornecedorProduto";

const FLASH = "mpmf.fornProdutoFlash";

type ProdutoApi = {
  id: number;
  nome: string;
  categoria: string;
  tipo_venda: string;
  preco_unidade: number | null;
  preco_desconto: number | null;
  desconto_qtd_min: number | null;
  desconto_pct: number | null;
  preco_caixa: number | null;
  caixa_qtd: number | null;
  permite_unidade: boolean;
  aceita_urgencia: boolean;
  taxa_urgencia: number | null;
  tem_foto: boolean;
};

export default function FormularioFornecedorProduto({ produtoId }: { produtoId?: number }) {
  const router = useRouter();
  const editando = produtoId != null;

  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [categoriaLivre, setCategoriaLivre] = useState("");
  const [categoriasUsadas, setCategoriasUsadas] = useState<string[]>([]);

  const [tipoVenda, setTipoVenda] = useState<TipoVenda>("unidade");
  const [preco, setPreco] = useState("");
  const [temDesconto, setTemDesconto] = useState(false);
  const [descontoPct, setDescontoPct] = useState("");
  const [descontoQtd, setDescontoQtd] = useState("");
  const [caixaQtd, setCaixaQtd] = useState("");
  const [permiteUnidade, setPermiteUnidade] = useState(false);
  const [aceitaUrgencia, setAceitaUrgencia] = useState(false);
  const [taxaUrgencia, setTaxaUrgencia] = useState("");
  const [tinhaCaixaAntiga, setTinhaCaixaAntiga] = useState(false);

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
      else if (k === "preco") setPreco(paraMoeda(texto));
      else if (k === "taxaUrgencia") setTaxaUrgencia(paraMoeda(texto));
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
        const tipo = (TIPOS_VENDA.some((t) => t.valor === it.tipo_venda)
          ? it.tipo_venda
          : "unidade") as TipoVenda;
        setTipoVenda(tipo);
        const base = tipo === "caixa" ? it.preco_caixa : it.preco_unidade;
        setPreco(base != null ? paraMoeda(base) : "");
        // produto antigo: tinha preço de unidade E de caixa — a caixa se perde ao salvar
        setTinhaCaixaAntiga(tipo === "unidade" && it.preco_caixa != null);
        // desconto: percentual (novo) ou convertido do preço fixo antigo
        let pct = it.desconto_pct;
        if (pct == null && it.preco_desconto != null && it.preco_unidade) {
          pct = Math.round((1 - it.preco_desconto / it.preco_unidade) * 1000) / 10;
        }
        if (pct && it.desconto_qtd_min) {
          setTemDesconto(true);
          setDescontoPct(String(pct).replace(".", ","));
          setDescontoQtd(String(it.desconto_qtd_min));
        }
        if (tipo === "caixa") {
          setCaixaQtd(it.caixa_qtd ? String(it.caixa_qtd) : "");
          setPermiteUnidade(Boolean(it.permite_unidade));
        }
        if (it.aceita_urgencia) {
          setAceitaUrgencia(true);
          setTaxaUrgencia(it.taxa_urgencia ? paraMoeda(it.taxa_urgencia) : "");
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

  const tipoAtual = TIPOS_VENDA.find((t) => t.valor === tipoVenda)!;
  const ehCaixa = tipoVenda === "caixa";
  const pctNum = Number(descontoPct.replace(",", "."));
  const precoPorUnidadeAvulsa =
    ehCaixa && Number(caixaQtd) > 0 && moedaParaNumero(preco) > 0
      ? moedaParaNumero(preco) / Number(caixaQtd)
      : null;

  function validar(): string | null {
    if (nome.trim().length < 2) return "Informe o nome do produto.";
    if (moedaParaNumero(preco) <= 0) return `Informe o preço por ${tipoAtual.rotulo.toLowerCase()}.`;
    if (ehCaixa && permiteUnidade && !(Number(caixaQtd) > 0))
      return "Pra vender também por unidade, informe quantas unidades vêm na caixa.";
    if (temDesconto && !(pctNum > 0 && pctNum < 100)) return "No desconto, informe o percentual (entre 0 e 100).";
    if (temDesconto && !(Number(descontoQtd) >= 2)) return "No desconto, informe a quantidade mínima (2 ou mais).";
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
        tipoVenda,
        preco: moedaParaNumero(preco) || null,
        descontoPct: temDesconto ? pctNum || null : null,
        descontoQtdMin: temDesconto ? Number(descontoQtd) || null : null,
        caixaQtd: ehCaixa ? Number(caixaQtd) || null : null,
        permiteUnidade: ehCaixa && permiteUnidade,
        aceitaUrgencia,
        taxaUrgencia: aceitaUrgencia ? moedaParaNumero(taxaUrgencia) || null : null,
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
              camera
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

          <div className="rotulo largo">
            <span className="campo-foto-rotulo">Venda por</span>
            <div className="categorias-conta">
              {TIPOS_VENDA.map((t) => (
                <button
                  key={t.valor}
                  type="button"
                  className="botao pagamento"
                  data-escolhido={tipoVenda === t.valor}
                  onClick={() => setTipoVenda(t.valor)}
                >
                  {t.rotulo}
                </button>
              ))}
            </div>
          </div>

          <CampoVoz
            rotulo={`Preço por ${tipoAtual.rotulo.toLowerCase()}`}
            placeholder="0,00"
            moeda
            largo
            valor={preco}
            aoMudar={setPreco}
            {...voz("preco")}
          />
          {tinhaCaixaAntiga && (
            <p className="dica largo">
              Este produto tinha também um preço de caixa. Ao salvar, ele passa a ser vendido só por
              unidade — se vende em caixa, escolha “Caixa” em “Venda por”.
            </p>
          )}

          {ehCaixa && (
            <>
              <label className="rotulo">
                Unidades por caixa
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={caixaQtd}
                  onChange={(e) => setCaixaQtd(e.target.value)}
                  placeholder="Ex.: 24"
                />
              </label>
              <label className="rotulo largo check-whatsapp">
                <input
                  type="checkbox"
                  checked={permiteUnidade}
                  onChange={(e) => setPermiteUnidade(e.target.checked)}
                />
                Também vende por unidade (a loja pode pedir avulso)
              </label>
              {permiteUnidade && (
                <p className="dica largo">
                  {precoPorUnidadeAvulsa != null
                    ? `A unidade avulsa sai a R$ ${precoPorUnidadeAvulsa.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })} (preço da caixa ÷ unidades por caixa).`
                    : "Informe o preço e as unidades por caixa pra calcular a unidade avulsa."}
                </p>
              )}
            </>
          )}

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
                Desconto (%)
                <input
                  type="text"
                  inputMode="decimal"
                  value={descontoPct}
                  onChange={(e) => setDescontoPct(e.target.value.replace(/[^\d,.]/g, ""))}
                  placeholder="Ex.: 5"
                />
              </label>
              <label className="rotulo">
                A partir de quantas {tipoAtual.plural === tipoAtual.sing ? tipoAtual.sing : tipoAtual.plural}
                <input
                  type="number"
                  min={2}
                  inputMode="numeric"
                  value={descontoQtd}
                  onChange={(e) => setDescontoQtd(e.target.value)}
                  placeholder="Ex.: 10"
                />
              </label>
            </>
          )}

          <label className="rotulo largo check-whatsapp">
            <input
              type="checkbox"
              checked={aceitaUrgencia}
              onChange={(e) => setAceitaUrgencia(e.target.checked)}
            />
            Aceita pedido com urgência
          </label>
          {aceitaUrgencia && (
            <>
              <CampoVoz
                rotulo="Taxa de urgência (opcional)"
                placeholder="0,00"
                moeda
                largo
                valor={taxaUrgencia}
                aoMudar={setTaxaUrgencia}
                {...voz("taxaUrgencia")}
              />
              <p className="dica largo">
                Quando a loja pedir com urgência, ela vê que vai pagar essa taxa (somada ao pedido).
                Deixe em branco se não cobra taxa.
              </p>
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
