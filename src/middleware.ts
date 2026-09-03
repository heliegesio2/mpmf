import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, lerToken } from "@/lib/auth";

/** Paginas que qualquer um alcanca sem estar logado. */
const LIVRES = ["/login", "/cadastro", "/landing.html"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // portfólio público do fornecedor: aberto pra todos (deslogado, loja, fornecedor)
  if (pathname === "/p" || pathname.startsWith("/p/")) {
    return NextResponse.next();
  }

  if (LIVRES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const sessao = await lerToken(request.cookies.get(COOKIE_SESSAO)?.value);

  if (!sessao) {
    // a raiz e a landing publica (site/); o resto vai pro login
    if (pathname === "/") {
      return NextResponse.rewrite(new URL("/landing.html", request.url));
    }
    const destino = new URL("/login", request.url);
    destino.searchParams.set("de", pathname);
    return NextResponse.redirect(destino);
  }

  // area de empresas: so o super admin
  if (pathname.startsWith("/admin") && sessao.papel !== "super_admin") {
    return NextResponse.redirect(new URL(sessao.papel === "fornecedor" ? "/fornecedor" : "/", request.url));
  }

  // area do fornecedor = exatamente /fornecedor e /fornecedor/... (não /fornecedores)
  const naAreaFornecedor = pathname === "/fornecedor" || pathname.startsWith("/fornecedor/");
  // telas compartilhadas (loja + fornecedor)
  const compartilhada = pathname === "/notificacoes";
  if (sessao.papel === "fornecedor") {
    if (!naAreaFornecedor && !compartilhada) {
      return NextResponse.redirect(new URL("/fornecedor", request.url));
    }
  } else if (naAreaFornecedor) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // fora do middleware: rotas de API (cada uma confere a sessao por conta
  // propria), arquivos estaticos e os icones/favicon (precisam abrir deslogado)
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|apple-icon|opengraph-image|manifest).*)",
  ],
};
