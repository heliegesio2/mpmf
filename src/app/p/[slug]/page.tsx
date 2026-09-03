import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { portfolioPublico } from "@/lib/db";
import { linhasDePreco } from "@/lib/fornecedorProduto";
import { linkWhatsapp } from "@/lib/whatsapp";

export const revalidate = 300;

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = await portfolioPublico(slug);
  if (!p) return { title: "Catálogo não encontrado" };
  return {
    title: `${p.fornecedor.nome} — catálogo`,
    description: `Catálogo de ${p.fornecedor.nome}${
      p.fornecedor.cidade ? ` · ${p.fornecedor.cidade}` : ""
    }.`,
  };
}

export default async function PortfolioPublico({ params }: Params) {
  const { slug } = await params;
  const dados = await portfolioPublico(slug);
  if (!dados) notFound();

  const { fornecedor: f, produtos } = dados;
  const wa = linkWhatsapp(f.telefone_whatsapp ? f.telefone : null);

  // agrupa por categoria, mantendo a ordem de cadastro; sem categoria vai pro fim
  const grupos = new Map<string, typeof produtos>();
  for (const p of produtos) {
    const k = p.categoria || "Outros";
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(p);
  }
  const categorias = [...grupos.keys()].sort((a, b) =>
    a === "Outros" ? 1 : b === "Outros" ? -1 : a.localeCompare(b, "pt-BR")
  );

  return (
    <div className="pf-pagina">
      <header className="pf-topo">
        <p className="pf-eyebrow">Catálogo · fornecedor</p>
        <h1 className="pf-nome">{f.nome}</h1>
        <p className="pf-local">
          {f.cidade}
          {f.bairros.length > 0 && (
            <span className="pf-bairros">
              {f.bairros.map((b) => (
                <span className="bairro-chip" key={b}>
                  {b}
                </span>
              ))}
            </span>
          )}
        </p>
        {f.observacao && <p className="pf-obs">{f.observacao}</p>}

        <div className="pf-acoes">
          {wa && (
            <a className="botao primario" href={wa} target="_blank" rel="noreferrer">
              Falar no WhatsApp
            </a>
          )}
          {f.pix_chave && <span className="pf-pix">Pix: {f.pix_chave}</span>}
          {f.tem_pdf && (
            <a
              className="botao neutro"
              href={`/api/portfolio/${slug}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              Baixar catálogo (PDF)
            </a>
          )}
        </div>
      </header>

      {produtos.length === 0 ? (
        <p className="pf-vazio">Este catálogo ainda não tem produtos.</p>
      ) : (
        categorias.map((cat) => (
          <section className="pf-cat" key={cat}>
            <h2 className="pf-cat-titulo">{cat}</h2>
            <div className="pf-grade">
              {grupos.get(cat)!.map((p) => (
                <article className="pf-card" key={p.id}>
                  <div className="pf-foto">
                    {p.tem_foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/portfolio/${slug}/foto/${p.id}`} alt={p.nome} loading="lazy" />
                    ) : (
                      <span aria-hidden="true">📦</span>
                    )}
                  </div>
                  <div className="pf-card-corpo">
                    <strong className="pf-card-nome">{p.nome}</strong>
                    <ul className="pf-precos">
                      {linhasDePreco(p).map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))
      )}

      <footer className="pf-rodape">
        Catálogo gerado no <a href="/">PDV Já</a>
      </footer>
    </div>
  );
}
