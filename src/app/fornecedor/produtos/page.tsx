"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import FotoAmpliavel from "@/components/FotoAmpliavel";
import BotaoCopiar from "@/components/BotaoCopiar";
import { linhasDePreco } from "@/lib/fornecedorProduto";
import { comprimirParaDataURL } from "@/lib/imagemCliente";

type Produto = {
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

const FLASH = "mpmf.fornProdutoFlash";

function semAcento(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function ProdutosFornecedor() {
  const [itens, setItens] = useState<Produto[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [catSel, setCatSel] = useState("");
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  const [situacao, setSituacao] = useState("");
  const [slug, setSlug] = useState<string | null>(null);
  const [temPdf, setTemPdf] = useState(false);
  const [enviandoPdf, setEnviandoPdf] = useState(false);
  const pdfInput = useRef<HTMLInputElement>(null);
  const [fotoDoCard, setFotoDoCard] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [rp, rf] = await Promise.all([
        fetch("/api/fornecedor/produtos"),
        fetch("/api/fornecedor"),
      ]);
      const dp = await rp.json();
      if (!rp.ok) throw new Error([dp?.erro, dp?.detalhe].filter(Boolean).join(" — "));
      setItens(dp.itens ?? []);
      const df = await rf.json();
      if (rf.ok) {
        setSituacao(df.item?.situacao ?? "");
        setSlug(df.item?.slug ?? null);
        setTemPdf(Boolean(df.item?.tem_pdf));
      }
      setErro(false);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    try {
      const f = sessionStorage.getItem(FLASH);
      if (f) {
        sessionStorage.removeItem(FLASH);
        setAviso(f);
        setErro(false);
      }
    } catch {
      /* sem sessionStorage */
    }
  }, []);

  async function excluir(p: Produto) {
    if (!confirm(`Tirar "${p.nome}" do catálogo?`)) return;
    try {
      const r = await fetch(`/api/fornecedor/produtos/${p.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro);
      setAviso("Produto removido.");
      setErro(false);
      await carregar();
    } catch {
      setErro(true);
      setAviso("Não foi possível remover.");
    }
  }

  async function fotoDireta(id: number, arquivo: File | undefined) {
    if (!arquivo) return;
    setFotoDoCard(id);
    setErro(false);
    try {
      const dataUrl = await comprimirParaDataURL(arquivo);
      const r = await fetch(`/api/fornecedor/produtos/${id}/foto`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto: dataUrl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não foi possível salvar.");
      setAviso("Foto do produto salva.");
      await carregar();
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não consegui usar essa foto.");
    } finally {
      setFotoDoCard(null);
    }
  }

  async function enviarPdf(arquivo: File | undefined) {
    if (!arquivo) return;
    setEnviandoPdf(true);
    setErro(false);
    try {
      const fd = new FormData();
      fd.set("pdf", arquivo);
      const r = await fetch("/api/fornecedor/portfolio-pdf", { method: "PUT", body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não foi possível anexar.");
      setTemPdf(true);
      setAviso("PDF do portfólio anexado.");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível anexar.");
    } finally {
      setEnviandoPdf(false);
      if (pdfInput.current) pdfInput.current.value = "";
    }
  }

  async function removerPdf() {
    if (!confirm("Remover o PDF anexado?")) return;
    await fetch("/api/fornecedor/portfolio-pdf", { method: "DELETE" });
    setTemPdf(false);
    setAviso("PDF removido.");
  }

  const categorias = [...new Set(itens.map((i) => i.categoria).filter(Boolean))].sort();
  const filtrados = itens.filter((i) => {
    if (catSel && i.categoria !== catSel) return false;
    if (filtro.trim() && !semAcento(i.nome).includes(semAcento(filtro.trim()))) return false;
    return true;
  });

  const portfolioUrl =
    slug && typeof window !== "undefined" ? `${window.location.origin}/p/${slug}` : "";

  return (
    <main className="tela">
      <header className="marca">
        Meus produtos <span>•</span> {itens.length} no catálogo
      </header>

      {situacao && situacao !== "aprovado" && (
        <p className="dica">
          Seu portfólio só fica público quando o cadastro for aprovado. Você já pode montar o
          catálogo — assim que for liberado, ele entra no ar.
        </p>
      )}

      <div className="acoes acoes-produtos">
        <Link href="/fornecedor/produtos/novo" className="botao primario">
          + Novo produto
        </Link>
        {slug && (
          <a
            className="botao neutro"
            href={`/p/${slug}`}
            target="_blank"
            rel="noreferrer"
          >
            👁 Ver portfólio
          </a>
        )}
        <button
          type="button"
          className="botao neutro"
          onClick={() => pdfInput.current?.click()}
          disabled={enviandoPdf}
        >
          {enviandoPdf ? "Enviando…" : temPdf ? "📄 Trocar PDF do portfólio" : "📄 Anexar portfólio em PDF"}
        </button>
        {temPdf && (
          <button type="button" className="botao mini perigo" onClick={removerPdf}>
            Remover PDF
          </button>
        )}
        <input
          ref={pdfInput}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => enviarPdf(e.target.files?.[0])}
        />
      </div>

      {portfolioUrl && (
        <section className="cartao">
          <h2 className="titulo-cartao">Meu portfólio</h2>
          <p className="dica">Este é o link que você manda pras lojas:</p>
          <div className="contato-acoes">
            <a className="contato-chip" href={`/p/${slug}`} target="_blank" rel="noreferrer">
              🔗 {portfolioUrl}
            </a>
            <BotaoCopiar texto={portfolioUrl} />
            <a
              className="contato-chip"
              href={`https://wa.me/?text=${encodeURIComponent(`Meu catálogo: ${portfolioUrl}`)}`}
              target="_blank"
              rel="noreferrer"
            >
              Enviar no WhatsApp
            </a>
          </div>
        </section>
      )}

      <div className="campo simples">
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar por nome"
          aria-label="Filtrar produtos"
          autoComplete="off"
        />
      </div>

      {categorias.length > 0 && (
        <div className="categorias-conta">
          <button
            type="button"
            className="botao pagamento"
            data-escolhido={catSel === ""}
            onClick={() => setCatSel("")}
          >
            todas
          </button>
          {categorias.map((c) => (
            <button
              key={c}
              type="button"
              className="botao pagamento"
              data-escolhido={catSel === c}
              onClick={() => setCatSel(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {aviso && (
        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      )}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : filtrados.length === 0 ? (
        <p className="vazio">
          {itens.length === 0
            ? "Nenhum produto no catálogo ainda. Toque em “+ Novo produto”."
            : "Nenhum produto com esse filtro."}
        </p>
      ) : (
        <div className="grade-produtos">
          {filtrados.map((p) => (
            <article className="card-produto" key={p.id}>
              <div className="card-produto-foto">
                {p.tem_foto ? (
                  <FotoAmpliavel src={`/api/fornecedor/produtos/${p.id}/foto`} alt={p.nome} />
                ) : (
                  <label className="sem-foto" title="Tirar ou enviar uma foto">
                    <span aria-hidden="true">{fotoDoCard === p.id ? "⏳" : "📷"}</span>
                    <span className="sem-foto-dica">
                      {fotoDoCard === p.id ? "Salvando…" : "Adicionar foto"}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      disabled={fotoDoCard === p.id}
                      onChange={(e) => fotoDireta(p.id, e.target.files?.[0])}
                    />
                  </label>
                )}
              </div>
              <div className="card-produto-corpo">
                <strong className="card-produto-nome">{p.nome}</strong>
                {p.categoria && <span className="sub">{p.categoria}</span>}
                <div className="card-produto-valores">
                  {linhasDePreco(p).map((l) => (
                    <span className="preco" key={l}>
                      {l}
                    </span>
                  ))}
                </div>
              </div>
              <div className="card-produto-acoes">
                <Link href={`/fornecedor/produtos/editar/${p.id}`} className="botao mini">
                  Editar
                </Link>
                <button className="botao mini perigo" onClick={() => excluir(p)}>
                  Excluir
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
