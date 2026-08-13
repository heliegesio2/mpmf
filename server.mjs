/**
 * Servidor HTTPS para uso no balcao (npm run build && npm run start:https).
 * Em desenvolvimento use "npm run dev:https", que nao precisa deste arquivo.
 *
 * Os certificados sao gerados pelo mkcert em ./certificados.
 */
import { createServer } from "node:https";
import { readFileSync, existsSync } from "node:fs";
import { parse } from "node:url";
import next from "next";

const PORTA = Number(process.env.PORT ?? 3000);
const CERT = "./certificados/cert.pem";
const CHAVE = "./certificados/key.pem";

if (!existsSync(CERT) || !existsSync(CHAVE)) {
  console.error(
    "\nCertificado nao encontrado em ./certificados.\n" +
      "Rode o gerar-certificado.bat antes de subir em HTTPS.\n"
  );
  process.exit(1);
}

const app = next({ dev: false });
const handle = app.getRequestHandler();

await app.prepare();

createServer(
  { key: readFileSync(CHAVE), cert: readFileSync(CERT) },
  (req, res) => handle(req, res, parse(req.url ?? "/", true))
).listen(PORTA, "0.0.0.0", () => {
  console.log(`\n  Pronto em https://localhost:${PORTA}`);
  console.log(`  Na rede:  https://SEU-IP:${PORTA}\n`);
});
