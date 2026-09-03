"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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
  fornecedor_nome: string;
  fornecedor_slug: string | null;
  fornecedor_telefone: string | null;
  fornecedor_whatsapp: boolean;
};

const FLASH = "mpmf.pedidoFlash";

export default function MeusPedidos() {
  const [itens, setItens] = useState<Pedido[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [aberto, setAberto] = useState<number | null>(null);

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/pedidos");
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

  async function cancelar(p: Pedido) {
    if (!confirm(`Cancelar o pedido pra ${p.fornecedor_nome}?`)) return;
    try {
      const r = await fetch(`/api/pedidos/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "cancelar" }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro);
      setAviso("Pedido cancelado.");
      setErro(false);
      await carregar();
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível cancelar.");
    }
  }

  return (
    <main className="tela">
      <header className="marca">
        Meus pedidos <span>•</span> {itens.length}
      </header>

      {aviso && (
        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      )}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">
          Você ainda não fez nenhum pedido. Vá em{" "}
          <Link href="/diretorio">Buscar fornecedores</Link> e toque em “Solicitar produto”.
        </p>
      ) : (
        <ul className="lista lista-pedidos">
          {itens.map((p) => {
            const wa = p.fornecedor_whatsapp ? linkWhatsapp(p.fornecedor_telefone) : null;
            const st = STATUS_PEDIDO[p.status];
            return (
              <li className="pedido" key={p.id}>
                <button className="pedido-cabeca" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                  <span className="pedido-info">
                    <strong>{p.fornecedor_nome}</strong>
                    <span className="sub">
                      {quando(p.criado_em)} · {p.itens.length} item(ns) · {reais(p.total)}
                    </span>
                  </span>
                  <span className="pedido-status" data-sinal={st.sinal}>
                    {st.rotulo}
                  </span>
                </button>

                {aberto === p.id && (
                  <div className="pedido-detalhe">
                    <ul className="pedido-itens">
                      {p.itens.map((i) => (
                        <li key={i.id}>
                          {i.nome} — {qtdComUnidade(i.qtd, i.unidade)} · {reais(i.subtotal)}
                        </li>
                      ))}
                    </ul>
                    {p.observacao && <p className="sub">Obs.: {p.observacao}</p>}
                    {p.motivo && <p className="sub motivo">Motivo: {p.motivo}</p>}
                    <div className="botoes-linha">
                      {wa && (
                        <a className="botao mini" href={wa} target="_blank" rel="noreferrer">
                          WhatsApp
                        </a>
                      )}
                      {p.status === "novo" && (
                        <button className="botao mini perigo" onClick={() => cancelar(p)}>
                          Cancelar
                        </button>
                      )}
                    </div>
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
