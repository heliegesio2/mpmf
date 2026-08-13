/**
 * Monta o "Pix copia e cola" (BR Code, padrão EMV do Banco Central).
 * Serve para gerar o QR estático a partir da chave, sem depender de API.
 */

function campo(id: string, valor: string): string {
  return id + String(valor.length).padStart(2, "0") + valor;
}

/** CRC16-CCITT-FALSE: polinômio 0x1021, valor inicial 0xFFFF. */
export function crc16(texto: string): string {
  let crc = 0xffff;
  for (let i = 0; i < texto.length; i++) {
    crc ^= texto.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Remove acento e limita o tamanho — o BR Code não aceita caractere especial. */
function limpar(t: string, max: number): string {
  return t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .slice(0, max)
    .toUpperCase();
}

/**
 * Chave de telefone precisa do formato internacional: +5511989902144.
 * CPF vai só com dígitos, e-mail e chave aleatória vão como estão.
 */
export function normalizarChave(chave: string): string {
  const t = chave.trim();
  if (t.includes("@")) return t;

  const digitos = t.replace(/\D/g, "");
  if (t.startsWith("+")) return "+" + digitos;
  if (digitos.length === 11 && !t.includes(".")) return "+55" + digitos; // celular
  if (digitos.length === 13 && digitos.startsWith("55")) return "+" + digitos;
  return t;
}

export type DadosPix = {
  chave: string;
  valor: number;
  nome: string;
  cidade: string;
  /** Identificador da venda. Sem espaço, até 25 caracteres. */
  txid?: string;
};

export function gerarBrCode({ chave, valor, nome, cidade, txid }: DadosPix): string {
  const conta =
    campo("00", "br.gov.bcb.pix") + campo("01", normalizarChave(chave));

  const identificador = (txid ?? "***").replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "***";

  const semCrc =
    campo("00", "01") +
    campo("01", "12") + // 12 = QR que pode ser pago mais de uma vez
    campo("26", conta) +
    campo("52", "0000") +
    campo("53", "986") + // real
    campo("54", valor.toFixed(2)) +
    campo("58", "BR") +
    campo("59", limpar(nome, 25) || "RECEBEDOR") +
    campo("60", limpar(cidade, 15) || "SAO PAULO") +
    campo("62", campo("05", identificador)) +
    "6304";

  return semCrc + crc16(semCrc);
}
