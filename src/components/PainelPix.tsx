"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  valor: number;
  txid: string;
  /** true quando o caixa marcou que recebeu o Pix. */
  confirmado: boolean;
  aoConfirmar: () => void;
};

const moeda = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * QR estatico do Pix, gerado da chave da empresa (ver /configuracoes).
 * Nao ha confirmacao automatica — o caixa confere o comprovante e marca
 * "Recebi o Pix".
 */
export default function PainelPix({ valor, txid, confirmado, aoConfirmar }: Props) {
  const [copiaECola, setCopiaECola] = useState<string | null>(null);
  const [imagem, setImagem] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch("/api/pix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valor, txid }),
        });
        const dados = await r.json();
        if (!r.ok) {
          throw new Error(
            [dados?.erro, dados?.detalhe].filter(Boolean).join(" — ") ||
              "Não foi possível gerar o Pix."
          );
        }
        if (cancelado) return;
        setCopiaECola(dados.copiaECola);
        setImagem(await QRCode.toDataURL(dados.copiaECola, { width: 320, margin: 1 }));
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Falha ao gerar o Pix.");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [valor, txid]);

  async function copiar() {
    if (!copiaECola) return;
    await navigator.clipboard.writeText(copiaECola);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (erro) return <p className="dica" data-erro="true">{erro}</p>;
  if (!copiaECola) return <p className="vazio">Gerando o QR do Pix…</p>;

  return (
    <div className="pix" data-aprovado={confirmado}>
      {imagem && (
        <img className="pix-qr" src={imagem} alt="QR code do Pix" width={220} height={220} />
      )}

      <div className="pix-lado">
        <p className="pix-valor">R$ {moeda.format(valor)}</p>

        {confirmado ? (
          <p className="pix-status aprovado">Pix recebido</p>
        ) : (
          <p className="pix-status manual">
            Confira o comprovante no seu app antes de marcar como recebido.
          </p>
        )}

        <button type="button" className="botao neutro" onClick={copiar}>
          {copiado ? "Código copiado" : "Copiar código Pix"}
        </button>

        {!confirmado && (
          <button type="button" className="botao primario" onClick={aoConfirmar}>
            Recebi o Pix
          </button>
        )}
      </div>
    </div>
  );
}
