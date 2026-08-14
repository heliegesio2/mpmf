"use client";

import { useEffect, useState } from "react";

const CHAVE = "fonteGrande";

export default function AjusteFonte() {
  const [grande, setGrande] = useState(false);

  useEffect(() => {
    setGrande(document.documentElement.getAttribute("data-fonte") === "grande");
  }, []);

  function aplicar(valor: boolean) {
    setGrande(valor);
    if (valor) {
      document.documentElement.setAttribute("data-fonte", "grande");
      localStorage.setItem(CHAVE, "1");
    } else {
      document.documentElement.removeAttribute("data-fonte");
      localStorage.removeItem(CHAVE);
    }
  }

  return (
    <div className="ajuste-fonte" role="group" aria-label="Tamanho da letra">
      <button
        type="button"
        className="botao-fonte"
        data-ativo={!grande}
        aria-pressed={!grande}
        aria-label="Letra do tamanho normal"
        onClick={() => aplicar(false)}
      >
        a
      </button>
      <button
        type="button"
        className="botao-fonte grande"
        data-ativo={grande}
        aria-pressed={grande}
        aria-label="Aumentar o tamanho da letra"
        onClick={() => aplicar(true)}
      >
        A
      </button>
    </div>
  );
}
