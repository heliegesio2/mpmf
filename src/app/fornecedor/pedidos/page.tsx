"use client";

import { useCallback, useEffect, useState } from "react";
import { linkWhatsapp } from "@/lib/whatsapp";
import {
  qtdComUnidade,
  quando,
  reaisPedido as reais,
  STATUS_PEDIDO,
  type StatusPedido,
} from "@/lib/pedido";

type Item = { id: number; nome: string; unidade: "un" | "caixa"; qtd: number; subtotal: number };
type Pedido = {
  id: number;
  status: StatusPedido;
  observacao: string | null;
  motivo: string | null;
  total: number;
  criado_em: string;
  itens: Item[];
  empresa_nome: string;
  empresa_cidade: string | null;
  empresa_telefone: string | null;
  empresa_whatsapp: boolean;
};

const ABAS = [
  { valor: "", rotulo: "Todos" },
  { valor: "novo", rotulo: "Novos" },
  { valor: "atendido", rotulo: "Atendidos" },
];

export default function PedidosFornecedor() {
  const [itens, setItens] = useState<Pedido[]>([]);
  const [aba, setAba] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [cancelando, setCancelando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");

  const carregar = useCallback(async (situacao: string) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/fornecedor/pedidos${situacao ? `?situacao=${situacao}` : ""}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não foi possível carregar.");
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
    carregar(aba);
  }, [aba, carregar]);

  async function acao(p: Pedido, acao: "visto" | "atender" | "cancelar", mot?: string) {
    try {
      const r = await fetch(`/api/fornecedor/pedidos/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao, motivo: mot }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro);
      setAviso("Pedido atualizado.");
      setErro(false);
      setCancelando(null);
      setMotivo("");
      await carregar(aba);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  return (
    <main className="tela">
      <header className="marca">
        Meus pedidos <span>•</span> {itens.length}
      </header>

      <div className="abas">
        {ABAS.map((a) => (
          <button
            key={a.valor}
            type="button"
            className="botao aba"
            data-ativo={aba === a.valor}
            onClick={() => setAba(a.valor)}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {aviso && (
        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      )}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">Nenhum pedido {aba ? "nesse filtro" : "ainda"}.</p>
      ) : (
        <ul className="lista lista-pedidos">
          {itens.map((p) => {
            const wa = p.empresa_whatsapp ? linkWhatsapp(p.empresa_telefone) : null;
            const st = STATUS_PEDIDO[p.status];
            return (
              <li className="pedido" key={p.id}>
                <div className="pedido-cabeca estatico">
                  <span className="pedido-info">
                    <strong>{p.empresa_nome}</strong>
                    <span className="sub">
                      {[p.empresa_cidade, quando(p.criado_em)].filter(Boolean).join(" · ")} · {reais(p.total)}
                    </span>
                  </span>
                  <span className="pedido-status" data-sinal={st.sinal}>
                    {st.rotulo}
                  </span>
                </div>

                <ul className="pedido-itens">
                  {p.itens.map((i) => (
                    <li key={i.id}>
                      {i.nome} — {qtdComUnidade(i.qtd, i.unidade)} · {reais(i.subtotal)}
                    </li>
                  ))}
                </ul>
                {p.observacao && <p className="sub">Obs.: {p.observacao}</p>}
                {p.motivo && <p className="sub motivo">Motivo: {p.motivo}</p>}

                {cancelando === p.id ? (
                  <div className="reprovacao">
                    <input
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value)}
                      placeholder="Motivo do cancelamento (opcional)"
                    />
                    <button className="botao mini perigo" onClick={() => acao(p, "cancelar", motivo)}>
                      Confirmar
                    </button>
                    <button className="botao mini" onClick={() => setCancelando(null)}>
                      Voltar
                    </button>
                  </div>
                ) : (
                  <div className="botoes-linha">
                    {wa && (
                      <a className="botao mini" href={wa} target="_blank" rel="noreferrer">
                        WhatsApp
                      </a>
                    )}
                    {p.status === "novo" && (
                      <button className="botao mini" onClick={() => acao(p, "visto")}>
                        Marcar visto
                      </button>
                    )}
                    {(p.status === "novo" || p.status === "visto") && (
                      <>
                        <button className="botao mini destaque" onClick={() => acao(p, "atender")}>
                          Atendido
                        </button>
                        <button className="botao mini perigo" onClick={() => setCancelando(p.id)}>
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
