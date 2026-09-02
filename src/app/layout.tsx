import type { Metadata } from "next";
import MenuLateral from "@/components/MenuLateral";
import { CarrinhoProvider } from "@/lib/carrinho";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDV Já — o balcão que entende sua voz",
  description:
    "Ponto de venda para mercadinhos: consulta de preço e venda por voz, contas a pagar e receber, estoque e relatórios.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;900&family=IBM+Plex+Mono:wght@500;700&display=swap"
          rel="stylesheet"
        />
        {/* aplica a letra grande antes da pagina pintar, pra nao "piscar" no tamanho normal primeiro */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('fonteGrande')==='1')document.documentElement.setAttribute('data-fonte','grande')}catch(e){}",
          }}
        />
      </head>
      <body>
        <CarrinhoProvider>
          <MenuLateral />
          <div className="conteudo">{children}</div>
        </CarrinhoProvider>
      </body>
    </html>
  );
}
