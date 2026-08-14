"use client";

import { useCallback, useEffect, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import { useVoz } from "@/lib/useVoz";
import { numeroFalado } from "@/lib/voz";
import { moedaParaNumero, paraMoeda } from "@/lib/moeda";

type Caixa = {
  id: number;
  data: string;
  valor: string;
  criado_em: string;
};

const moeda = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dataCurta = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
const dataLonga = new Intl.DateTimeFormat("pt-BR", { dateStyle: "full" });

/** "2026-08-14" (o que o Postgres devolve) -> Date local, sem virar o dia por fuso. */
function paraDataLocal(iso: string): Date {
  const [ano, mes, dia] = iso.split("-").map(Number);
  return new Date(ano, mes - 1, dia);
}

export default function Caixa() {
  const [itens, setItens] = useState<Caixa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  const aplicarFala = useCallback((_campo: string, texto: string) => {
    const n = numeroFalado(texto);
    if (n === null) {
      setErro(true);
      setAviso(`Não entendi "${texto}" como valor.`);
      return;
    }
    setValor(paraMoeda(n));
    setErro(false);
    setAviso("");
  }, []);

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const campo = campoAtual.current;
      if (campo) aplicarFala(campo, texto);
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/caixa");
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setItens(dados.itens);
    } catch {
      setErro(true);
      setAviso("Não foi possível carregar o histórico.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const formularioValido = valor.trim() !== "" && moedaParaNumero(valor) >= 0;

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/caixa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor: moedaParaNumero(valor) }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");

      setAviso("Caixa de hoje registrado.");
      setValor("");
      await carregar();
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(c: Caixa) {
    if (!confirm(`Excluir o caixa de ${dataCurta.format(paraDataLocal(c.data))}? Essa ação não tem volta.`)) return;
    try {
      const r = await fetch(`/api/caixa/${c.id}`, { method: "DELETE" });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setAviso("Registro excluído.");
      setErro(false);
      await carregar();
    } catch {
      setErro(true);
      setAviso("Não foi possível excluir.");
    }
  }

  const hoje = new Date();
  const jaTemHoje = itens.some((c) => paraDataLocal(c.data).toDateString() === hoje.toDateString());

  return (
    <main className="tela">
      <header className="marca">
        Caixa <span>•</span> {itens.length} no histórico
      </header>

      <section className="cartao">
        <h2 className="titulo-cartao">Fechamento de hoje</h2>
        <p className="ajuda-voz">{dataLonga.format(hoje)}</p>

        {jaTemHoje ? (
          <p className="dica" role="status">
            O caixa de hoje já foi registrado. Exclua o registro na lista abaixo se precisar corrigir.
          </p>
        ) : (
          <>
            <p className="ajuda-voz" data-erro={!disponivel}>
              {disponivel
                ? "Toque no microfone e fale o valor final do caixa."
                : "Este navegador não reconhece fala. Abra no Chrome ou no Edge, ou preencha na mão."}
            </p>

            <div className="grade-form">
              <CampoVoz
                rotulo="Valor final do caixa"
                placeholder="0,00"
                moeda
                largo
                campo="valor"
                valor={valor}
                aoMudar={setValor}
                ouvindo={ouvindoCampo === "valor"}
                temVoz={disponivel}
                aoOuvir={ouvir}
                aoParar={parar}
              />
            </div>

            <div className="acoes">
              <button className="botao primario" onClick={salvar} disabled={salvando || !formularioValido}>
                {salvando ? "Salvando…" : "Registrar caixa de hoje"}
              </button>
            </div>
          </>
        )}

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">Nenhum fechamento registrado ainda.</p>
      ) : (
        <ul className="lista">
          {itens.map((c) => (
            <li key={c.id}>
              <span className="rotulo-item">{dataCurta.format(paraDataLocal(c.data))}</span>
              <span className="preco">R$ {moeda.format(Number(c.valor))}</span>
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
