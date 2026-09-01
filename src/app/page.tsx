"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { sufixo } from "@/lib/tipos";

type Item = {
  id: number;
  nome: string;
  categoria: string | null;
  local: string | null;
  unidade: string;
  tipo_venda: string;
  preco: string;
};

const moeda = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function BotaoEditar({ id }: { id: number }) {
  return (
    <Link href={`/produtos/editar/${id}`} className="editar-item" aria-label="Editar este produto">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    </Link>
  );
}

export default function Consulta() {
  const [termo, setTermo] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [buscou, setBuscou] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [temVoz, setTemVoz] = useState(false);

  const reconhecimento = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const buscar = useCallback(async (texto: string) => {
    const q = texto.trim();
    if (q.length < 2) {
      setItens([]);
      setBuscou(false);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    try {
      const r = await fetch(`/api/produtos?q=${encodeURIComponent(q)}`);
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setItens(dados.itens);
      setBuscou(true);
      setErro(false);
      setAviso("");
    } catch {
      setErro(true);
      setAviso("Não foi possível consultar o banco agora. Tente de novo.");
    } finally {
      setBuscando(false);
    }
  }, []);

  // busca enquanto digita
  useEffect(() => {
    const t = setTimeout(() => buscar(termo), 280);
    return () => clearTimeout(t);
  }, [termo, buscar]);

  // configura o reconhecimento de fala
  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setAviso("Este navegador não reconhece fala. Use o Chrome ou digite o nome.");
      return;
    }
    setTemVoz(true);

    const sr = new SR();
    sr.lang = "pt-BR";
    sr.continuous = false;
    sr.interimResults = true;
    sr.maxAlternatives = 1;

    sr.onstart = () => {
      setOuvindo(true);
      setErro(false);
      setAviso("Ouvindo. Diga o nome do produto.");
    };
    sr.onresult = (e: any) => {
      const texto = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join("")
        .trim();
      setTermo(texto);
      if (e.results[e.results.length - 1].isFinal) buscar(texto);
    };
    sr.onerror = (e: any) => {
      setErro(true);
      setAviso(
        e.error === "not-allowed"
          ? "Libere o microfone nas permissões do navegador."
          : "Não entendi. Toque no microfone e fale de novo."
      );
    };
    sr.onend = () => {
      setOuvindo(false);
      setAviso((a) => (a === "Ouvindo. Diga o nome do produto." ? "" : a));
    };

    reconhecimento.current = sr;
    return () => sr.abort();
  }, [buscar]);

  function alternarMicrofone() {
    const sr = reconhecimento.current;
    if (!sr) return;
    if (ouvindo) {
      sr.stop();
      return;
    }
    setTermo("");
    setItens([]);
    setBuscou(false);
    try {
      sr.start();
    } catch {
      /* já iniciado */
    }
  }

  return (
    <main className="tela">
      <header className="marca">
        Consulta de preço <span>•</span> mercadinho
      </header>

      <div className="campo">
        <input
          ref={inputRef}
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Fale ou digite o produto"
          aria-label="Nome do produto"
          autoComplete="off"
          enterKeyHint="search"
          onKeyDown={(e) => e.key === "Enter" && buscar(termo)}
        />
        {buscando && <span className="girando" aria-label="Buscando" />}

        <button
          type="button"
          className="microfone"
          data-ouvindo={ouvindo}
          disabled={!temVoz}
          onClick={alternarMicrofone}
          aria-label={ouvindo ? "Parar de ouvir" : "Falar o nome do produto"}
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

      <p className="dica" data-erro={erro} role="status" aria-live="polite">
        {aviso}
      </p>

      {itens.length === 1 && (
        <section className="etiqueta">
          <BotaoEditar id={itens[0].id} />
          <h1 className="nome">{itens[0].nome}</h1>
          <p className="meta">
            {[itens[0].categoria, itens[0].local].filter(Boolean).join(" · ")}
          </p>
          <div className="valor">
            <span className="cifrao">R$</span>
            <span className="numero">{moeda.format(Number(itens[0].preco))}</span>
            <span className="por">por {sufixo(itens[0].tipo_venda)}</span>
          </div>
        </section>
      )}

      {itens.length > 1 && (
        <>
          <p className="contagem">
            {itens.length} produtos encontrados
          </p>
          <div className="grade-precos">
            {itens.map((p) => (
              <article className="etiqueta menor" key={p.id}>
                <BotaoEditar id={p.id} />
                <h2 className="nome">{p.nome}</h2>
                <p className="meta">
                  {[p.categoria, p.local].filter(Boolean).join(" · ")}
                </p>
                <div className="valor">
                  <span className="cifrao">R$</span>
                  <span className="numero">{moeda.format(Number(p.preco))}</span>
                  <span className="por">por {sufixo(p.tipo_venda)}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {buscou && itens.length === 0 && (
        <p className="vazio">
          Nenhum produto com esse nome. Tente uma palavra só, como “gulão” ou “tomate”.
        </p>
      )}
    </main>
  );
}
