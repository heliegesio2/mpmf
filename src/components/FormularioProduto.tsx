"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CampoVoz, SelecaoVoz } from "@/components/CampoVoz";
import CampoFoto from "@/components/CampoFoto";
import { useVoz } from "@/lib/useVoz";
import { EMBALAGENS, TIPOS_VENDA, rotuloEmbalagem, sufixo } from "@/lib/tipos";
import { capitalizar, numeroFalado, opcaoFalada } from "@/lib/voz";
import { moedaParaNumero, paraMoeda } from "@/lib/moeda";

/** Embalagens que não têm preço "fechado" separado — a unidade já é o item. */
const SEM_PRECO_EMBALAGEM = new Set(["unidade", "granel"]);

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
  preco_embalagem: string | null;
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
  precoEmbalagem: string;
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
  precoEmbalagem: "",
  estoque: "",
  estoqueMinimo: "",
  estoqueMinimoEmbalagem: "unidade",
};

/** foto tirada na lista ("Novo produto por foto") e passada pra cá. */
const CHAVE_FOTO = "mpmf.novoProdutoFoto";
/** aviso rápido mostrado na lista depois de salvar. */
const CHAVE_FLASH = "mpmf.produtoFlash";

const moeda = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const num = (v: string) => moedaParaNumero(v);

export default function FormularioProduto({ id }: { id?: number }) {
  const router = useRouter();
  const editando = id !== undefined;

  const [form, setForm] = useState<Formulario>(VAZIO);
  const [fotoPreview, setFotoPreview] = useState("");
  const [fotoNova, setFotoNova] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(editando);
  const [salvando, setSalvando] = useState(false);
  const [identificando, setIdentificando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const iniciou = useRef(false);

  // ---------- voz ----------
  const aplicarFala = useCallback((campo: string, texto: string) => {
    setErro(false);
    if (
      campo === "preco" ||
      campo === "precoCompra" ||
      campo === "precoEmbalagem" ||
      campo === "estoque" ||
      campo === "estoqueMinimo"
    ) {
      const n = numeroFalado(texto);
      if (n === null) {
        setErro(true);
        setAviso(`Não entendi "${texto}" como número. Tente "quatro e cinquenta".`);
        return;
      }
      const ehDinheiro = campo === "preco" || campo === "precoCompra" || campo === "precoEmbalagem";
      setForm((f) => ({ ...f, [campo]: ehDinheiro ? paraMoeda(n) : String(n) }));
      setAviso("");
      return;
    }
    if (campo === "unidade" || campo === "tipoVenda" || campo === "estoqueMinimoEmbalagem") {
      const lista = campo === "tipoVenda" ? TIPOS_VENDA : EMBALAGENS;
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

  // ---------- carrega o produto (edição) ou a foto vinda da lista (novo) ----------
  useEffect(() => {
    if (iniciou.current) return;
    iniciou.current = true;

    if (editando) {
      (async () => {
        try {
          const r = await fetch(`/api/produtos/${id}`);
          const d = await r.json();
          if (!r.ok) throw new Error(d?.erro ?? "Produto não encontrado.");
          const p: Produto = d.item;
          setForm({
            nome: p.nome,
            categoria: p.categoria ?? "",
            local: p.local ?? "",
            unidade: p.unidade || "unidade",
            tipoVenda: p.tipo_venda,
            precoCompra: paraMoeda(p.preco_compra),
            preco: paraMoeda(p.preco),
            precoEmbalagem: p.preco_embalagem ? paraMoeda(p.preco_embalagem) : "",
            estoque: p.estoque,
            estoqueMinimo: p.estoque_minimo ? String(Number(p.estoque_minimo)) : "",
            estoqueMinimoEmbalagem: p.estoque_minimo_embalagem || "unidade",
          });
          setFotoPreview(p.tem_foto ? `/api/produtos/${p.id}/foto?t=${Date.now()}` : "");
        } catch (e) {
          setErro(true);
          setAviso(e instanceof Error ? e.message : "Não foi possível carregar o produto.");
        } finally {
          setCarregando(false);
        }
      })();
      return;
    }

    // novo: veio uma foto da lista?
    let daFoto = "";
    try {
      daFoto = sessionStorage.getItem(CHAVE_FOTO) ?? "";
      sessionStorage.removeItem(CHAVE_FOTO);
    } catch {
      /* sem sessionStorage */
    }
    if (daFoto.startsWith("data:image/")) {
      setFotoNova(daFoto);
      setFotoPreview(daFoto);
      identificarNome(daFoto);
    }
  }, [editando, id]);

  async function identificarNome(dataUrl: string) {
    setIdentificando(true);
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
      }
    } catch {
      /* identificação é um plus */
    } finally {
      setIdentificando(false);
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
        ...(fotoNova !== null ? { foto: fotoNova } : {}),
      };
      const r = await fetch(editando ? `/api/produtos/${id}` : "/api/produtos", {
        method: editando ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error(
          [d?.erro, d?.detalhe].filter(Boolean).join(" — ") || "Não foi possível salvar."
        );
      }

      try {
        sessionStorage.setItem(CHAVE_FLASH, editando ? "Produto alterado." : "Produto incluído.");
      } catch {
        /* sem sessionStorage: sem aviso, mas salvou */
      }
      router.push("/produtos");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
      setSalvando(false);
    }
  }

  const mudar = (k: keyof Formulario) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const comum = (k: keyof Formulario) => ({
    campo: k as string,
    valor: form[k],
    aoMudar: mudar(k),
    ouvindo: ouvindoCampo === k,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  const compra = num(form.precoCompra || "0");
  const venda = num(form.preco || "0");
  const temMargem = compra > 0 && venda > 0;
  const lucro = venda - compra;
  const margem = temMargem ? (lucro / compra) * 100 : 0;

  return (
    <main className="tela">
      <header className="marca">
        {editando ? "Alterar produto" : "Novo produto"}
      </header>

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : (
        <section className="cartao" data-editando={editando}>
          <p className="ajuda-voz" data-erro={!disponivel}>
            {disponivel
              ? "Toque no microfone do campo e fale. Para valores, diga “quatro e cinquenta”."
              : "Este navegador não reconhece fala. Abra no Chrome ou no Edge para usar os microfones."}
          </p>

          <div className="grade-form">
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
                aoIdentificarNome={(nome) => setForm((f) => (f.nome.trim() ? f : { ...f, nome }))}
              />
              {identificando && <p className="campo-foto-dica">Lendo a foto pra sugerir o nome…</p>}
            </div>

            <CampoVoz rotulo="Nome" placeholder="Gulão Assado" largo {...comum("nome")} />

            <SelecaoVoz rotulo="Vendido por" opcoes={TIPOS_VENDA} {...comum("tipoVenda")} />
            <SelecaoVoz rotulo="Embalagem" opcoes={EMBALAGENS} {...comum("unidade")} />

            <CampoVoz rotulo="Preço de compra" placeholder="0,00" moeda {...comum("precoCompra")} />
            <CampoVoz
              rotulo={`Preço de venda por ${sufixo(form.tipoVenda)}`}
              placeholder="0,00"
              moeda
              {...comum("preco")}
            />

            {!SEM_PRECO_EMBALAGEM.has(form.unidade) && (
              <CampoVoz
                rotulo={`Preço por ${rotuloEmbalagem(form.unidade).toLowerCase()} fechado`}
                placeholder="0,00"
                moeda
                {...comum("precoEmbalagem")}
              />
            )}

            {!SEM_PRECO_EMBALAGEM.has(form.unidade) && (
              <p className="ajuda-voz largo-linha">
                Vende o {rotuloEmbalagem(form.unidade).toLowerCase()} inteiro por um preço diferente do
                avulso/por {sufixo(form.tipoVenda)}? Informe aqui. Deixe em branco se só vende avulso.
              </p>
            )}

            <CampoVoz rotulo="Quantidade em estoque" placeholder="12" numerico {...comum("estoque")} />

            <p className="ajuda-voz largo-linha">
              Aviso de estoque baixo: quando a quantidade chegar nesse número (ou menos), o produto
              entra nos alertas dos Relatórios. Deixe em branco pra usar o padrão da loja.
            </p>

            <CampoVoz rotulo="Avisar quando cair até" placeholder="ex.: 2" numerico {...comum("estoqueMinimo")} />
            <SelecaoVoz rotulo="Contando em" opcoes={EMBALAGENS} {...comum("estoqueMinimoEmbalagem")} />

            <CampoVoz rotulo="Categoria" placeholder="Salgadinho" {...comum("categoria")} />
            <CampoVoz rotulo="Local na loja" placeholder="Balcão vitrine - 2a fila" largo {...comum("local")} />
          </div>

          {temMargem && (
            <p className="margem" data-negativa={lucro < 0}>
              {lucro < 0 ? "Prejuízo" : "Lucro"} de R$ {moeda.format(Math.abs(lucro))} por{" "}
              {sufixo(form.tipoVenda)} — margem de {margem.toFixed(1)}%
            </p>
          )}

          <div className="acoes">
            <button className="botao primario" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : editando ? "Salvar alteração" : "Incluir produto"}
            </button>
            <button
              className="botao neutro"
              onClick={() => router.push("/produtos")}
              disabled={salvando}
            >
              Cancelar
            </button>
          </div>

          <p className="dica" data-erro={erro} role="status" aria-live="polite">
            {aviso}
          </p>
        </section>
      )}
    </main>
  );
}
