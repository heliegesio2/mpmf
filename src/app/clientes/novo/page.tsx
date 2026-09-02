"use client";

import { useRouter } from "next/navigation";
import FormularioCliente from "@/components/FormularioCliente";

export default function NovoCliente() {
  const router = useRouter();

  return (
    <main className="tela">
      <header className="marca">Novo cliente</header>

      <section className="cartao">
        <FormularioCliente
          aoSalvar={() => {
            try {
              sessionStorage.setItem("mpmf.clienteFlash", "Cliente cadastrado.");
            } catch {
              /* sem sessionStorage */
            }
            router.push("/clientes");
          }}
          aoCancelar={() => router.push("/clientes")}
        />
      </section>
    </main>
  );
}
