"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AjusteFonte from "@/components/AjusteFonte";
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
  { href: "/clientes", rotulo: "Clientes", descricao: "Cadastro com foto, para fiado" },
  { href: "/contas", rotulo: "Contas a receber", descricao: "Fiado em aberto e quitação" },
];

const ADMIN = [
  { href: "/admin/empresas", rotulo: "Empresas", descricao: "Aprovar ou reprovar" },
];

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

export default function MenuLateral() {
  const caminho = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [contaAberta, setContaAberta] = useState(false);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const { itens: itensCarrinho } = useCarrinho();

  useEffect(() => {
    setAberto(false);
    setContaAberta(false);
  }, [caminho]);

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
        <div className="menu-conta" data-aberta={contaAberta}>
          <button
            type="button"
            className="menu-conta-cabeca"
            onClick={() => setContaAberta((v) => !v)}
            aria-expanded={contaAberta}
          >
            <span className="menu-conta-avatar" aria-hidden="true">{iniciais(sessao.nome)}</span>
            <span className="menu-conta-id">
              <strong>{sessao.nome}</strong>
              <span>
                {sessao.empresaNome ?? "Administração"}
                {sessao.papel === "super_admin" ? " · super admin" : ""}
              </span>
            </span>
            <svg className="menu-conta-seta" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {contaAberta && (
            <div className="menu-conta-acoes">
              <div className="menu-conta-fonte">
                <span>Tamanho da letra</span>
                <AjusteFonte />
              </div>
              {temLoja && (
                <Link href="/configuracoes" data-ativo={caminho === "/configuracoes"}>
                  Configurações da empresa
                </Link>
              )}
              <Link href="/perfil" data-ativo={caminho === "/perfil"}>
                Meu perfil
              </Link>
              <Link href="/senha" data-ativo={caminho === "/senha"}>
                Trocar senha
              </Link>
              <button type="button" onClick={sair}>
                Sair
              </button>
            </div>
          )}
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

        <button type="button" className="fechar-menu" onClick={() => setAberto(false)}>
          Fechar
        </button>
      </nav>
    </>
  );
}
