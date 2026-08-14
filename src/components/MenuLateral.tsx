"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Sessao = {
  nome: string;
  papel: "super_admin" | "admin" | "operador";
  empresaNome: string | null;
};

const LOJA = [
  { href: "/", rotulo: "Consultar preço", descricao: "Fale ou digite" },
  { href: "/venda", rotulo: "Venda", descricao: "Ditar itens e fechar" },
  { href: "/produtos", rotulo: "Produtos", descricao: "Incluir, alterar, excluir" },
  { href: "/custos", rotulo: "Gastos", descricao: "Fale descrição, quem recebeu e o valor" },
  { href: "/cascos", rotulo: "Cascos", descricao: "Registrar empréstimo de cascos" },
];

const ADMIN = [
  { href: "/admin/empresas", rotulo: "Empresas", descricao: "Aprovar ou reprovar" },
];

export default function MenuLateral() {
  const caminho = usePathname();
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [sessao, setSessao] = useState<Sessao | null>(null);

  useEffect(() => setAberto(false), [caminho]);

  useEffect(() => {
    fetch("/api/auth/sessao")
      .then((r) => r.json())
      .then((d) => setSessao(d.sessao))
      .catch(() => setSessao(null));
  }, [caminho]);

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
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

  return (
    <>
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
