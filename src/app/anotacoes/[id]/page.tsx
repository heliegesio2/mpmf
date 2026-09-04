"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import FotoAmpliavel from "@/components/FotoAmpliavel";

type Anotacao = {
  id: number;
  titulo: string | null;
  texto: string;
  data_alerta: string | null;
  concluida: boolean;
  criado_em: string;
  tem_foto: boolean;
  de_admin: boolean;
  link: string | null;
};

function dataBR(iso: string | null): string {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Tela de detalhe — aberta ao clicar num aviso: título, conteúdo e, se
 * houver, o botão pro link que a administração registrou. */
export default function AnotacaoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<Anotacao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetch(`/api/anotacoes/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => setItem(d.item))
      .catch(() => setErro("Não foi possível carregar essa anotação."))
      .finally(() => setCarregando(false));
  }, [id]);

  async function alternarConcluida() {
    if (!item) return;
    setSalvando(true);
    try {
      const r = await fetch(`/api/anotacoes/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concluida: !item.concluida }),
      });
      if (!r.ok) throw new Error();
      setItem((x) => (x ? { ...x, concluida: !x.concluida } : x));
    } catch {
      setErro("Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!item || !confirm("Excluir esta anotação? Essa ação não tem volta.")) return;
    try {
      const r = await fetch(`/api/anotacoes/${item.id}`, { method: "DELETE" });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível excluir.");
      router.push("/anotacoes");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir.");
    }
  }

  return (
    <main className="tela">
      <header className="marca">
        <Link href="/anotacoes">← Anotações</Link>
      </header>

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : erro || !item ? (
        <p className="dica" data-erro="true">
          {erro || "Anotação não encontrada."}
        </p>
      ) : (
        <>
          <section className="cartao">
            {item.de_admin && (
              <span className="selo" data-situacao="pendente">
                Aviso do sistema
              </span>
            )}
            <h2 className="titulo-cartao">
              {item.titulo || (item.de_admin ? "Aviso" : "Anotação")}
            </h2>

            {item.tem_foto && (
              <div style={{ margin: "10px 0" }}>
                <FotoAmpliavel src={`/api/anotacoes/${item.id}/foto`} alt="" />
              </div>
            )}

            <div className="html-aviso" dangerouslySetInnerHTML={{ __html: item.texto }} />

            {item.data_alerta && (
              <p className="dica" style={{ marginTop: 10 }}>
                Alerta em: {dataBR(item.data_alerta)}
              </p>
            )}

            {item.link && (
              <div className="acoes" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="botao primario"
                  onClick={() => router.push(item.link!)}
                >
                  🔗 Clique aqui para conferir a novidade
                </button>
              </div>
            )}
          </section>

          <section className="cartao">
            <label className="rotulo largo">
              <input
                type="checkbox"
                checked={item.concluida}
                onChange={alternarConcluida}
                disabled={salvando}
              />{" "}
              Concluída
            </label>

            {!item.de_admin && (
              <div className="acoes" style={{ marginTop: 10 }}>
                <button type="button" className="botao mini perigo" onClick={excluir}>
                  Excluir
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
