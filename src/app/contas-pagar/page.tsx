"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import CampoFoto from "@/components/CampoFoto";
import FotoAmpliavel from "@/components/FotoAmpliavel";
import FormularioFornecedor from "@/components/FormularioFornecedor";
import { mascararMoeda, moedaParaNumero, paraMoeda } from "@/lib/moeda";

type ContaPagar = {
  id: number;
  fornecedor_id: number | null;
  fornecedor_nome: string | null;
  descricao: string | null;
  valor: string;
  vencimento: string | null;
  tem_foto: boolean;
  pago: boolean;
  pago_em: string | null;
  criado_em: string;
};

type FornecedorLite = { id: number; nome: string };

const FILTROS = [
  { valor: "abertas", rotulo: "Em aberto" },
  { valor: "pagas", rotulo: "Pagas" },
  { valor: "todas", rotulo: "Todas" },
];

const moeda = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataFmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Rótulo de vencimento: "vencida há 3 dias", "vence hoje", "vence em 5 dias". */
function prazo(venc: string | null): { texto: string; atrasada: boolean } | null {
  if (!venc) return null;
  const dias = Math.round((Date.parse(venc + "T00:00:00") - Date.parse(hojeISO() + "T00:00:00")) / 86400000);
  if (dias < 0) return { texto: `vencida há ${-dias} dia${dias === -1 ? "" : "s"}`, atrasada: true };
  if (dias === 0) return { texto: "vence hoje", atrasada: true };
  if (dias === 1) return { texto: "vence amanhã", atrasada: false };
  return { texto: `vence em ${dias} dias`, atrasada: false };
}

/* ---------- seletor de fornecedor ---------- */
function SeletorFornecedor({
  valor,
  aoEscolher,
}: {
  valor: FornecedorLite | null;
  aoEscolher: (f: FornecedorLite | null) => void;
}) {
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<FornecedorLite[]>([]);
  const [cadastrando, setCadastrando] = useState(false);

  useEffect(() => {
    if (valor || cadastrando) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/fornecedores?q=${encodeURIComponent(busca)}`);
        const d = await r.json();
        if (r.ok) setOpcoes((d.itens as FornecedorLite[]).slice(0, 6));
      } catch {
        /* silencioso */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [busca, valor, cadastrando]);

  if (valor) {
    return (
      <div className="rotulo largo">
        Fornecedor
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
        Novo fornecedor
        <FormularioFornecedor
          inicial={{ nome: busca }}
          aoSalvar={(f) => {
            setCadastrando(false);
            aoEscolher(f);
          }}
          aoCancelar={() => setCadastrando(false)}
        />
      </div>
    );
  }

  return (
    <div className="rotulo largo">
      Fornecedor (opcional)
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar fornecedor pelo nome"
        autoComplete="off"
      />
      {(opcoes.length > 0 || busca.trim().length >= 2) && (
        <div className="fornecedor-opcoes">
          {opcoes.map((o) => (
            <button key={o.id} type="button" onClick={() => aoEscolher(o)}>
              {o.nome}
            </button>
          ))}
          {busca.trim().length >= 2 && (
            <button type="button" className="fornecedor-novo" onClick={() => setCadastrando(true)}>
              + Cadastrar “{busca.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ContasPagar() {
  const [itens, setItens] = useState<ContaPagar[]>([]);
  const [filtro, setFiltro] = useState("abertas");
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  // formulário
  const [foto, setFoto] = useState("");
  const [fornecedor, setFornecedor] = useState<FornecedorLite | null>(null);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [lendoFoto, setLendoFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // fornecedor lido da foto e ainda não cadastrado
  const [nomeLido, setNomeLido] = useState("");
  const [docLido, setDocLido] = useState("");
  const [cadFornLido, setCadFornLido] = useState(false);

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

  async function lerBoleto(dataUrl: string) {
    setFoto(dataUrl);
    setLendoFoto(true);
    setErro(false);
    setAviso("Lendo o boleto…");
    try {
      const r = await fetch("/api/contas-pagar/ler-foto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto: dataUrl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não consegui ler.");

      const { dados, fornecedor: achado } = d;
      if (dados.valor > 0) setValor(paraMoeda(dados.valor));
      if (dados.vencimento) setVencimento(dados.vencimento);
      if (dados.documento) setDescricao(dados.documento);
      if (achado) {
        setFornecedor({ id: achado.id, nome: achado.nome });
        setAviso(`Fornecedor reconhecido: ${achado.nome}.`);
      } else if (dados.fornecedorNome) {
        setNomeLido(dados.fornecedorNome);
        setDocLido(dados.fornecedorDocumento || "");
        setAviso(`Li "${dados.fornecedorNome}" — cadastre o fornecedor abaixo se quiser.`);
      } else {
        setAviso("Boleto lido. Confira os campos.");
      }
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não consegui ler o boleto. Preencha na mão.");
    } finally {
      setLendoFoto(false);
    }
  }

  const formularioValido = moedaParaNumero(valor) > 0;

  function limparForm() {
    setFoto("");
    setFornecedor(null);
    setDescricao("");
    setValor("");
    setVencimento("");
    setNomeLido("");
    setDocLido("");
    setCadFornLido(false);
  }

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/contas-pagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorId: fornecedor?.id ?? null,
          descricao,
          valor: moedaParaNumero(valor),
          vencimento: vencimento || null,
          foto: foto || null,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — ") || "Não foi possível salvar.");
      setAviso("Conta a pagar incluída.");
      limparForm();
      await carregar(filtro);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function marcar(id: number, acao: "pagar" | "reabrir") {
    try {
      const r = await fetch(`/api/contas-pagar/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao }),
      });
      if (!r.ok) throw new Error();
      setAviso(acao === "pagar" ? "Conta quitada." : "Conta reaberta.");
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
      vencidas: abertas.filter((c) => prazo(c.vencimento)?.atrasada).length,
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

      <section className="cartao">
        <h2 className="titulo-cartao">Nova conta a pagar</h2>
        <p className="ajuda-voz">
          Tire a foto do boleto ou da nota — o sistema tenta ler fornecedor, valor e
          vencimento. Depois é só conferir.
        </p>

        <div className="grade-form">
          <div className="rotulo largo">
            <CampoFoto
              rotulo="Foto do boleto / nota"
              semCaptura
              preview={foto}
              aoEscolher={lerBoleto}
              aoRemover={foto ? () => setFoto("") : undefined}
              aoErro={(m) => {
                setErro(true);
                setAviso(m);
              }}
            />
          </div>

          <SeletorFornecedor valor={fornecedor} aoEscolher={setFornecedor} />

          {!fornecedor && nomeLido && !cadFornLido && (
            <div className="rotulo largo">
              <button type="button" className="botao neutro" onClick={() => setCadFornLido(true)}>
                Cadastrar fornecedor “{nomeLido}”
              </button>
            </div>
          )}
          {!fornecedor && cadFornLido && (
            <div className="rotulo largo">
              Novo fornecedor
              <FormularioFornecedor
                inicial={{ nome: nomeLido, documento: docLido }}
                aoSalvar={(f) => {
                  setFornecedor(f);
                  setCadFornLido(false);
                  setNomeLido("");
                }}
                aoCancelar={() => setCadFornLido(false)}
              />
            </div>
          )}

          <label className="rotulo largo">
            Descrição
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Boleto nota 4471, aluguel, energia…"
              autoComplete="off"
            />
          </label>

          <label className="rotulo">
            Valor
            <input
              value={valor}
              onChange={(e) => setValor(mascararMoeda(e.target.value))}
              placeholder="0,00"
              inputMode="decimal"
              autoComplete="off"
            />
          </label>

          <label className="rotulo">
            Vencimento
            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </label>
        </div>

        <div className="acoes">
          <button
            className="botao primario"
            onClick={salvar}
            disabled={salvando || lendoFoto || !formularioValido}
          >
            {salvando ? "Salvando…" : "Incluir conta a pagar"}
          </button>
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>

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

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">Nada por aqui.</p>
      ) : (
        <ul className="lista">
          {itens.map((c) => {
            const p = prazo(c.vencimento);
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
