"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CampoVoz } from "@/components/CampoVoz";
import { CATEGORIAS_PASSIVO } from "@/lib/passivo";
import { salvarLinhas, type LinhaPassivo } from "@/lib/passivoCliente";
import { paraMoeda } from "@/lib/moeda";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

const FLASH = "mpmf.passivoFlash";

type Props = {
  linhas: LinhaPassivo[];
  setLinhas: (f: (l: LinhaPassivo[]) => LinhaPassivo[]) => void;
  origem: "foto" | "video";
};

/**
 * Conferência do que a IA reconheceu: cada bem com checkbox, nome, categoria,
 * quantidade, valor estimado (opcional) e a foto. "Salvar" grava os marcados.
 */
export default function RevisaoPassivos({ linhas, setLinhas, origem }: Props) {
  const router = useRouter();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const [campo, idx] = String(campoAtual.current ?? "").split(":");
      const i = Number(idx);
      if (campo === "nome") mudar(i, { nome: capitalizar(texto) });
      else if (campo === "valor") mudar(i, { valor: paraMoeda(texto) });
      else if (campo === "descricao") mudar(i, { descricao: texto });
    },
    aoErrar: (m) => setErro(m),
  });

  function mudar(i: number, patch: Partial<LinhaPassivo>) {
    setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));
  }

  const voz = (campo: string, i: number) => ({
    campo: `${campo}:${i}`,
    ouvindo: ouvindoCampo === `${campo}:${i}`,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  async function salvar() {
    setSalvando(true);
    setErro("");
    try {
      const n = await salvarLinhas(linhas, origem);
      try {
        sessionStorage.setItem(FLASH, `${n} ${n === 1 ? "bem adicionado" : "bens adicionados"} ao levantamento.`);
      } catch {
        /* sem sessionStorage */
      }
      router.push("/passivos");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  const marcados = linhas.filter((l) => l.incluir).length;

  return (
    <section className="cartao">
      <h2 className="titulo-cartao">
        {linhas.length === 0 ? "Nenhum passivo reconhecido" : `Reconheci ${linhas.length} ${linhas.length === 1 ? "bem" : "bens"}`}
      </h2>
      {linhas.length === 0 ? (
        <p className="dica">Tente com fotos mais abertas, bem iluminadas, mostrando os móveis e equipamentos.</p>
      ) : (
        <p className="dica">Confira, corrija o que precisar e desmarque o que não for um passivo.</p>
      )}

      <ul className="lista">
        {linhas.map((l, i) => (
          <li key={i} className="passivo-linha" data-incluir={l.incluir}>
            <label className="check-whatsapp">
              <input type="checkbox" checked={l.incluir} onChange={(e) => mudar(i, { incluir: e.target.checked })} />
              Incluir
            </label>
            <div className="passivo-linha-corpo">
              {l.foto && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="passivo-miniatura" src={l.foto} alt={l.nome} />
              )}
              <div className="grade-form">
                <CampoVoz
                  rotulo="Nome do bem"
                  largo
                  valor={l.nome}
                  aoMudar={(v) => mudar(i, { nome: v })}
                  {...voz("nome", i)}
                />
                <label className="rotulo">
                  Categoria
                  <select value={l.categoria} onChange={(e) => mudar(i, { categoria: e.target.value })}>
                    {CATEGORIAS_PASSIVO.map((c) => (
                      <option key={c.valor} value={c.valor}>
                        {c.icone} {c.rotulo}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="rotulo">
                  Quantidade
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={l.quantidade}
                    onChange={(e) => mudar(i, { quantidade: e.target.value })}
                  />
                </label>
                <CampoVoz
                  rotulo="Valor estimado (opcional)"
                  placeholder="0,00"
                  moeda
                  valor={l.valor}
                  aoMudar={(v) => mudar(i, { valor: v })}
                  {...voz("valor", i)}
                />
                <CampoVoz
                  rotulo="Descrição (marca, modelo, estado)"
                  largo
                  valor={l.descricao}
                  aoMudar={(v) => mudar(i, { descricao: v })}
                  {...voz("descricao", i)}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>

      {erro && (
        <p className="dica" data-erro="true" role="status">
          {erro}
        </p>
      )}

      {linhas.length > 0 && (
        <div className="acoes">
          <button className="botao primario" onClick={salvar} disabled={salvando || marcados === 0}>
            {salvando ? "Salvando…" : `Salvar ${marcados} ${marcados === 1 ? "bem" : "bens"}`}
          </button>
        </div>
      )}
    </section>
  );
}
