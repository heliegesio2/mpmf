import Link from "next/link";

type Props = {
  /** Só o símbolo, sem o texto. */
  soMarca?: boolean;
  className?: string;
  /**
   * Destino ao clicar. Por padrão a marca leva pra home (`/`). Passe `null`
   * pra renderizar sem link (ex.: quando já está dentro de um <Link>).
   */
  href?: string | null;
};

/**
 * Marca do PDV Já: sacola de compras com o "check" de venda concluída.
 * Cores puxadas do globals.css (azul / âmbar / tinta).
 * Por padrão é um link pra home — a marca sempre volta pro início.
 */
export default function Logo({ soMarca, className, href = "/" }: Props) {
  const conteudo = (
    <span className={`logo${className ? " " + className : ""}`}>
      <svg className="logo-marca" viewBox="0 0 32 32" role="img" aria-label="PDV Já">
        <path
          d="M8 12h16l-1.5 12.3a2 2 0 0 1-2 1.7H11.5a2 2 0 0 1-2-1.7L8 12z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M12 12v-1.6a4 4 0 0 1 8 0V12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
        <path
          d="M12.6 18.4l2.4 2.4 4.6-5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!soMarca && (
        <span className="logo-nome">
          pdv<b>já</b>
        </span>
      )}
    </span>
  );

  if (href === null) return conteudo;
  return (
    <Link href={href} className="logo-link" aria-label="PDV Já — início">
      {conteudo}
    </Link>
  );
}
