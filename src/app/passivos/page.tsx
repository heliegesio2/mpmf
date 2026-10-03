"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import CampoFoto from "@/components/CampoFoto";
import { CampoVoz } from "@/components/CampoVoz";
import FotoAmpliavel from "@/components/FotoAmpliavel";
import { moedaParaNumero, paraMoeda } from "@/lib/moeda";
import { CATEGORIAS_PASSIVO, infoCategoria } from "@/lib/passivo";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

type Passivo = {
  id: number;
  nome: string;
  categoria: string;
  quantidade: number;
  descricao: string | null;
  valor_estimado: number | null;
  origem: string;
  tem_foto: boolean;
};

type Form = { nome: string; categoria: string; quantidade: string; descricao: string; valor: string };
const VAZIO: Form = { nome: "", categoria: "outros", quantidade: "1", descricao: "", valor: "" };

const FLASH = "mpmf.passivoFlash";
const reais = (v: number) =>
  "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Passivos() {
  const [itens, setItens] = useState<Passivo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [catSel, setCatSel] = useState("");

  const [editando, setEditando] = useState<number | "novo" | null>(null);
  const [form, setForm] = useState<Form>(VAZIO);
  const [foto, setFoto] = useState(""); // data URL nova ("" = nada novo)
  const [fotoRemovida, setFotoRemovida] = useState(false);
  const [fotoAtual, setFotoAtual] = useState(""); // URL da foto já salva
  const [salvando, setSalvando] = useState(false);

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const k = campoAtual.current as keyof Form | null;
      if (!k) return;
      setForm((f) => ({
        ...f,
        [k]: k === "valor" ? paraMoeda(texto) : k === "descricao" ? texto : capitalizar(texto),
      }));
      setErro(false);
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });
  const voz = (campo: keyof Form) => ({
    campo: campo as string,
    ouvindo: ouvindoCampo === campo,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/passivos");
      const d = await r.json();
      if (!r.ok) throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — "));
      setItens(d.itens ?? []);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível carregar.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
    try {
      const f = sessionStorage.getItem(FLASH);
      if (f) {
        sessionStorage.removeItem(FLASH);
        setAviso(f);
      }
    } catch {
      /* sem sessionStorage */
    }
  }, [carregar]);

  function abrirNovo() {
    setEditando("novo");
    setForm(VAZIO);
    setFoto("");
    setFotoRemovida(false);
    setFotoAtual("");
    setAviso("");
    setErro(false);
  }

  function abrirEdicao(p: Passivo) {
    setEditando(p.id);
    setForm({
      nome: p.nome,
      categoria: p.categoria,
      quantidade: String(p.quantidade),
      descricao: p.descricao ?? "",
      valor: p.valor_estimado != null ? paraMoeda(p.valor_estimado) : "",
    });
    setFoto("");
    setFotoRemovida(false);
    setFotoAtual(p.tem_foto ? `/api/passivos/${p.id}/foto` : "");
    setAviso("");
    setErro(false);
  }

  async function salvar() {
    if (form.nome.trim().length < 2) {
      setErro(true);
      setAviso("Informe o nome do bem.");
      return;
    }
    setSalvando(true);
    setErro(false);
    try {
      const corpo = {
        nome: form.nome,
        categoria: form.categoria,
        quantidade: Number(form.quantidade) || 1,
        descricao: form.descricao,
        valorEstimado: form.valor.trim() ? moedaParaNumero(form.valor) : null,
        // criar: manda a foto se houver; editar: ausente mantém, "" remove, data URL troca
        foto: foto || (fotoRemovida ? "" : undefined),
      };
      const r = await fetch(editando === "novo" ? "/api/passivos" : `/api/passivos/${editando}`, {
        method: editando === "novo" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const d = await r.json();
      if (!r.ok) throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — ") || "Não foi possível salvar.");
      setEditando(null);
      setAviso(editando === "novo" ? "Bem adicionado." : "Bem atualizado.");
      await carregar();
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(p: Passivo) {
    if (!confirm(`Excluir "${p.nome}" do levantamento? Essa ação não tem volta.`)) return;
    try {
      const r = await fetch(`/api/passivos/${p.id}`, { method: "DELETE" });
      if (!r.ok) throw new Error();
      setAviso("Bem excluído.");
      setErro(false);
      await carregar();
    } catch {
      setErro(true);
      setAviso("Não foi possível excluir.");
    }
  }

  const totalBens = itens.reduce((s, p) => s + p.quantidade, 0);
  const totalValor = itens.reduce((s, p) => s + (p.valor_estimado ?? 0) * p.quantidade, 0);
  const semValor = itens.filter((p) => p.valor_estimado == null).length;
  const porCategoria = CATEGORIAS_PASSIVO.map((c) => ({
    ...c,
    qtd: itens.filter((p) => p.categoria === c.valor).reduce((s, p) => s + p.quantidade, 0),
  })).filter((c) => c.qtd > 0);
  const visiveis = catSel ? itens.filter((p) => p.categoria === catSel) : itens;

  return (
    <main className="tela">
      <header className="marca">
        Passivo <span>•</span> {totalBens} {totalBens === 1 ? "bem" : "bens"}
      </header>

      <p className="dica">
        O levantamento dos bens da empresa que não são mercadoria: banca, cofre, congelador, balcão,
        equipamentos…
      </p>

      <div className="acoes">
        <button className="botao primario" onClick={abrirNovo}>
          + Adicionar bem
        </button>
        <Link href="/passivos/foto" className="botao neutro">
          📷 Por foto
        </Link>
        <Link href="/passivos/video" className="botao neutro">
          🎥 Por vídeo
        </Link>
      </div>

      {itens.length > 0 && (
        <section className="cartao">
          <div className="resumo-vendas">
            <span>Valor estimado total{semValor > 0 ? ` (${semValor} sem valor informado)` : ""}</span>
            <strong>{reais(totalValor)}</strong>
          </div>
          <div className="categorias-conta">
            <button
              type="button"
              className="botao pagamento"
              data-escolhido={catSel === ""}
              onClick={() => setCatSel("")}
            >
              todos ({totalBens})
            </button>
            {porCategoria.map((c) => (
              <button
                key={c.valor}
                type="button"
                className="botao pagamento"
                data-escolhido={catSel === c.valor}
                onClick={() => setCatSel(c.valor)}
              >
                {c.icone} {c.rotulo} ({c.qtd})
              </button>
            ))}
          </div>
        </section>
      )}

      {editando !== null && (
        <section className="cartao">
          <h2 className="titulo-cartao">{editando === "novo" ? "Novo bem" : "Editar bem"}</h2>
          <div className="grade-form">
            <CampoVoz
              rotulo="Nome do bem"
              placeholder="Ex.: Congelador horizontal 2 tampas"
              largo
              valor={form.nome}
              aoMudar={(v) => setForm((f) => ({ ...f, nome: v }))}
              {...voz("nome")}
            />
            <label className="rotulo largo">
              Categoria
              <select value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
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
                value={form.quantidade}
                onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))}
              />
            </label>
            <CampoVoz
              rotulo="Valor estimado de cada um (opcional)"
              placeholder="0,00"
              moeda
              valor={form.valor}
              aoMudar={(v) => setForm((f) => ({ ...f, valor: v }))}
              {...voz("valor")}
            />
            <CampoVoz
              rotulo="Descrição (marca, modelo, estado)"
              largo
              valor={form.descricao}
              aoMudar={(v) => setForm((f) => ({ ...f, descricao: v }))}
              {...voz("descricao")}
            />
            <div className="rotulo largo">
              <CampoFoto
                rotulo="Foto (opcional)"
                preview={foto || (fotoRemovida ? "" : fotoAtual)}
                aoEscolher={(d) => {
                  setFoto(d);
                  setFotoRemovida(false);
                }}
                aoRemover={
                  foto || (!fotoRemovida && fotoAtual)
                    ? () => {
                        setFoto("");
                        setFotoRemovida(true);
                      }
                    : undefined
                }
                aoErro={(m) => {
                  setErro(true);
                  setAviso(m);
                }}
              />
            </div>
          </div>
          <div className="acoes">
            <button className="botao primario" onClick={salvar} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button className="botao neutro" onClick={() => setEditando(null)} disabled={salvando}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      {aviso && (
        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      )}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">
          Nenhum bem no levantamento ainda. Toque em “📷 Por foto” ou “🎥 Por vídeo” pra mapear de uma vez, ou
          em “+ Adicionar bem”.
        </p>
      ) : (
        <ul className="lista">
          {visiveis.map((p) => {
            const cat = infoCategoria(p.categoria);
            return (
              <li key={p.id} className="passivo-item">
                {p.tem_foto ? (
                  <FotoAmpliavel className="passivo-miniatura" src={`/api/passivos/${p.id}/foto`} alt={p.nome} />
                ) : (
                  <span className="passivo-icone" aria-hidden="true">
                    {cat.icone}
                  </span>
                )}
                <span className="rotulo-item">
                  {p.nome}
                  <span className="sub">
                    {cat.icone} {cat.rotulo} · {p.quantidade} {p.quantidade === 1 ? "unidade" : "unidades"}
                    {p.valor_estimado != null ? ` · ${reais(p.valor_estimado)} cada` : ""}
                    {p.origem !== "manual" ? ` · via ${p.origem}` : ""}
                  </span>
                  {p.descricao && <span className="sub">{p.descricao}</span>}
                </span>
                <span className="botoes-linha">
                  <button className="botao mini" onClick={() => abrirEdicao(p)}>
                    Editar
                  </button>
                  <button className="botao mini perigo" onClick={() => excluir(p)}>
                    Excluir
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
