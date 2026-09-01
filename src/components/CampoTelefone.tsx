"use client";

import { linkWhatsapp } from "@/lib/whatsapp";

const IconeWhatsapp = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.99.55 3.85 1.5 5.44L2 22l4.79-1.25a9.9 9.9 0 0 0 5.25 1.5h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.06c-.24.68-1.4 1.3-1.93 1.35-.53.05-1.02.24-3.44-.72-2.9-1.14-4.73-4.14-4.87-4.33-.14-.19-1.16-1.55-1.16-2.95 0-1.4.73-2.09.99-2.37.26-.28.57-.35.76-.35h.55c.18 0 .42-.07.65.5.24.58.81 2 .88 2.14.07.14.12.31.02.5-.09.19-.14.31-.28.47-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.19-.28.37-.23.63-.14.26.09 1.65.78 1.93.92.28.14.47.21.53.33.07.12.07.68-.17 1.36z" />
  </svg>
);

type Props = {
  rotulo?: string;
  valor: string;
  aoMudar: (v: string) => void;
  ehWhatsapp: boolean;
  aoMudarWhatsapp: (v: boolean) => void;
  /** identificador do campo pra voz */
  campo: string;
  ouvindo: boolean;
  temVoz: boolean;
  aoOuvir: (campo: string) => void;
  aoParar?: () => void;
  largo?: boolean;
};

/**
 * Campo de telefone com microfone, checkbox "É WhatsApp" e, quando marcado e
 * com número, um atalho pra abrir a conversa no WhatsApp.
 */
export default function CampoTelefone({
  rotulo = "Telefone",
  valor,
  aoMudar,
  ehWhatsapp,
  aoMudarWhatsapp,
  campo,
  ouvindo,
  temVoz,
  aoOuvir,
  aoParar,
  largo,
}: Props) {
  const wa = ehWhatsapp ? linkWhatsapp(valor) : null;

  return (
    <div className={`rotulo${largo ? " largo" : ""}`}>
      {rotulo}
      <span className="entrada" data-ouvindo={ouvindo}>
        <input
          value={valor}
          inputMode="tel"
          placeholder="11989902144"
          autoComplete="off"
          onChange={(e) => {
            if (ouvindo) aoParar?.();
            aoMudar(e.target.value);
          }}
        />

        {wa && (
          <a
            className="mic-campo whatsapp"
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Abrir conversa no WhatsApp"
            title="Enviar mensagem no WhatsApp"
          >
            {IconeWhatsapp}
          </a>
        )}

        <button
          type="button"
          className="mic-campo"
          data-ouvindo={ouvindo}
          disabled={!temVoz}
          onClick={() => (ouvindo ? aoParar?.() : aoOuvir(campo))}
          aria-label={ouvindo ? `Parar de ouvir ${rotulo}` : `Falar ${rotulo}`}
          title={temVoz ? undefined : "Este navegador não reconhece fala. Use o Chrome."}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </span>

      <label className="check-whatsapp">
        <input
          type="checkbox"
          checked={ehWhatsapp}
          onChange={(e) => aoMudarWhatsapp(e.target.checked)}
        />
        Esse número é WhatsApp
      </label>
    </div>
  );
}
