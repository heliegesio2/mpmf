import type { Metadata } from "next";
import MenuLateral from "@/components/MenuLateral";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mercadinho — consulta e cadastro",
  description: "Consulta de preço por voz e edição de produtos.",
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
      </head>
      <body>
        <MenuLateral />
        <div className="conteudo">{children}</div>
      </body>
    </html>
  );
}
