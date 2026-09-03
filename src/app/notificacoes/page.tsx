"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Aviso = {
  id: number;
  tipo: string;
  titulo: string;
  corpo: string | null;
  link: string | null;
  lida: boolean;
  criado_em: string;
};

const ICONE: Record<string, string> = {
  anotacao: "📝",
  pedido: "🧾",
  cadastro: "🏢",
  sistema: "🔔",
};

/** "agora", "há 20 min", "hoje 14:32", "ontem", "3 set", "3 set 2025" */
function quando(iso: string): string {
  const d = new Date(iso);
  const agora = new Date();
  const min = Math.round((agora.getTime() - d.getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;

  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((dia(agora) - dia(d)) / 86400000);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `hoje ${hora}`;
  if (diff === 1) return `ontem ${hora}`;
  const data = d.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== agora.getFullYear() ? { year: "numeric" } : {}),
  });
  return data;
}

export default function Notificacoes() {
  const router = useRouter();
  const [itens, setItens] = useState<Aviso[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/notificacoes");
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não foi possível carregar.");
      setItens(d.itens ?? []);
      setNaoLidas(Number(d.naoLidas) || 0);
      setErro("");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function abrir(a: Aviso) {
    if (!a.lida) {
      setItens((xs) => xs.map((x) => (x.id === a.id ? { ...x, lida: true } : x)));
      setNaoLidas((n) => Math.max(0, n - 1));
      fetch(`/api/notificacoes/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lida: true }),
      }).catch(() => {});
    }
    if (a.link) router.push(a.link);
  }

  async function marcarTodas() {
    setItens((xs) => xs.map((x) => ({ ...x, lida: true })));
    setNaoLidas(0);
    await fetch("/api/notificacoes/marcar-todas", { method: "POST" }).catch(() => {});
  }

  return (
    <main className="tela">
      <header className="marca">
        Avisos <span>•</span> {naoLidas} não lido{naoLidas === 1 ? "" : "s"}
      </header>

      {naoLidas > 0 && (
        <div className="acoes">
          <button type="button" className="botao mini" onClick={marcarTodas}>
            Marcar todas como lidas
          </button>
        </div>
      )}

      {erro && (
        <p className="dica" data-erro="true">
          {erro}
        </p>
      )}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">Nenhum aviso por aqui.</p>
      ) : (
        <ul className="lista lista-avisos">
          {itens.map((a) => (
            <li key={a.id} className="aviso" data-lida={a.lida}>
              <button
                type="button"
                className="aviso-corpo"
                onClick={() => abrir(a)}
                data-clicavel={Boolean(a.link)}
              >
                {!a.lida && <span className="aviso-ponto" aria-hidden="true" />}
                <span className="aviso-icone" aria-hidden="true">
                  {ICONE[a.tipo] ?? "🔔"}
                </span>
                <span className="aviso-texto">
                  <strong>{a.titulo}</strong>
                  {a.corpo && <span className="sub">{a.corpo}</span>}
                  <span className="aviso-quando">{quando(a.criado_em)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
