"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AjusteFonte from "@/components/AjusteFonte";
import Logo from "@/components/Logo";
import { esquecerCarrinho, useCarrinho } from "@/lib/carrinho";

type Sessao = {
  nome: string;
  papel: "super_admin" | "admin" | "operador";
  empresaNome: string | null;
  /** Presente quando um super admin usou "entrar como" e está nesta sessão. */
  origem: { usuarioId: number; nome: string } | null;
};

type ItemMenu = { href: string; rotulo: string; descricao: string };
type GrupoMenu = {
  id: string;
  icone: string;
  rotulo: string;
  /** Grupo com subitens. */
  itens?: ItemMenu[];
  /** Grupo que é um link direto (sem subitens). */
  href?: string;
};

const GRUPOS_LOJA: GrupoMenu[] = [
  {
    id: "balcao",
    icone: "🛒",
    rotulo: "Balcão",
    itens: [
      { href: "/", rotulo: "Consultar preço", descricao: "Fale ou digite" },
      { href: "/venda", rotulo: "Venda", descricao: "Ditar itens e fechar" },
      { href: "/vendas", rotulo: "Vendas do dia", descricao: "Histórico por data, valor e pagamento" },
      { href: "/caixa", rotulo: "Caixa", descricao: "Informar o valor final do dia" },
    ],
  },
  {
    id: "produtos",
    icone: "📦",
    rotulo: "Produtos",
    itens: [
      { href: "/produtos", rotulo: "Produtos", descricao: "Incluir, alterar, excluir" },
      { href: "/compras/importar", rotulo: "Importar compra", descricao: "Foto do cupom vira preço" },
    ],
  },
  {
    id: "financeiro",
    icone: "💰",
    rotulo: "Financeiro",
    itens: [
      { href: "/contas-pagar", rotulo: "Contas a pagar", descricao: "Boletos e notas a vencer" },
      { href: "/contas", rotulo: "Contas a receber", descricao: "Fiado em aberto e quitação" },
      { href: "/custos", rotulo: "Investimentos", descricao: "Fale descrição, quem recebeu e o valor" },
    ],
  },
  {
    id: "cadastros",
    icone: "👥",
    rotulo: "Cadastros",
    itens: [
      { href: "/clientes", rotulo: "Clientes", descricao: "Cadastro com foto, para fiado" },
      { href: "/fornecedores", rotulo: "Fornecedores", descricao: "Cadastro de quem te abastece" },
      { href: "/cascos", rotulo: "Empréstimos", descricao: "Item retirado por um cliente" },
    ],
  },
  { id: "relatorios", icone: "📊", rotulo: "Relatórios", href: "/relatorios" },
  { id: "anotacoes", icone: "📝", rotulo: "Anotações", href: "/anotacoes" },
];

const GRUPO_ADMIN: GrupoMenu = {
  id: "admin",
  icone: "🏢",
  rotulo: "Administração",
  itens: [
    { href: "/admin/empresas", rotulo: "Empresas", descricao: "Aprovar ou reprovar" },
    { href: "/admin/fornecedores", rotulo: "Fornecedores", descricao: "Aprovar cadastros e bairros" },
  ],
};

const TODOS_GRUPOS = [...GRUPOS_LOJA, GRUPO_ADMIN];

function grupoDoCaminho(caminho: string): string | null {
  const g = TODOS_GRUPOS.find(
    (g) => g.href === caminho || g.itens?.some((i) => i.href === caminho)
  );
  return g?.id ?? null;
}

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
  const [semFoto, setSemFoto] = useState(false);
  const [sessao, setSessao] = useState<Sessao | null>(null);
  const [alertasAnotacoes, setAlertasAnotacoes] = useState(0);
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(
    () => new Set(["balcao", grupoDoCaminho(caminho)].filter(Boolean) as string[])
  );
  const { itens: itensCarrinho } = useCarrinho();

  useEffect(() => {
    setAberto(false);
    setContaAberta(false);
    // abre o grupo que contém a tela atual (sem fechar os outros)
    const id = grupoDoCaminho(caminho);
    if (id) setGruposAbertos((s) => (s.has(id) ? s : new Set(s).add(id)));
  }, [caminho]);

  useEffect(() => {
    fetch("/api/auth/sessao")
      .then((r) => r.json())
      .then((d) => setSessao(d.sessao))
      .catch(() => setSessao(null));
  }, [caminho]);

  useEffect(() => {
    fetch("/api/anotacoes/alertas")
      .then((r) => (r.ok ? r.json() : { total: 0 }))
      .then((d) => setAlertasAnotacoes(Number(d?.total) || 0))
      .catch(() => setAlertasAnotacoes(0));
  }, [caminho]);

  function alternarGrupo(id: string) {
    setGruposAbertos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    esquecerCarrinho();
    router.replace("/login");
    router.refresh();
  }

  async function voltarAoPainel() {
    const r = await fetch("/api/admin/parar-impersonar", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    esquecerCarrinho();
    router.replace(d?.destino ?? "/admin/empresas");
    router.refresh();
  }

  // nas telas de login e cadastro o menu nao aparece
  if (!sessao || caminho.startsWith("/login") || caminho.startsWith("/cadastro")) {
    return null;
  }

  // super admin sem empresa propria: so ve a area de aprovar empresas.
  // com empresa propria (caso da Mercadinho): ve os dois blocos de menu.
  const grupos =
    sessao.papel === "super_admin"
      ? sessao.empresaNome
        ? [GRUPO_ADMIN, ...GRUPOS_LOJA]
        : [GRUPO_ADMIN]
      : GRUPOS_LOJA;

  // super admin sem loja própria não vende — não mostra o atalho do carrinho
  const temLoja = sessao.papel !== "super_admin" || Boolean(sessao.empresaNome);

  return (
    <>
      {sessao.origem && (
        <div className="faixa-impersonar" role="status">
          <span>
            Você está como <strong>{sessao.nome}</strong>
            {sessao.empresaNome ? ` · ${sessao.empresaNome}` : ""}
          </span>
          <button type="button" onClick={voltarAoPainel}>
            Voltar ao painel ({sessao.origem.nome})
          </button>
        </div>
      )}

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

      {/* menu de conta — canto superior direito, com a foto do usuário */}
      <button
        type="button"
        className="conta-topo"
        onClick={() => setContaAberta((v) => !v)}
        aria-label="Menu da conta"
        aria-expanded={contaAberta}
      >
        {semFoto ? (
          <span className="conta-iniciais" aria-hidden="true">{iniciais(sessao.nome)}</span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/api/auth/foto" alt="" onError={() => setSemFoto(true)} />
        )}
      </button>

      {contaAberta && (
        <>
          <div className="fundo-conta" onClick={() => setContaAberta(false)} />
          <div className="conta-menu" role="menu">
            <div className="conta-menu-cabeca">
              <strong>{sessao.nome}</strong>
              <span>
                {sessao.empresaNome ?? "Administração"}
                {sessao.papel === "super_admin" ? " · super admin" : ""}
              </span>
            </div>

            <div className="conta-menu-fonte">
              <span>Tamanho da letra</span>
              <AjusteFonte />
            </div>

            <div className="conta-menu-acoes">
              {temLoja && (
                <Link href="/configuracoes" role="menuitem" data-ativo={caminho === "/configuracoes"}>
                  Configurações da empresa
                </Link>
              )}
              <Link href="/perfil" role="menuitem" data-ativo={caminho === "/perfil"}>
                Meu perfil
              </Link>
              <Link href="/senha" role="menuitem" data-ativo={caminho === "/senha"}>
                Trocar senha
              </Link>
              <button type="button" role="menuitem" onClick={sair}>
                Sair
              </button>
            </div>
          </div>
        </>
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
        <Link href="/" className="menu-logo" aria-label="PDV Já — início">
          <Logo />
        </Link>
        <div className="menu-marca">
          {sessao.empresaNome ?? "Administração"}
          <span>{sessao.papel === "super_admin" ? "super admin" : "balcão"}</span>
        </div>

        <div className="menu-grupos">
          {grupos.map((g) =>
            g.href && !g.itens ? (
              <Link
                key={g.id}
                href={g.href}
                className="menu-grupo-link"
                data-ativo={caminho === g.href}
              >
                <span className="menu-grupo-icone" aria-hidden="true">{g.icone}</span>
                <strong>{g.rotulo}</strong>
                {g.id === "anotacoes" && alertasAnotacoes > 0 && (
                  <span className="menu-alerta">{alertasAnotacoes}</span>
                )}
              </Link>
            ) : (
              <div key={g.id} className="menu-grupo" data-aberto={gruposAbertos.has(g.id)}>
                <button
                  type="button"
                  className="menu-grupo-cabeca"
                  onClick={() => alternarGrupo(g.id)}
                  aria-expanded={gruposAbertos.has(g.id)}
                >
                  <span className="menu-grupo-icone" aria-hidden="true">{g.icone}</span>
                  <strong>{g.rotulo}</strong>
                  <svg
                    className="menu-grupo-seta"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 9l6 6 6-6"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {gruposAbertos.has(g.id) && (
                  <ul>
                    {g.itens!.map((i) => (
                      <li key={i.href}>
                        <Link href={i.href} data-ativo={caminho === i.href}>
                          <strong>{i.rotulo}</strong>
                          <span>{i.descricao}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          )}
        </div>

        <button type="button" className="fechar-menu" onClick={() => setAberto(false)}>
          Fechar
        </button>
      </nav>
    </>
  );
}
