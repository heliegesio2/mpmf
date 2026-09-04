"use client";

import { useEffect, useRef } from "react";
import { comprimirParaDataURL } from "@/lib/imagemCliente";

type Props = {
  /** Conteúdo em HTML (negrito/itálico/lista/imagem colada). */
  valor: string;
  aoMudar: (html: string) => void;
  placeholder?: string;
  aoErro?: (mensagem: string) => void;
};

/**
 * Caixa de texto "maleável": negrito/itálico/lista (via `execCommand`, sem
 * lib) e cola de imagem direto do clipboard (print de tela) — comprime e
 * insere como `<img>` no meio do texto. O valor salvo é o HTML mesmo.
 *
 * Sincroniza `valor` no DOM só quando o campo não está focado, pra não
 * atropelar o cursor a cada tecla (contentEditable não é um input comum).
 */
export default function CampoTextoRico({ valor, aoMudar, placeholder, aoErro }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const focado = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || focado.current) return;
    if (el.innerHTML !== valor) el.innerHTML = valor;
  }, [valor]);

  function comando(nome: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(nome, false, arg);
    aoMudar(ref.current?.innerHTML ?? "");
  }

  async function aoColar(e: React.ClipboardEvent<HTMLDivElement>) {
    const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
    if (!item) return; // sem imagem: deixa o navegador colar o texto normalmente
    e.preventDefault();
    const arquivo = item.getAsFile();
    if (!arquivo) return;
    try {
      const dataUrl = await comprimirParaDataURL(arquivo, { maxLado: 1000, qualidade: 0.7 });
      document.execCommand("insertImage", false, dataUrl);
      aoMudar(ref.current?.innerHTML ?? "");
    } catch {
      aoErro?.("Não consegui colar essa imagem.");
    }
  }

  return (
    <div className="campo-rico">
      <div className="campo-rico-barra">
        <button
          type="button"
          className="campo-rico-botao"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => comando("bold")}
          title="Negrito"
          aria-label="Negrito"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className="campo-rico-botao"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => comando("italic")}
          title="Itálico"
          aria-label="Itálico"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className="campo-rico-botao"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => comando("insertUnorderedList")}
          title="Lista"
          aria-label="Lista com marcadores"
        >
          ≡
        </button>
        <span className="campo-rico-dica">cola um print pra inserir a imagem</span>
      </div>
      <div
        ref={ref}
        className="campo-rico-area"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onFocus={() => {
          focado.current = true;
        }}
        onBlur={() => {
          focado.current = false;
        }}
        onInput={() => aoMudar(ref.current?.innerHTML ?? "")}
        onPaste={aoColar}
      />
    </div>
  );
}
