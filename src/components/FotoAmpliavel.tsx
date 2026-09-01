"use client";

import { useEffect, useState } from "react";

type Props = {
  src: string;
  alt: string;
  className?: string;
};

/**
 * Miniatura que amplia numa camada por cima da tela ao clicar. Some sozinha
 * se a imagem não existir (404) — usado com as fotos de produto/cliente, que
 * podem não ter foto.
 */
export default function FotoAmpliavel({ src, alt, className }: Props) {
  const [falhou, setFalhou] = useState(false);
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    if (!aberta) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setAberta(false);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aberta]);

  if (falhou) return null;

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={className}
        src={src}
        alt={alt}
        onError={() => setFalhou(true)}
        onClick={() => setAberta(true)}
        style={{ cursor: "zoom-in" }}
      />

      {aberta && (
        <div
          className="foto-overlay"
          role="dialog"
          aria-label={alt}
          onClick={() => setAberta(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="foto-overlay-img" src={src} alt={alt} />
        </div>
      )}
    </>
  );
}
