"use client";

import { useCallback, useEffect, useState } from "react";
import FormularioCliente from "@/components/FormularioCliente";
import FotoAmpliavel from "@/components/FotoAmpliavel";
import DadosContato from "@/components/DadosContato";
import FiltroVoz from "@/components/FiltroVoz";

type Cliente = {
  id: number;
  nome: string;
  cpf: string | null;
  telefone: string | null;
  whatsapp: boolean;
  endereco: string;
  cep: string | null;
  nota: number | null;
  saldo_fiado?: number;
};

const moeda = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Clientes() {
  const [itens, setItens] = useState<Cliente[]>([]);
  const [filtro, setFiltro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  const carregar = useCallback(async (q: string) => {
    try {
      const r = await fetch(`/api/clientes?q=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro);
      setItens(d.itens);
      setErro(false);
    } catch {
      setErro(true);
      setAviso("Não foi possível carregar os clientes.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => carregar(filtro), 250);
    return () => clearTimeout(t);
  }, [filtro, carregar]);

  async function excluir(c: Cliente) {
    if (!confirm(`Excluir "${c.nome}"? Os fiados dele também somem. Essa ação não tem volta.`)) return;
    try {
      const r = await fetch(`/api/clientes/${c.id}`, { method: "DELETE" });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro);
      setAviso("Cliente excluído.");
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
        Clientes <span>•</span> {itens.length} cadastrados
      </header>

      <section className="cartao">
        <h2 className="titulo-cartao">Novo cliente</h2>
        <FormularioCliente
          aoSalvar={() => {
            setAviso("Cliente cadastrado.");
            setErro(false);
            carregar(filtro);
          }}
        />
      </section>

      <FiltroVoz valor={filtro} aoMudar={setFiltro} placeholder="Filtrar por nome ou CPF" />


      {aviso && (
        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      )}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">{filtro ? "Nenhum cliente com esse filtro." : "Nenhum cliente cadastrado."}</p>
      ) : (
        <ul className="lista">
          {itens.map((c) => (
            <li key={c.id}>
              <FotoAmpliavel className="miniatura-produto" src={`/api/clientes/${c.id}/foto`} alt={c.nome} />
              <span className="rotulo-item">
                {c.nome}
                {c.nota != null && <span className="sub">nota {c.nota}/10</span>}
                <DadosContato
                  documento={c.cpf}
                  telefone={c.telefone}
                  whatsapp={c.whatsapp}
                  local={c.endereco}
                />
              </span>
              {c.saldo_fiado ? (
                <span className="estoque-cel" data-critico="true">
                  deve R$ {moeda.format(c.saldo_fiado)}
                </span>
              ) : null}
              <span className="botoes-linha">
                <button className="botao mini perigo" onClick={() => excluir(c)}>
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
