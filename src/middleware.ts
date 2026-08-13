import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESSAO, lerToken } from "@/lib/auth";

/** Paginas que qualquer um alcanca sem estar logado. */
const LIVRES = ["/login", "/cadastro"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (LIVRES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const sessao = await lerToken(request.cookies.get(COOKIE_SESSAO)?.value);

  if (!sessao) {
    const destino = new URL("/login", request.url);
    destino.searchParams.set("de", pathname);
    return NextResponse.redirect(destino);
  }

  // area de empresas: so o super admin
  if (pathname.startsWith("/admin") && sessao.papel !== "super_admin") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // fora do middleware: rotas de API (cada uma confere a sessao por conta
  // propria), arquivos estaticos e o favicon
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
