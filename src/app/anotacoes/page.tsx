"use client";

import { useCallback, useEffect, useState } from "react";
import CampoFoto from "@/components/CampoFoto";
import CampoTextoRico from "@/components/CampoTextoRico";
import FotoAmpliavel from "@/components/FotoAmpliavel";
import { comprimirParaDataURL } from "@/lib/imagemCliente";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

type Anotacao = {
  id: number;
  texto: string;
  data_alerta: string | null;
  concluida: boolean;
  criado_em: string;
  tem_foto: boolean;
  de_admin: boolean;
};

type EmpresaResumo = { id: number; nome: string };

const FILTROS = [
  { valor: "abertas", rotulo: "Abertas" },
  { valor: "concluidas", rotulo: "Concluídas" },
  { valor: "todas", rotulo: "Todas" },
];

function hojeISO(): string {
  return new Date().toLocaleDateString("en-CA");
}
/** classificação do alerta: 'atrasado' | 'hoje' | 'futuro' | null */
function sinalAlerta(iso: string | null): "atrasado" | "hoje" | "futuro" | null {
  if (!iso) return null;
  const hoje = hojeISO();
  if (iso < hoje) return "atrasado";
  if (iso === hoje) return "hoje";
  return "futuro";
}
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function Anotacoes() {
  const [itens, setItens] = useState<Anotacao[]>([]);
  const [filtro, setFiltro] = useState("abertas");
  const [carregando, setCarregando] = useState(true);
  const [texto, setTexto] = useState("");
  const [dataAlerta, setDataAlerta] = useState("");
  const [foto, setFoto] = useState("");
  const [fotoDoCard, setFotoDoCard] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  // super admin: além da anotação própria, pode disparar um aviso pras lojas
  const [souSuperAdmin, setSouSuperAdmin] = useState(false);
  const [modoAviso, setModoAviso] = useState(false);
  const [paraTodos, setParaTodos] = useState(true);
  const [buscaLoja, setBuscaLoja] = useState("");
  const [opcoesLoja, setOpcoesLoja] = useState<EmpresaResumo[]>([]);
  const [lojaEscolhida, setLojaEscolhida] = useState<EmpresaResumo | null>(null);

  useEffect(() => {
    fetch("/api/auth/sessao")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSouSuperAdmin(d?.sessao?.papel === "super_admin"))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!modoAviso || paraTodos || lojaEscolhida) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/empresas?situacao=aprovada&q=${encodeURIComponent(buscaLoja)}`);
        const d = await r.json();
        setOpcoesLoja(r.ok ? (d.itens ?? []).slice(0, 8) : []);
      } catch {
        setOpcoesLoja([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [buscaLoja, paraTodos, lojaEscolhida, modoAviso]);

  const { ouvir, parar, ouvindoCampo, disponivel } = useVoz({
    aoFinalizar: (fala) => {
      const trecho = escapeHtml(capitalizar(fala));
      setTexto((t) => (t ? `${t} ${trecho}` : trecho));
      setErro(false);
      setAviso("");
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  const carregar = useCallback(async (situacao: string) => {
    setCarregando(true);
    try {
      const r = await fetch(`/api/anotacoes?situacao=${situacao}`);
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setItens(dados.itens);
    } catch {
      setErro(true);
      setAviso("Não foi possível carregar as anotações.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar(filtro);
  }, [filtro, carregar]);

  function textoVazio(html: string): boolean {
    return html.replace(/<[^>]*>/g, "").trim().length < 2 && !html.includes("<img");
  }

  async function salvar() {
    if (textoVazio(texto)) return;
    if (modoAviso && !paraTodos && !lojaEscolhida) {
      setErro(true);
      setAviso('Escolha a loja, ou marque "enviar para todos os clientes".');
      return;
    }
    setSalvando(true);
    setErro(false);
    try {
      if (modoAviso) {
        const r = await fetch("/api/admin/avisos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            texto,
            foto: foto || undefined,
            empresaId: paraTodos ? null : lojaEscolhida!.id,
            imediato: !dataAlerta,
            dataEnvio: dataAlerta || undefined,
          }),
        });
        const dados = await r.json();
        if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível enviar.");
        setAviso(
          `Aviso enviado para ${dados.totalLojas} loja(s)${dataAlerta ? ` — vai aparecer em ${dataAlerta.split("-").reverse().join("/")}` : " agora"}.`
        );
        setLojaEscolhida(null);
        setBuscaLoja("");
      } else {
        const r = await fetch("/api/anotacoes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            texto,
            dataAlerta: dataAlerta || undefined,
            foto: foto || undefined,
          }),
        });
        const dados = await r.json();
        if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");
        setAviso("Anotação salva.");
        setFiltro("abertas");
        await carregar("abertas");
      }
      setTexto("");
      setDataAlerta("");
      setFoto("");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarConcluida(a: Anotacao) {
    try {
      const r = await fetch(`/api/anotacoes/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ concluida: !a.concluida }),
      });
      if (!r.ok) throw new Error();
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível salvar.");
    }
  }

  async function mudarAlerta(a: Anotacao, iso: string) {
    try {
      const r = await fetch(`/api/anotacoes/${a.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataAlerta: iso || null }),
      });
      if (!r.ok) throw new Error();
      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não foi possível salvar.");
    }
  }

  async function fotoDireta(a: Anotacao, arquivo: File | undefined) {
    if (!arquivo) return;
    setFotoDoCard(a.id);
    setErro(false);
    try {
      const dataUrl = await comprimirParaDataURL(arquivo);
      const r = await fetch(`/api/anotacoes/${a.id}/foto`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto: dataUrl }),
      });
      if (!r.ok) throw new Error();

      // lê a foto e junta o que encontrar ao texto da anotação
      try {
        const d = await fetch("/api/anotacoes/interpretar-foto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ foto: dataUrl }),
        }).then((x) => x.json());
        const lido = String(d?.nome ?? "").trim();
        if (lido) {
          await fetch(`/api/anotacoes/${a.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              texto: a.texto ? `${a.texto}<br>${escapeHtml(lido)}` : escapeHtml(lido),
            }),
          });
        }
      } catch {
        /* leitura é um plus */
      }

      await carregar(filtro);
    } catch {
      setErro(true);
      setAviso("Não consegui usar essa foto.");
    } finally {
      setFotoDoCard(null);
    }
  }

  async function excluir(a: Anotacao) {
    if (!confirm("Excluir esta anotação? Essa ação não tem volta.")) return;
    try {
      const r = await fetch(`/api/anotacoes/${a.id}`, { method: "DELETE" });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível excluir.");
      await carregar(filtro);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível excluir.");
    }
  }

  return (
    <main className="tela">
      <header className="marca">
        Anotações <span>•</span> {itens.length} na lista
      </header>

      <section className="cartao">
        <h2 className="titulo-cartao">{modoAviso ? "Novo aviso" : "Nova anotação"}</h2>

        {souSuperAdmin && (
          <label className="rotulo largo" style={{ marginBottom: 10 }}>
            <input
              type="checkbox"
              checked={modoAviso}
              onChange={(e) => setModoAviso(e.target.checked)}
            />{" "}
            📢 Enviar como aviso para lojas (em vez de anotação minha)
          </label>
        )}

        <div className="campo-anotacao">
          <CampoTextoRico
            valor={texto}
            aoMudar={setTexto}
            placeholder="Ex.: pedir mais gelo pro fornecedor; pagar o aluguel dia 5…"
            aoErro={(m) => {
              setErro(true);
              setAviso(m);
            }}
          />
          <button
            type="button"
            className="microfone"
            data-ouvindo={ouvindoCampo === "texto"}
            disabled={!disponivel}
            onClick={() => (ouvindoCampo === "texto" ? parar() : ouvir("texto"))}
            aria-label="Falar a anotação"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="grade-form">
          <label className="rotulo">
            {modoAviso ? "Quando avisar (vazio = imediato)" : "Me alertar em (opcional)"}
            <span className="entrada">
              <input
                type="date"
                value={dataAlerta}
                min={hojeISO()}
                onChange={(e) => setDataAlerta(e.target.value)}
              />
            </span>
          </label>
          <div className="rotulo">
            <CampoFoto
              rotulo="Foto (opcional)"
              camera
              preview={foto}
              aoEscolher={setFoto}
              aoRemover={foto ? () => setFoto("") : undefined}
              urlIdentificar="/api/anotacoes/interpretar-foto"
              aoIdentificarNome={(t) => {
                const trecho = escapeHtml(t);
                setTexto((x) => (x ? `${x}<br>${trecho}` : trecho));
              }}
              aoErro={(m) => {
                setErro(true);
                setAviso(m);
              }}
            />
            <p className="campo-foto-dica">A foto é lida: texto vira anotação, lista vira lista.</p>
          </div>
        </div>

        {modoAviso && (
          <div className="rotulo largo" style={{ marginTop: 10 }}>
            <label className="rotulo largo">
              <input
                type="checkbox"
                checked={paraTodos}
                onChange={(e) => {
                  setParaTodos(e.target.checked);
                  if (e.target.checked) setLojaEscolhida(null);
                }}
              />{" "}
              Enviar para todos os clientes
            </label>

            {!paraTodos &&
              (lojaEscolhida ? (
                <p className="dica">
                  Loja escolhida: <strong>{lojaEscolhida.nome}</strong>{" "}
                  <button
                    type="button"
                    className="botao mini neutro"
                    onClick={() => setLojaEscolhida(null)}
                  >
                    Trocar
                  </button>
                </p>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <label className="rotulo largo">
                    Buscar a loja
                    <span className="entrada">
                      <input
                        value={buscaLoja}
                        onChange={(e) => setBuscaLoja(e.target.value)}
                        placeholder="Nome da loja…"
                      />
                    </span>
                  </label>
                  {opcoesLoja.length > 0 && (
                    <ul className="lista" style={{ marginTop: 8 }}>
                      {opcoesLoja.map((e) => (
                        <li
                          key={e.id}
                          className="lista-clicavel"
                          role="button"
                          tabIndex={0}
                          onClick={() => setLojaEscolhida(e)}
                          onKeyDown={(ev) => ev.key === "Enter" && setLojaEscolhida(e)}
                        >
                          <span className="rotulo-item">{e.nome}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
          </div>
        )}

        <div className="acoes">
          <button
            className="botao primario"
            onClick={salvar}
            disabled={salvando || textoVazio(texto)}
          >
            {salvando ? "Salvando…" : modoAviso ? "Enviar aviso" : "Salvar anotação"}
          </button>
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>

      <div className="abas">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            className="botao aba"
            data-ativo={filtro === f.valor}
            onClick={() => setFiltro(f.valor)}
          >
            {f.rotulo}
          </button>
        ))}
      </div>

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">Nenhuma anotação aqui.</p>
      ) : (
        <ul className="lista">
          {itens.map((a) => {
            const sinal = a.concluida ? null : sinalAlerta(a.data_alerta);
            return (
              <li key={a.id} className="anotacao" data-concluida={a.concluida} data-sinal={sinal ?? ""}>
                <label className="anotacao-check">
                  <input
                    type="checkbox"
                    checked={a.concluida}
                    onChange={() => alternarConcluida(a)}
                    aria-label="Concluir"
                  />
                </label>

                <span className="anotacao-foto">
                  {a.tem_foto ? (
                    <FotoAmpliavel src={`/api/anotacoes/${a.id}/foto`} alt="" />
                  ) : (
                    <label className="anotacao-foto-add" title="Tirar ou enviar uma foto">
                      {fotoDoCard === a.id ? "⏳" : "📷"}
                      <input
                        type="file"
                        accept="image/*"
                        hidden
                        disabled={fotoDoCard === a.id}
                        onChange={(e) => fotoDireta(a, e.target.files?.[0])}
                      />
                    </label>
                  )}
                </span>

                <span className="rotulo-item">
                  <span className="anotacao-texto html-aviso">
                    {a.de_admin && (
                      <span className="selo" data-situacao="pendente">
                        aviso da administração
                      </span>
                    )}{" "}
                    <span dangerouslySetInnerHTML={{ __html: a.texto }} />
                  </span>
                  <span className="sub anotacao-rodape">
                    {(sinal === "atrasado" || sinal === "hoje") && (
                      <span className="anotacao-alerta" data-sinal={sinal}>
                        {sinal === "atrasado" ? "⏰ atrasado" : "⏰ hoje"}
                      </span>
                    )}
                    {a.de_admin ? (
                      <span>alerta: {a.data_alerta ?? "—"}</span>
                    ) : (
                      <label>
                        alerta:{" "}
                        <input
                          type="date"
                          className="anotacao-data"
                          value={a.data_alerta ?? ""}
                          onChange={(e) => mudarAlerta(a, e.target.value)}
                          aria-label="Data do alerta"
                        />
                      </label>
                    )}
                  </span>
                </span>

                {!a.de_admin && (
                  <button className="botao mini perigo" onClick={() => excluir(a)}>
                    Excluir
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
