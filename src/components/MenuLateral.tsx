"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import AjusteFonte from "@/components/AjusteFonte";
import Logo from "@/components/Logo";
import { esquecerCarrinho, useCarrinho } from "@/lib/carrinho";
import { quando } from "@/lib/pedido";

type Aviso = {
  id: number;
  tipo: string;
  titulo: string;
  corpo: string | null;
  link: string | null;
  lida: boolean;
  criado_em: string;
};
const ICONE_AVISO: Record<string, string> = {
  anotacao: "📝",
  pedido: "📦",
  cadastro: "🏢",
  sistema: "🔔",
  cotacao: "💹",
};

type Sessao = {
  nome: string;
  papel: "super_admin" | "admin" | "operador" | "fornecedor";
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
      { href: "/produtos/comercios-grandes", rotulo: "Comércios grandes", descricao: "Preços dos concorrentes: vídeo, foto ou PDF" },
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
      { href: "/diretorio", rotulo: "Buscar fornecedores", descricao: "Fornecedores da região no diretório" },
      { href: "/pedidos", rotulo: "Meus pedidos", descricao: "Pedidos enviados aos fornecedores" },
      { href: "/cascos", rotulo: "Empréstimos", descricao: "Item retirado por um cliente" },
    ],
  },
  { id: "relatorios", icone: "📊", rotulo: "Relatórios", href: "/relatorios" },
  { id: "anotacoes", icone: "📝", rotulo: "Anotações", href: "/anotacoes" },
  { id: "avisos", icone: "🔔", rotulo: "Avisos", href: "/notificacoes" },
];

const GRUPO_ADMIN: GrupoMenu = {
  id: "admin",
  icone: "🏢",
  rotulo: "Administração",
  itens: [
    { href: "/admin/empresas", rotulo: "Empresas", descricao: "Aprovar ou reprovar" },
    { href: "/admin/fornecedores", rotulo: "Fornecedores", descricao: "Aprovar cadastros e bairros" },
    { href: "/admin/avisos", rotulo: "Enviar notificação", descricao: "Aviso pra uma loja ou pra todas" },
  ],
};

const GRUPO_FORNECEDOR: GrupoMenu = {
  id: "fornecedor",
  icone: "🚚",
  rotulo: "Fornecedor",
  itens: [
    { href: "/fornecedor", rotulo: "Meu cadastro", descricao: "Dados e bairros que você atende" },
    { href: "/fornecedor/produtos", rotulo: "Meus produtos", descricao: "Catálogo e portfólio" },
    { href: "/fornecedor/pedidos", rotulo: "Meus pedidos", descricao: "Pedidos recebidos das lojas" },
    { href: "/notificacoes", rotulo: "Avisos", descricao: "Novidades e lembretes" },
  ],
};

const TODOS_GRUPOS = [...GRUPOS_LOJA, GRUPO_ADMIN, GRUPO_FORNECEDOR];

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
  const [avisosNaoLidos, setAvisosNaoLidos] = useState(0);
  const [avisosAberto, setAvisosAberto] = useState(false);
  const [avisosLista, setAvisosLista] = useState<Aviso[]>([]);
  const [gruposAbertos, setGruposAbertos] = useState<Set<string>>(
    () => new Set(["balcao", grupoDoCaminho(caminho)].filter(Boolean) as string[])
  );
  const { itens: itensCarrinho } = useCarrinho();

  useEffect(() => {
    setAberto(false);
    setContaAberta(false);
    setAvisosAberto(false);
    // abre o grupo que contém a tela atual (sem fechar os outros)
    const id = grupoDoCaminho(caminho);
    if (id) setGruposAbertos((s) => (s.has(id) ? s : new Set(s).add(id)));
  }, [caminho]);

  async function abrirAvisos() {
    const abrindo = !avisosAberto;
    setAvisosAberto(abrindo);
    setContaAberta(false);
    if (abrindo) {
      try {
        const d = await fetch("/api/notificacoes").then((r) => r.json());
        setAvisosLista((d.itens ?? []).slice(0, 8));
        setAvisosNaoLidos(Number(d.naoLidas) || 0);
      } catch {
        /* deixa a lista como está */
      }
    }
  }

  async function abrirAviso(a: Aviso) {
    if (!a.lida) {
      setAvisosLista((xs) => xs.map((x) => (x.id === a.id ? { ...x, lida: true } : x)));
      setAvisosNaoLidos((n) => Math.max(0, n - 1));
      fetch(`/api/notificacoes/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lida: true }),
      }).catch(() => {});
    }
    setAvisosAberto(false);
    if (a.link) router.push(a.link);
  }

  async function marcarTodosAvisos() {
    setAvisosLista((xs) => xs.map((x) => ({ ...x, lida: true })));
    setAvisosNaoLidos(0);
    await fetch("/api/notificacoes/marcar-todas", { method: "POST" }).catch(() => {});
  }

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

  useEffect(() => {
    fetch("/api/notificacoes?resumo=1")
      .then((r) => (r.ok ? r.json() : { naoLidas: 0 }))
      .then((d) => setAvisosNaoLidos(Number(d?.naoLidas) || 0))
      .catch(() => setAvisosNaoLidos(0));
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

  // login, cadastro e o portfólio público (/p/...) não têm o menu do app
  if (
    !sessao ||
    caminho.startsWith("/login") ||
    caminho.startsWith("/cadastro") ||
    caminho.startsWith("/p/")
  ) {
    return null;
  }

  const ehFornecedor = sessao.papel === "fornecedor";

  // super admin sem empresa propria: so ve a area de aprovar empresas.
  // com empresa propria (caso da Mercadinho): ve os dois blocos de menu.
  // fornecedor: so a propria area.
  const grupos = ehFornecedor
    ? [GRUPO_FORNECEDOR]
    : sessao.papel === "super_admin"
      ? sessao.empresaNome
        ? [GRUPO_ADMIN, ...GRUPOS_LOJA]
        : [GRUPO_ADMIN]
      : GRUPOS_LOJA;

  // super admin sem loja própria não vende — não mostra o atalho do carrinho
  const temLoja = !ehFornecedor && (sessao.papel !== "super_admin" || Boolean(sessao.empresaNome));

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
      {avisosNaoLidos > 0 && (
        <button
          type="button"
          className="conta-badge"
          onClick={abrirAvisos}
          aria-label={`${avisosNaoLidos} aviso(s) não lido(s)`}
          aria-expanded={avisosAberto}
        >
          {avisosNaoLidos > 9 ? "9+" : avisosNaoLidos}
        </button>
      )}

      {avisosAberto && (
        <>
          <div className="fundo-conta" onClick={() => setAvisosAberto(false)} />
          <div className="avisos-menu" role="menu">
            <div className="avisos-menu-cabeca">
              <strong>Novidades</strong>
              {avisosNaoLidos > 0 && (
                <button type="button" onClick={marcarTodosAvisos}>
                  Marcar todas lidas
                </button>
              )}
            </div>
            {avisosLista.length === 0 ? (
              <p className="avisos-menu-vazio">Nenhum aviso.</p>
            ) : (
              <ul className="avisos-menu-lista">
                {avisosLista.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="avisos-menu-item"
                      data-lida={a.lida}
                      onClick={() => abrirAviso(a)}
                    >
                      <span className="avisos-menu-icone" aria-hidden="true">
                        {ICONE_AVISO[a.tipo] ?? "🔔"}
                      </span>
                      <span className="avisos-menu-texto">
                        <span className="avisos-menu-titulo">{a.titulo}</span>
                        <span className="avisos-menu-quando">{quando(a.criado_em)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/notificacoes" className="avisos-menu-rodape" onClick={() => setAvisosAberto(false)}>
              Ver todos os avisos
            </Link>
          </div>
        </>
      )}

      {contaAberta && (
        <>
          <div className="fundo-conta" onClick={() => setContaAberta(false)} />
          <div className="conta-menu" role="menu">
            <div className="conta-menu-cabeca">
              <strong>{sessao.nome}</strong>
              <span>
                {ehFornecedor
                  ? "Fornecedor"
                  : (sessao.empresaNome ?? "Administração") +
                    (sessao.papel === "super_admin" ? " · super admin" : "")}
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
              {ehFornecedor && (
                <>
                  <Link href="/fornecedor" role="menuitem" data-ativo={caminho === "/fornecedor"}>
                    Meu cadastro
                  </Link>
                  <Link href="/fornecedor/senha" role="menuitem" data-ativo={caminho === "/fornecedor/senha"}>
                    Trocar senha
                  </Link>
                </>
              )}
              {!ehFornecedor && (
                <>
                  <Link href="/perfil" role="menuitem" data-ativo={caminho === "/perfil"}>
                    Meu perfil
                  </Link>
                  <Link href="/senha" role="menuitem" data-ativo={caminho === "/senha"}>
                    Trocar senha
                  </Link>
                </>
              )}
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
        <Link href={ehFornecedor ? "/fornecedor" : "/"} className="menu-logo" aria-label="PDV Já — início">
          <Logo href={null} />
        </Link>
        <div className="menu-marca">
          {ehFornecedor ? sessao.nome : (sessao.empresaNome ?? "Administração")}
          <span>{ehFornecedor ? "fornecedor" : sessao.papel === "super_admin" ? "super admin" : "balcão"}</span>
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
                {g.id === "avisos" && avisosNaoLidos > 0 && (
                  <span className="menu-alerta">{avisosNaoLidos > 9 ? "9+" : avisosNaoLidos}</span>
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
