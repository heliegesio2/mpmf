"use client";

import { useEffect, useState } from "react";
import FormularioCliente from "@/components/FormularioCliente";

export type ClienteLite = { id: number; nome: string };

type Props = {
  valor: ClienteLite | null;
  aoEscolher: (c: ClienteLite | null) => void;
};

/** Busca/seleção de cliente, com "+ cadastrar novo" embutido. */
export default function SeletorCliente({ valor, aoEscolher }: Props) {
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<ClienteLite[]>([]);
  const [cadastrando, setCadastrando] = useState(false);

  useEffect(() => {
    if (valor || cadastrando) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/clientes?q=${encodeURIComponent(busca)}`);
        const d = await r.json();
        if (r.ok) setOpcoes((d.itens as ClienteLite[]).slice(0, 6));
      } catch {
        /* silencioso */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [busca, valor, cadastrando]);

  if (valor) {
    return (
      <div className="rotulo largo">
        Cliente
        <div className="fornecedor-escolhido">
          <span>{valor.nome}</span>
          <button type="button" className="botao mini" onClick={() => aoEscolher(null)}>
            Trocar
          </button>
        </div>
      </div>
    );
  }

  if (cadastrando) {
    return (
      <div className="rotulo largo">
        Novo cliente
        <FormularioCliente
          aoSalvar={(c) => {
            setCadastrando(false);
            aoEscolher(c);
          }}
          aoCancelar={() => setCadastrando(false)}
        />
      </div>
    );
  }

  return (
    <div className="rotulo largo">
      Cliente
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar cliente pelo nome"
        autoComplete="off"
      />
      <div className="fornecedor-opcoes">
        {opcoes.map((o) => (
          <button key={o.id} type="button" onClick={() => aoEscolher(o)}>
            {o.nome}
          </button>
        ))}
        <button type="button" className="fornecedor-novo" onClick={() => setCadastrando(true)}>
          + Cadastrar novo cliente
        </button>
      </div>
    </div>
  );
}
