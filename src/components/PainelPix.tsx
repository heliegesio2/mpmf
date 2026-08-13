"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

type Cobranca = {
  modo: "mercadopago" | "estatico";
  pagamentoId?: string;
  copiaECola: string | null;
  imagemBase64?: string | null;
  status: string;
};

type Props = {
  valor: number;
  txid: string;
  /** Chamado quando o Mercado Pago confirma o pagamento. */
  aoAprovar: () => void;
};

const moeda = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export default function PainelPix({ valor, txid, aoAprovar }: Props) {
  const [cobranca, setCobranca] = useState<Cobranca | null>(null);
  const [imagem, setImagem] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [aprovado, setAprovado] = useState(false);
  const jaAvisou = useRef(false);

  // ---------- cria a cobrança ----------
  useEffect(() => {
    let cancelado = false;

    (async () => {
      try {
        const r = await fetch("/api/pix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ valor, txid, descricao: "Venda no balcão" }),
        });
        const dados = await r.json();
        if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível gerar o Pix.");
        if (cancelado) return;

        setCobranca(dados);

        if (dados.imagemBase64) {
          setImagem(`data:image/png;base64,${dados.imagemBase64}`);
        } else if (dados.copiaECola) {
          // o Mercado Pago não mandou imagem, então desenhamos o QR aqui
          setImagem(
            await QRCode.toDataURL(dados.copiaECola, { width: 320, margin: 1 })
          );
        }
      } catch (e) {
        if (!cancelado) setErro(e instanceof Error ? e.message : "Falha ao gerar o Pix.");
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [valor, txid]);

  // ---------- acompanha a confirmação ----------
  const verificar = useCallback(async (id: string) => {
    try {
      const r = await fetch(`/api/pix/${id}`);
      const dados = await r.json();
      if (r.ok && dados.status === "approved") {
        setAprovado(true);
        if (!jaAvisou.current) {
          jaAvisou.current = true;
          aoAprovar();
        }
      }
    } catch {
      /* tenta de novo no próximo ciclo */
    }
  }, [aoAprovar]);

  useEffect(() => {
    if (cobranca?.modo !== "mercadopago" || !cobranca.pagamentoId || aprovado) return;
    const id = cobranca.pagamentoId;
    const t = setInterval(() => verificar(id), 4000);
    return () => clearInterval(t);
  }, [cobranca, aprovado, verificar]);

  async function copiar() {
    if (!cobranca?.copiaECola) return;
    await navigator.clipboard.writeText(cobranca.copiaECola);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  }

  if (erro) return <p className="dica" data-erro="true">{erro}</p>;
  if (!cobranca) return <p className="vazio">Gerando o QR do Pix…</p>;

  return (
    <div className="pix" data-aprovado={aprovado}>
      {imagem ? (
        <img className="pix-qr" src={imagem} alt="QR code do Pix" width={220} height={220} />
      ) : (
        <p className="vazio">Sem QR disponível.</p>
      )}

      <div className="pix-lado">
        <p className="pix-valor">R$ {moeda.format(valor)}</p>

        {aprovado ? (
          <p className="pix-status aprovado">Pagamento confirmado</p>
        ) : cobranca.modo === "mercadopago" ? (
          <p className="pix-status">Aguardando o pagamento…</p>
        ) : (
          <p className="pix-status manual">
            QR da chave. Confira o comprovante antes de finalizar — esta forma não
            avisa quando o cliente paga.
          </p>
        )}

        {cobranca.copiaECola && (
          <button type="button" className="botao neutro" onClick={copiar}>
            {copiado ? "Código copiado" : "Copiar código Pix"}
          </button>
        )}
      </div>
    </div>
  );
}
