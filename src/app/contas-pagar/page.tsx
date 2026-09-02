"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FotoAmpliavel from "@/components/FotoAmpliavel";
import { comprimirParaDataURL } from "@/lib/imagemCliente";
import { ROTULO_CATEGORIA, prazoVencimento } from "@/lib/contasPagar";

type ContaPagar = {
  id: number;
  fornecedor_id: number | null;
  fornecedor_nome: string | null;
  categoria: string | null;
  descricao: string | null;
  valor: string;
  vencimento: string | null;
  recorrente: boolean;
  tem_foto: boolean;
  pago: boolean;
  pago_em: string | null;
  criado_em: string;
};

const CHAVE_FOTO = "mpmf.contaPagarFoto";
const CHAVE_FLASH = "mpmf.contaPagarFlash";

const FILTROS = [
  { valor: "abertas", rotulo: "Em aberto" },
  { valor: "pagas", rotulo: "Pagas" },
  { valor: "todas", rotulo: "Todas" },
];

const moeda = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export default function ContasPagar() {
  const router = useRouter();
  const [itens, setItens] = useState<ContaPagar[]>([]);
  const [filtro, setFiltro] = useState("abertas");
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [lendoFoto, setLendoFoto] = useState(false);
  const fotoInput = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async (situacao: string) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/contas-pagar?situacao=${situacao}`);
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
    carregar(filtro);
  }, [filtro, carregar]);

  // aviso rápido depois de salvar na tela de cadastro
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

  async function novaPorFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setLendoFoto(true);
    setErro(false);
    try {
      const dataUrl = await comprimirParaDataURL(arquivo);
      try {
        sessionStorage.setItem(CHAVE_FOTO, dataUrl);
      } catch {
        /* sem sessionStorage: segue sem a foto pré-carregada */
      }
      router.push("/contas-pagar/nova");
    } catch {
      setErro(true);
      setAviso("Não consegui usar essa foto. Tente outra.");
      setLendoFoto(false);
    } finally {
      if (fotoInput.current) fotoInput.current.value = "";
    }
  }

  async function marcar(id: number, acao: "pagar" | "reabrir") {
    try {
      const r = await fetch(`/api/contas-pagar/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error();
      if (acao === "reabrir") {
        setAviso("Conta reaberta.");
      } else if (d.proximaVencimento) {
        setAviso(
          `Conta quitada. Próxima já lançada para ${dataFmt.format(new Date(d.proximaVencimento + "T00:00:00"))}.`
        );
      } else {
        setAviso("Conta quitada.");
      }
      setErro(false);
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível atualizar.");
    }
  }

  async function excluir(c: ContaPagar) {
    if (!confirm(`Excluir a conta "${c.descricao || c.fornecedor_nome || "sem descrição"}"? Não tem volta.`)) return;
    try {
      const r = await fetch(`/api/contas-pagar/${c.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setAviso("Conta excluída.");
      setErro(false);
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível excluir.");
    }
  }

  const totais = useMemo(() => {
    const abertas = itens.filter((c) => !c.pago);
    return {
      aberto: abertas.reduce((s, c) => s + Number(c.valor), 0),
      vencidas: abertas.filter((c) => prazoVencimento(c.vencimento)?.atrasada).length,
    };
  }, [itens]);

  return (
    <main className="tela">
      <header className="marca">
        Contas a pagar
        {totais.aberto > 0 && (
          <>
            {" "}
            <span>•</span> R$ {moeda.format(totais.aberto)} em aberto
            {totais.vencidas > 0 && ` · ${totais.vencidas} vencida${totais.vencidas === 1 ? "" : "s"}`}
          </>
        )}
      </header>

      <div className="acoes">
        <Link href="/contas-pagar/nova" className="botao primario">
          + Nova conta a pagar
        </Link>
        <button
          type="button"
          className="botao neutro"
          onClick={() => fotoInput.current?.click()}
          disabled={lendoFoto}
        >
          {lendoFoto ? "Abrindo…" : "📷 Nova conta por foto"}
        </button>
        <input
          ref={fotoInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(e) => novaPorFoto(e.target.files?.[0])}
        />
      </div>

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

      {aviso && (
        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      )}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">Nada por aqui.</p>
      ) : (
        <ul className="lista">
          {itens.map((c) => {
            const p = prazoVencimento(c.vencimento);
            return (
              <li key={c.id}>
                {c.tem_foto && (
                  <FotoAmpliavel
                    className="miniatura-produto"
                    src={`/api/contas-pagar/${c.id}/foto`}
                    alt="Foto do boleto"
                  />
                )}
                <span className="rotulo-item">
                  {c.descricao || c.fornecedor_nome || "Conta a pagar"}
                  <span className="sub">
                    {[
                      c.categoria ? ROTULO_CATEGORIA[c.categoria] ?? c.categoria : null,
                      c.recorrente ? "recorrente" : null,
                      c.fornecedor_nome && c.descricao ? c.fornecedor_nome : null,
                      c.vencimento ? `vence ${dataFmt.format(new Date(c.vencimento + "T00:00:00"))}` : null,
                      c.pago && c.pago_em ? `pago em ${dataFmt.format(new Date(c.pago_em))}` : p?.texto,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span className="preco" data-critico={!c.pago && p?.atrasada ? "true" : undefined}>
                  R$ {moeda.format(Number(c.valor))}
                </span>
                <span className="botoes-linha">
                  {c.pago ? (
                    <button className="botao mini" onClick={() => marcar(c.id, "reabrir")}>
                      Reabrir
                    </button>
                  ) : (
                    <button className="botao mini" onClick={() => marcar(c.id, "pagar")}>
                      Marcar pago
                    </button>
                  )}
                  <button className="botao mini perigo" onClick={() => excluir(c)}>
                    Excluir
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
