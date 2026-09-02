"use client";

import { useCallback, useEffect, useState } from "react";
import FormularioFornecedor from "@/components/FormularioFornecedor";
import DadosContato from "@/components/DadosContato";
import FiltroVoz from "@/components/FiltroVoz";

type Fornecedor = {
  id: number;
  nome: string;
  documento: string | null;
  telefone: string | null;
  telefone_whatsapp: boolean;
  endereco: string | null;
  observacao: string | null;
  pix_chave: string | null;
};

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

      <FiltroVoz valor={filtro} aoMudar={setFiltro} placeholder="Filtrar por nome ou CNPJ" />


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
                {f.nome}
                {f.observacao && <span className="sub">{f.observacao}</span>}
                <DadosContato
                  documento={f.documento}
                  telefone={f.telefone}
                  whatsapp={f.telefone_whatsapp}
                  local={f.endereco}
                  pixChave={f.pix_chave}
                />
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
