"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { capitalizar, numeroFalado } from "@/lib/voz";
import { mascararMoeda, moedaParaNumero, paraMoeda } from "@/lib/moeda";

type Custo = {
  id: number;
  descricao: string;
  beneficiario: string;
  valor: string;
  criado_em: string;
};

const CAMPOS = ["descricao", "beneficiario", "valor"] as const;
type CampoId = (typeof CAMPOS)[number];

const RUBRICAS: Record<CampoId, string> = {
  descricao: "Descrição",
  beneficiario: "Beneficiário",
  valor: "Valor",
};

const moeda = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export default function Custos() {
  const [itens, setItens] = useState<Custo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [descricao, setDescricao] = useState("");
  const [beneficiario, setBeneficiario] = useState("");
  const [valor, setValor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  const [disponivel, setDisponivel] = useState(false);
  const [ouvindoSequencia, setOuvindoSequencia] = useState(false);
  const [campoAtivoIdx, setCampoAtivoIdx] = useState<number | null>(null);

  const reconhecimento = useRef<any>(null);
  const indiceRef = useRef(0);
  const continuarRef = useRef(false);

  const aplicarTrechoNoCampo = useCallback((idx: number, texto: string) => {
    const campo = CAMPOS[idx];
    if (campo === "valor") {
      const n = numeroFalado(texto);
      if (n === null) {
        setErro(true);
        setAviso(`Não entendi "${texto}" como valor. Corrija o campo Valor na mão.`);
        return;
      }
      setValor(paraMoeda(n));
      return;
    }
    const capitalizado = capitalizar(texto);
    if (campo === "descricao") setDescricao(capitalizado);
    else setBeneficiario(capitalizado);
  }, []);

  // reconhecimento de fala: escuta um campo, e ao detectar a pausa (fim da
  // fala) passa pro proximo campo sozinho, ate completar os tres.
  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    setDisponivel(true);

    const sr = new SR();
    sr.lang = "pt-BR";
    sr.continuous = false;
    sr.interimResults = false;
    sr.maxAlternatives = 1;

    sr.onresult = (e: any) => {
      const texto = e.results[0][0].transcript.trim();
      const idx = indiceRef.current;
      aplicarTrechoNoCampo(idx, texto);
      setErro(false);
      setAviso("");

      const proximo = idx + 1;
      if (proximo < CAMPOS.length) {
        indiceRef.current = proximo;
        setCampoAtivoIdx(proximo);
        continuarRef.current = true;
      } else {
        continuarRef.current = false;
        setCampoAtivoIdx(null);
      }
    };

    sr.onerror = (e: any) => {
      continuarRef.current = false;
      setCampoAtivoIdx(null);
      setErro(true);
      setAviso(
        e.error === "no-speech"
          ? "Não ouvi nada. Toque no microfone e continue de onde parou."
          : e.error === "not-allowed"
            ? "Libere o microfone nas permissões do navegador."
            : "Não entendi. Toque no microfone e fale de novo."
      );
    };

    sr.onend = () => {
      if (continuarRef.current) {
        try {
          sr.start();
          return;
        } catch {
          /* ja iniciado */
        }
      }
      setOuvindoSequencia(false);
    };

    reconhecimento.current = sr;
    return () => sr.abort();
  }, [aplicarTrechoNoCampo]);

  function falarTudo() {
    const sr = reconhecimento.current;
    if (!sr) return;
    setDescricao("");
    setBeneficiario("");
    setValor("");
    setErro(false);
    setAviso("");
    indiceRef.current = 0;
    setCampoAtivoIdx(0);
    continuarRef.current = true;
    setOuvindoSequencia(true);
    try {
      sr.start();
    } catch {
      /* ja iniciado */
    }
  }

  function pararSequencia() {
    continuarRef.current = false;
    reconhecimento.current?.abort();
    setOuvindoSequencia(false);
    setCampoAtivoIdx(null);
  }

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/custos");
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setItens(dados.itens);
    } catch {
      setErro(true);
      setAviso("Não foi possível carregar os gastos.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const formularioValido =
    descricao.trim().length >= 2 && beneficiario.trim().length >= 2 && moedaParaNumero(valor) > 0;

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/custos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descricao, beneficiario, valor: moedaParaNumero(valor) }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");

      setAviso("Gasto incluído.");
      setDescricao("");
      setBeneficiario("");
      setValor("");
      await carregar();
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(c: Custo) {
    if (!confirm(`Excluir "${c.descricao}"? Essa ação não tem volta.`)) return;
    try {
      const r = await fetch(`/api/custos/${c.id}`, { method: "DELETE" });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setAviso("Gasto excluído.");
      setErro(false);
      await carregar();
    } catch {
      setErro(true);
      setAviso("Não foi possível excluir o gasto.");
    }
  }

  const total = itens.reduce((s, c) => s + Number(c.valor), 0);

  return (
    <main className="tela">
      <header className="marca">
        Gastos <span>•</span> {itens.length} registrados
      </header>

      <section className="cartao">
        <h2 className="titulo-cartao">Novo gasto</h2>

        <p className="ajuda-voz" data-erro={!disponivel}>
          {disponivel
            ? 'Toque no microfone e fale os três: descrição, uma pausa, beneficiário, uma pausa, valor — o sistema muda de campo sozinho a cada pausa.'
            : "Este navegador não reconhece fala. Abra no Chrome ou no Edge, ou preencha os campos na mão."}
        </p>

        <div className="campo simples">
          <input
            value={ouvindoSequencia && campoAtivoIdx !== null ? `Ouvindo: ${RUBRICAS[CAMPOS[campoAtivoIdx]]}…` : ""}
            readOnly
            placeholder='Toque e fale: descrição, beneficiário, valor'
            aria-label="Status da escuta"
          />
          <button
            type="button"
            className="microfone"
            data-ouvindo={ouvindoSequencia}
            disabled={!disponivel}
            onClick={() => (ouvindoSequencia ? pararSequencia() : falarTudo())}
            aria-label={ouvindoSequencia ? "Parar de ouvir" : "Falar descrição, beneficiário e valor"}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
              <path
                d="M5 11a7 7 0 0 0 14 0M12 18v4"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="grade-form">
          <label className="rotulo largo">
            Descrição
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Frete, manutenção, compra de gelo..."
              data-ouvindo={campoAtivoIdx === 0}
              autoComplete="off"
            />
          </label>

          <label className="rotulo">
            Beneficiário
            <input
              value={beneficiario}
              onChange={(e) => setBeneficiario(e.target.value)}
              placeholder="Fornecedor, prestador..."
              data-ouvindo={campoAtivoIdx === 1}
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
              data-ouvindo={campoAtivoIdx === 2}
              autoComplete="off"
            />
          </label>
        </div>

        <div className="acoes">
          <button className="botao primario" onClick={salvar} disabled={salvando || !formularioValido}>
            {salvando ? "Salvando…" : "Incluir custo"}
          </button>
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">Nenhum gasto registrado ainda.</p>
      ) : (
        <>
          <p className="contagem">Total: R$ {moeda.format(total)}</p>
          <ul className="lista">
            {itens.map((c) => (
              <li key={c.id}>
                <span className="rotulo-item">
                  {c.descricao}
                  <span className="sub">
                    {c.beneficiario} · {data.format(new Date(c.criado_em))}
                  </span>
                </span>
                <span className="preco">R$ {moeda.format(Number(c.valor))}</span>
                <span className="botoes-linha">
                  <button className="botao mini perigo" onClick={() => excluir(c)}>
                    Excluir
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
