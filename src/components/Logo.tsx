type Props = {
  /** Só o símbolo, sem o texto. */
  soMarca?: boolean;
  className?: string;
};

/**
 * Marca do PDV Já: sacola de compras com o "check" de venda concluída.
 * Cores puxadas do globals.css (verde escuro / âmbar / creme).
 */
export default function Logo({ soMarca, className }: Props) {
  return (
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
}
