"use client";

import { useCallback, useEffect, useState } from "react";
import FormularioFornecedor from "@/components/FormularioFornecedor";
import { linkWhatsapp } from "@/lib/whatsapp";

type Fornecedor = {
  id: number;
  nome: string;
  documento: string | null;
  telefone: string | null;
  telefone_whatsapp: boolean;
  endereco: string | null;
  observacao: string | null;
};

const IconeZap = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.99.55 3.85 1.5 5.44L2 22l4.79-1.25a9.9 9.9 0 0 0 5.25 1.5h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.06c-.24.68-1.4 1.3-1.93 1.35-.53.05-1.02.24-3.44-.72-2.9-1.14-4.73-4.14-4.87-4.33-.14-.19-1.16-1.55-1.16-2.95 0-1.4.73-2.09.99-2.37.26-.28.57-.35.76-.35h.55c.18 0 .42-.07.65.5.24.58.81 2 .88 2.14.07.14.12.31.02.5-.09.19-.14.31-.28.47-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.19-.28.37-.23.63-.14.26.09 1.65.78 1.93.92.28.14.47.21.53.33.07.12.07.68-.17 1.36z" />
  </svg>
);

export default function Fornecedores() {
  const [itens, setItens] = useState<Fornecedor[]>([]);
  const [filtro, setFiltro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async (q: string) => {
    try {
      const r = await fetch(`/api/fornecedores?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (!r.ok) throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — "));
      setItens(d.itens);
      setErro(false);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => carregar(filtro), 250);
    return () => clearTimeout(t);
  }, [filtro, carregar]);

  async function excluir(f: Fornecedor) {
    if (!confirm(`Excluir "${f.nome}"? As contas a pagar ligadas a ele ficam sem fornecedor.`)) return;
    try {
      const r = await fetch(`/api/fornecedores/${f.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro);
      setAviso("Fornecedor excluído.");
      setErro(false);
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível excluir.");
    }
  }

  return (
    <main className="tela">
      <header className="marca">
        Fornecedores <span>•</span> {itens.length} cadastrados
      </header>

      <section className="cartao">
        <h2 className="titulo-cartao">Novo fornecedor</h2>
        <FormularioFornecedor
          aoSalvar={() => {
            setAviso("Fornecedor cadastrado.");
            setErro(false);
            carregar(filtro);
          }}
        />
      </section>

      <div className="campo simples">
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar por nome ou CNPJ"
          aria-label="Filtrar fornecedores"
          autoComplete="off"
        />
      </div>

      {aviso && (
        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      )}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">{filtro ? "Nenhum fornecedor com esse filtro." : "Nenhum fornecedor cadastrado."}</p>
      ) : (
        <ul className="lista">
          {itens.map((f) => (
            <li key={f.id}>
              <span className="rotulo-item">
                <span className="linha-com-zap">
                  {f.nome}
                  {f.telefone_whatsapp && linkWhatsapp(f.telefone) && (
                    <a
                      className="zap-link"
                      href={linkWhatsapp(f.telefone)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Enviar mensagem no WhatsApp para ${f.nome}`}
                      title="Enviar mensagem no WhatsApp"
                    >
                      {IconeZap}
                    </a>
                  )}
                </span>
                <span className="sub">
                  {[f.documento, f.telefone, f.endereco, f.observacao].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="botoes-linha">
                <button className="botao mini perigo" onClick={() => excluir(f)}>
                  Excluir
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
