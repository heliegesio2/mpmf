"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Opcoes = {
  aoFinalizar: (texto: string) => void;
  aoErrar?: (mensagem: string) => void;
};

/**
 * Reconhecimento de fala em pt-BR, um campo por vez.
 * Devolve o campo que está ouvindo, para a interface destacar só ele.
 */
export function useVoz({ aoFinalizar, aoErrar }: Opcoes) {
  const [ouvindoCampo, setOuvindoCampo] = useState<string | null>(null);
  const [disponivel, setDisponivel] = useState(false);
  const reconhecimento = useRef<any>(null);
  const campoAtual = useRef<string | null>(null);
  const callbacks = useRef({ aoFinalizar, aoErrar });

  callbacks.current = { aoFinalizar, aoErrar };

  useEffect(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    setDisponivel(true);
    const sr = new SR();
    sr.lang = "pt-BR";
    sr.continuous = false;
    sr.interimResults = false;
    sr.maxAlternatives = 1;

    sr.onresult = (e: any) => {
      const texto = e.results[0][0].transcript.trim();
      if (texto) callbacks.current.aoFinalizar(texto);
    };
    sr.onerror = (e: any) => {
      callbacks.current.aoErrar?.(
        e.error === "not-allowed"
          ? "Libere o microfone nas permissões do navegador."
          : "Não entendi. Toque no microfone e fale de novo."
      );
    };
    sr.onend = () => {
      setOuvindoCampo(null);
      campoAtual.current = null;
    };

    reconhecimento.current = sr;
    return () => sr.abort();
  }, []);

  const parar = useCallback(() => {
    if (!campoAtual.current) return;
    campoAtual.current = null;
    setOuvindoCampo(null);
    reconhecimento.current?.stop();
  }, []);

  const ouvir = useCallback((campo: string) => {
    const sr = reconhecimento.current;
    if (!sr) return;

    if (campoAtual.current) {
      sr.stop();
      if (campoAtual.current === campo) return;
    }

    campoAtual.current = campo;
    setOuvindoCampo(campo);
    try {
      sr.start();
    } catch {
      /* já estava iniciado */
    }
  }, []);

  return { ouvir, parar, ouvindoCampo, campoAtual, disponivel };
}
