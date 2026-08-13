"use client";

import { mascararMoeda } from "@/lib/moeda";

type Base = {
  rotulo: string;
  campo: string;
  ouvindo: boolean;
  temVoz: boolean;
  aoOuvir: (campo: string) => void;
  aoParar?: () => void;
  largo?: boolean;
};

function BotaoMicrofone({
  campo,
  ouvindo,
  temVoz,
  aoOuvir,
  aoParar,
  rotulo,
}: Pick<Base, "campo" | "ouvindo" | "temVoz" | "aoOuvir" | "aoParar" | "rotulo">) {
  return (
    <button
      type="button"
      className="mic-campo"
      data-ouvindo={ouvindo}
      disabled={!temVoz}
      onClick={() => (ouvindo ? aoParar?.() : aoOuvir(campo))}
      title={temVoz ? `Falar ${rotulo}` : "Este navegador não reconhece fala. Use o Chrome."}
      aria-label={ouvindo ? `Parar de ouvir ${rotulo}` : `Falar ${rotulo}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
        <path
          d="M5 11a7 7 0 0 0 14 0M12 18v4"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}

type PropsTexto = Base & {
  valor: string;
  aoMudar: (v: string) => void;
  placeholder?: string;
  numerico?: boolean;
  /** Campo de dinheiro: aplica a máscara e mostra o R$ ao lado. */
  moeda?: boolean;
};

export function CampoVoz({
  rotulo,
  campo,
  valor,
  aoMudar,
  placeholder,
  numerico,
  moeda,
  ouvindo,
  temVoz,
  aoOuvir,
  aoParar,
  largo,
}: PropsTexto) {
  return (
    <label className={`rotulo${largo ? " largo" : ""}`}>
      {rotulo}
      <span className="entrada" data-ouvindo={ouvindo} data-moeda={moeda}>
        {moeda && <span className="prefixo">R$</span>}
        <input
          value={valor}
          // o microfone so liga pelo botao: ligar no foco fazia o campo
          // reiniciar a escuta a cada volta do foco, entrando em laco
          onChange={(e) => {
            if (ouvindo) aoParar?.();
            aoMudar(moeda ? mascararMoeda(e.target.value) : e.target.value);
          }}
          placeholder={ouvindo ? "Ouvindo…" : placeholder}
          inputMode={moeda || numerico ? "decimal" : "text"}
          autoComplete="off"
        />
        <BotaoMicrofone {...{ campo, ouvindo, temVoz, aoOuvir, aoParar, rotulo }} />
      </span>
    </label>
  );
}

type PropsSelecao = Base & {
  valor: string;
  aoMudar: (v: string) => void;
  opcoes: readonly { valor: string; rotulo: string }[];
};

export function SelecaoVoz({
  rotulo,
  campo,
  valor,
  aoMudar,
  opcoes,
  ouvindo,
  temVoz,
  aoOuvir,
  aoParar,
  largo,
}: PropsSelecao) {
  return (
    <label className={`rotulo${largo ? " largo" : ""}`}>
      {rotulo}
      <span className="entrada" data-ouvindo={ouvindo}>
        {/* no select o microfone continua sendo por toque: abrir a lista ja e escolher */}
        <select value={valor} onChange={(e) => aoMudar(e.target.value)}>
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <BotaoMicrofone {...{ campo, ouvindo, temVoz, aoOuvir, aoParar, rotulo }} />
      </span>
    </label>
  );
}
