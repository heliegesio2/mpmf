"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

const CHAVE_FLASH = "mpmf.clienteFlash";
const moeda = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Verde (bom) / amarelo (médio) / vermelho (ruim) pela nota; sem nota = neutro. */
function sinalNota(nota: number | null): "bom" | "medio" | "ruim" | undefined {
  if (nota == null) return undefined;
  if (nota >= 7) return "bom";
  if (nota >= 4) return "medio";
  return "ruim";
}

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

  useEffect(() => {
    try {
      const flash = sessionStorage.getItem(CHAVE_FLASH);
      if (flash) {
        sessionStorage.removeItem(CHAVE_FLASH);
        setAviso(flash);
        setErro(false);
      }
    } catch {
      /* sem sessionStorage */
    }
  }, []);

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

      <div className="acoes">
        <Link href="/clientes/novo" className="botao primario">
          + Novo cliente
        </Link>
      </div>

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
            <li key={c.id} data-nota={sinalNota(c.nota)}>
              <FotoAmpliavel className="miniatura-produto" src={`/api/clientes/${c.id}/foto`} alt={c.nome} />
              <span className="rotulo-item">
                {c.nome}
                <DadosContato
                  documento={c.cpf}
                  telefone={c.telefone}
                  whatsapp={c.whatsapp}
                  local={c.endereco}
                />
              </span>

              {c.nota != null && (
                <span className="nota-cliente" data-sinal={sinalNota(c.nota)} title={`Nota ${c.nota} de 10`}>
                  {c.nota}<small>/10</small>
                </span>
              )}

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
