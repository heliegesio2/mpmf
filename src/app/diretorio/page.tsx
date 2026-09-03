"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DadosContato from "@/components/DadosContato";

type Bairro = { id: number; nome: string };
type Fornecedor = {
  id: number;
  nome: string;
  documento: string | null;
  telefone: string | null;
  telefone_whatsapp: boolean;
  endereco: string | null;
  observacao: string | null;
  pix_chave: string | null;
  cidade: string;
  bairros: string[];
  slug: string | null;
  tem_catalogo: boolean;
};

export default function Diretorio() {
  const [cidade, setCidade] = useState("");
  const [semCidade, setSemCidade] = useState(false);
  const [bairros, setBairros] = useState<Bairro[]>([]);
  const [filtroBairro, setFiltroBairro] = useState("");
  const [itens, setItens] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [importados, setImportados] = useState<Set<number>>(new Set());

  const carregar = useCallback(async (bairro: string) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/diretorio?bairro=${encodeURIComponent(bairro)}`);
      const d = await r.json();
      if (!r.ok) throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — "));
      setSemCidade(Boolean(d.semCidade));
      setCidade(d.cidade ?? "");
      setBairros(d.bairros ?? []);
      setItens(d.itens ?? []);
      setErro(false);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => carregar(filtroBairro), 200);
    return () => clearTimeout(t);
  }, [filtroBairro, carregar]);

  // preenche o filtro com o bairro da loja na primeira carga
  useEffect(() => {
    fetch("/api/diretorio")
      .then((r) => r.json())
      .then((d) => {
        if (d?.bairro && !filtroBairro) setFiltroBairro(d.bairro);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function adicionar(f: Fornecedor) {
    try {
      const r = await fetch("/api/diretorio/importar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fornecedorPublicoId: f.id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro);
      setImportados((s) => new Set(s).add(f.id));
      setErro(false);
      setAviso(`${f.nome} adicionado aos seus fornecedores.`);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível adicionar.");
    }
  }

  return (
    <main className="tela">
      <header className="marca">
        Buscar fornecedores {cidade && <span>• {cidade}</span>}
      </header>

      {semCidade ? (
        <p className="vazio">
          Informe a <strong>cidade</strong> da sua loja em{" "}
          <Link href="/configuracoes">Configurações da empresa</Link> para ver os fornecedores da
          região.
        </p>
      ) : (
        <>
          <section className="cartao">
            <label className="rotulo">
              Filtrar por bairro
              <span className="entrada">
                <select value={filtroBairro} onChange={(e) => setFiltroBairro(e.target.value)}>
                  <option value="">Todos os bairros</option>
                  {bairros.map((b) => (
                    <option key={b.id} value={b.nome}>
                      {b.nome}
                    </option>
                  ))}
                </select>
              </span>
            </label>
          </section>

          {aviso && (
            <p className="dica" data-erro={erro} role="status" aria-live="polite">
              {aviso}
            </p>
          )}

          {carregando ? (
            <p className="vazio">Carregando…</p>
          ) : itens.length === 0 ? (
            <p className="vazio">
              Nenhum fornecedor aprovado {filtroBairro ? `atende o bairro ${filtroBairro}` : `em ${cidade}`}{" "}
              ainda.
            </p>
          ) : (
            <ul className="lista">
              {itens.map((f) => (
                <li key={f.id} className="empresa">
                  <span className="rotulo-item">
                    {f.nome}
                    <DadosContato
                      documento={f.documento}
                      telefone={f.telefone}
                      whatsapp={f.telefone_whatsapp}
                      local={[f.endereco, f.cidade].filter(Boolean).join(", ") || null}
                      pixChave={f.pix_chave}
                    />
                    {f.bairros.length > 0 && (
                      <span className="bairros-chips">
                        {f.bairros.map((b) => (
                          <span className="bairro-chip" key={b}>
                            {b}
                          </span>
                        ))}
                      </span>
                    )}
                    {f.observacao && <span className="sub">Obs.: {f.observacao}</span>}
                  </span>

                  <span className="botoes-linha">
                    {f.tem_catalogo && f.slug && (
                      <>
                        <Link className="botao mini" href={`/pedido/${f.slug}`}>
                          Solicitar produto
                        </Link>
                        <a
                          className="botao mini"
                          href={`/p/${f.slug}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver catálogo
                        </a>
                      </>
                    )}
                    {importados.has(f.id) ? (
                      <span className="selo" data-situacao="aprovada">
                        adicionado
                      </span>
                    ) : (
                      <button className="botao mini" onClick={() => adicionar(f)}>
                        + Meus fornecedores
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
