"use client";

import { useCallback, useEffect, useState } from "react";
import DadosContato from "@/components/DadosContato";
import FiltroVoz from "@/components/FiltroVoz";

type FornecedorPublico = {
  id: number;
  nome: string;
  documento: string | null;
  telefone: string | null;
  telefone_whatsapp: boolean;
  endereco: string | null;
  observacao: string | null;
  pix_chave: string | null;
  email: string;
  cidade: string;
  situacao: "pendente" | "aprovado" | "reprovado";
  motivo: string | null;
  criado_em: string;
  bairros: string[];
};

const FILTROS = [
  { valor: "pendente", rotulo: "Aguardando" },
  { valor: "aprovado", rotulo: "Aprovados" },
  { valor: "reprovado", rotulo: "Reprovados" },
  { valor: "todas", rotulo: "Todas" },
];

const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export default function AdminFornecedores() {
  const [itens, setItens] = useState<FornecedorPublico[]>([]);
  const [filtro, setFiltro] = useState("todas");
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [reprovando, setReprovando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");

  const carregar = useCallback(async (situacao: string, q = "") => {
    setCarregando(true);
    try {
      const r = await fetch(
        `/api/admin/fornecedores?situacao=${situacao}&q=${encodeURIComponent(q)}`
      );
      const dados = await r.json();
      if (!r.ok) throw new Error([dados?.erro, dados?.detalhe].filter(Boolean).join(" — "));
      setItens(dados.itens);
      setErro(false);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => carregar(filtro, busca), 250);
    return () => clearTimeout(t);
  }, [filtro, busca, carregar]);

  async function decidir(id: number, situacao: "aprovado" | "reprovado", texto?: string) {
    try {
      const r = await fetch(`/api/admin/fornecedores/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situacao, motivo: texto }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setErro(false);
      setAviso(situacao === "aprovado" ? "Fornecedor aprovado." : "Fornecedor reprovado.");
      setReprovando(null);
      setMotivo("");
      await carregar(filtro, busca);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  return (
    <main className="tela">
      <header className="marca">
        Fornecedores <span>•</span> {itens.length} na lista
      </header>

      <div className="abas">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            className="botao aba"
            data-ativo={filtro === f.valor}
            onClick={() => setFiltro(f.valor)}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      <FiltroVoz valor={busca} aoMudar={setBusca} placeholder="Filtrar por nome ou e-mail" />

      {aviso && (
        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      )}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">Nenhum fornecedor nesta situação.</p>
      ) : (
        <ul className="lista">
          {itens.map((f) => (
            <li key={f.id} className="empresa">
              <span className="rotulo-item">
                {f.nome}
                <span className="sub">
                  {[f.email, f.cidade, `desde ${data.format(new Date(f.criado_em))}`]
                    .filter(Boolean)
                    .join(" · ")}
                </span>

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
                {f.situacao === "reprovado" && f.motivo && (
                  <span className="sub motivo">Motivo: {f.motivo}</span>
                )}
              </span>

              <span className="selo" data-situacao={f.situacao === "aprovado" ? "aprovada" : f.situacao === "reprovado" ? "reprovada" : "pendente"}>
                {f.situacao}
              </span>

              {reprovando === f.id ? (
                <span className="reprovacao">
                  <input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Motivo da reprovação"
                    autoFocus
                  />
                  <button
                    className="botao mini perigo"
                    onClick={() => decidir(f.id, "reprovado", motivo)}
                    disabled={!motivo.trim()}
                  >
                    Confirmar
                  </button>
                  <button
                    className="botao mini"
                    onClick={() => {
                      setReprovando(null);
                      setMotivo("");
                    }}
                  >
                    Cancelar
                  </button>
                </span>
              ) : (
                <span className="botoes-linha">
                  {f.situacao !== "aprovado" && (
                    <button className="botao mini" onClick={() => decidir(f.id, "aprovado")}>
                      Aprovar
                    </button>
                  )}
                  {f.situacao !== "reprovado" && (
                    <button className="botao mini perigo" onClick={() => setReprovando(f.id)}>
                      Reprovar
                    </button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
