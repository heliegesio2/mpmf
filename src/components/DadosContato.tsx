"use client";

import BotaoCopiar from "@/components/BotaoCopiar";
import { linkWhatsapp } from "@/lib/whatsapp";

type Props = {
  telefone?: string | null;
  /** Telefone marcado como WhatsApp. */
  whatsapp?: boolean;
  /** Endereço e/ou cidade — vira um link pro mapa. */
  local?: string | null;
  documento?: string | null;
  /** Chave Pix (fornecedor ou loja). */
  pixChave?: string | null;
};

const IconeWhatsapp = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.99.55 3.85 1.5 5.44L2 22l4.79-1.25a9.9 9.9 0 0 0 5.25 1.5h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2zm5.8 14.06c-.24.68-1.4 1.3-1.93 1.35-.53.05-1.02.24-3.44-.72-2.9-1.14-4.73-4.14-4.87-4.33-.14-.19-1.16-1.55-1.16-2.95 0-1.4.73-2.09.99-2.37.26-.28.57-.35.76-.35h.55c.18 0 .42-.07.65.5.24.58.81 2 .88 2.14.07.14.12.31.02.5-.09.19-.14.31-.28.47-.14.16-.29.36-.42.48-.14.14-.28.29-.12.57.16.28.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.22 1.37.28.14.44.12.6-.07.16-.19.69-.81.88-1.09.19-.28.37-.23.63-.14.26.09 1.65.78 1.93.92.28.14.47.21.53.33.07.12.07.68-.17 1.36z" />
  </svg>
);

const IconePin = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="10" r="2.6" stroke="currentColor" strokeWidth="2" />
  </svg>
);

const IconeTelefone = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M4 5c0-.6.4-1 1-1h3l1.5 4-2 1.5a12 12 0 0 0 6 6l1.5-2 4 1.5v3c0 .6-.4 1-1 1A16 16 0 0 1 4 5z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const IconePix = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l3.5 3.5-2.1 2.1a2 2 0 0 1-2.8 0L8.5 5.5 12 2zm-6.5 6.5L8 6.4l2.1 2.1a3.5 3.5 0 0 0 5 0L17.2 6.4l2.3 2.1L17 11a5.5 5.5 0 0 0 0 2l2.5 2.5-2.3 2.1-2.1-2.1a3.5 3.5 0 0 0-5 0L8 19.6l-2.5-2.1L8 15a5.5 5.5 0 0 0 0-6L5.5 8.5zM12 22l-3.5-3.5 2.1-2.1a2 2 0 0 1 2.8 0l2.1 2.1L12 22z" />
  </svg>
);

/**
 * Bloco de contato reaproveitado nas listas (fornecedores, clientes, cascos,
 * empresas): telefone com copiar + atalho WhatsApp, endereço com pin de mapa,
 * chave Pix com copiar.
 */
export default function DadosContato({ telefone, whatsapp, local, documento, pixChave }: Props) {
  const tel = String(telefone ?? "").trim();
  const wa = whatsapp ? linkWhatsapp(tel) : null;
  const lugar = String(local ?? "").trim();
  const pix = String(pixChave ?? "").trim();
  const doc = String(documento ?? "").trim();

  if (!tel && !lugar && !pix && !doc) return null;

  return (
    <span className="contato-acoes">
      {doc && <span className="contato-chip">{doc}</span>}

      {tel && (
        <span className="contato-chip">
          {IconeTelefone}
          <a href={`tel:${tel.replace(/[^\d+]/g, "")}`}>{tel}</a>
          <BotaoCopiar texto={tel} titulo="Copiar telefone" />
          {wa && (
            <a
              className="zap-link zap-link-mini"
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir conversa no WhatsApp"
              title="WhatsApp"
            >
              {IconeWhatsapp}
            </a>
          )}
        </span>
      )}

      {lugar && (
        <a
          className="contato-chip"
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(lugar)}`}
          target="_blank"
          rel="noopener noreferrer"
          title="Abrir no mapa"
        >
          {IconePin}
          {lugar}
        </a>
      )}

      {pix && (
        <span className="contato-chip contato-chip-pix">
          {IconePix}
          <span className="chip-pix-valor">Pix: {pix}</span>
          <BotaoCopiar texto={pix} titulo="Copiar chave Pix" rotulo="Copiar Pix" />
        </span>
      )}
    </span>
  );
}
