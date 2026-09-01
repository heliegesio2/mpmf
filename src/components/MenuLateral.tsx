"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { esquecerCarrinho, useCarrinho } from "@/lib/carrinho";

type Sessao = {
  nome: string;
  papel: "super_admin" | "admin" | "operador";
  empresaNome: string | null;
};

const LOJA = [
  { href: "/", rotulo: "Consultar preço", descricao: "Fale ou digite" },
  { href: "/venda", rotulo: "Venda", descricao: "Ditar itens e fechar" },
  { href: "/produtos", rotulo: "Produtos", descricao: "Incluir, alterar, excluir" },
  { href: "/compras/importar", rotulo: "Importar compra", descricao: "Foto do cupom vira preço" },
  { href: "/custos", rotulo: "Gastos", descricao: "Fale descrição, quem recebeu e o valor" },
  { href: "/cascos", rotulo: "Cascos", descricao: "Registrar empréstimo de cascos" },
  { href: "/caixa", rotulo: "Caixa", descricao: "Informar o valor final do dia" },
  { href: "/relatorios", rotulo: "Relatórios", descricao: "Gastos, estoque, caixa e alertas" },
];

const ADMIN = [
  { href: "/admin/empresas", rotulo: "Empresas", descricao: "Aprovar ou reprovar" },
];

export default function MenuLateral() {
  const caminho = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const { itens: itensCarrinho } = useCarrinho();

  useEffect(() => setAberto(false), [caminho]);

  useEffect(() => {
    fetch("/api/auth/sessao")
      .then((r) => r.json())
      .then((d) => setSessao(d.sessao))
      .catch(() => setSessao(null));
  }, [caminho]);

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    esquecerCarrinho();
    router.replace("/login");
    router.refresh();
  }

  // nas telas de login e cadastro o menu nao aparece
  if (!sessao || caminho.startsWith("/login") || caminho.startsWith("/cadastro")) {
    return null;
  }

  // super admin sem empresa propria: so ve a area de aprovar empresas.
  // com empresa propria (caso da Mercadinho): ve os dois blocos de menu.
  const paginas =
    sessao.papel === "super_admin"
      ? sessao.empresaNome
        ? [...ADMIN, ...LOJA]
        : ADMIN
      : LOJA;

  // super admin sem loja própria não vende — não mostra o atalho do carrinho
  const temLoja = sessao.papel !== "super_admin" || Boolean(sessao.empresaNome);

  return (
    <>
      {temLoja && (
        <Link
          href="/venda"
          className="atalho-venda"
          data-ativo={caminho === "/venda"}
          aria-label={
            itensCarrinho.length > 0
              ? `Abrir a venda (${itensCarrinho.length} ${itensCarrinho.length === 1 ? "item" : "itens"})`
              : "Abrir a venda"
          }
          title="Venda"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M3 4h2l2.3 12.2a1 1 0 0 0 1 .8h9.1a1 1 0 0 0 1-.8L21 8H6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="10" cy="20" r="1.5" fill="currentColor" />
            <circle cx="17" cy="20" r="1.5" fill="currentColor" />
          </svg>
          {itensCarrinho.length > 0 && (
            <span className="atalho-venda-contador">{itensCarrinho.length}</span>
          )}
        </Link>
      )}

      <button
        type="button"
        className="abrir-menu"
        onClick={() => setAberto(true)}
        aria-label="Abrir menu"
        aria-expanded={aberto}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
      </button>

      {aberto && <div className="fundo-menu" onClick={() => setAberto(false)} />}

      <nav className="menu" data-aberto={aberto} aria-label="Seções">
        <div className="menu-marca">
          {sessao.empresaNome ?? "Administração"}
          <span>{sessao.papel === "super_admin" ? "super admin" : "balcão"}</span>
        </div>

        <ul>
          {paginas.map((p) => (
            <li key={p.href}>
              <Link href={p.href} data-ativo={caminho === p.href}>
                <strong>{p.rotulo}</strong>
                <span>{p.descricao}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="menu-rodape">
          <p className="menu-usuario">{sessao.nome}</p>
          <button type="button" className="botao neutro" onClick={sair}>
            Sair
          </button>
        </div>

        <button type="button" className="fechar-menu" onClick={() => setAberto(false)}>
          Fechar
        </button>
      </nav>
    </>
  );
}
