"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CampoFoto from "@/components/CampoFoto";
import FormularioFornecedor from "@/components/FormularioFornecedor";
import { mascararMoeda, moedaParaNumero, paraMoeda } from "@/lib/moeda";
import { CATEGORIAS_PADRAO } from "@/lib/contasPagar";

type FornecedorLite = { id: number; nome: string };

const CHAVE_FOTO = "mpmf.contaPagarFoto";
const CHAVE_FLASH = "mpmf.contaPagarFlash";

/* ---------- seletor de fornecedor ---------- */
function SeletorFornecedor({
  valor,
  aoEscolher,
}: {
  valor: FornecedorLite | null;
  aoEscolher: (f: FornecedorLite | null) => void;
}) {
  const [busca, setBusca] = useState("");
  const [opcoes, setOpcoes] = useState<FornecedorLite[]>([]);
  const [cadastrando, setCadastrando] = useState(false);

  useEffect(() => {
    if (valor || cadastrando) return;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/fornecedores?q=${encodeURIComponent(busca)}`);
        const d = await r.json();
        if (r.ok) setOpcoes((d.itens as FornecedorLite[]).slice(0, 6));
      } catch {
        /* silencioso */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [busca, valor, cadastrando]);

  if (valor) {
    return (
      <div className="rotulo largo">
        Fornecedor
        <div className="fornecedor-escolhido">
          <span>{valor.nome}</span>
          <button type="button" className="botao mini" onClick={() => aoEscolher(null)}>
            Trocar
          </button>
        </div>
      </div>
    );
  }

  if (cadastrando) {
    return (
      <div className="rotulo largo">
        Novo fornecedor
        <FormularioFornecedor
          inicial={{ nome: busca }}
          aoSalvar={(f) => {
            setCadastrando(false);
            aoEscolher(f);
          }}
          aoCancelar={() => setCadastrando(false)}
        />
      </div>
    );
  }

  return (
    <div className="rotulo largo">
      Fornecedor (opcional)
      <input
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar fornecedor pelo nome"
        autoComplete="off"
      />
      {(opcoes.length > 0 || busca.trim().length >= 2) && (
        <div className="fornecedor-opcoes">
          {opcoes.map((o) => (
            <button key={o.id} type="button" onClick={() => aoEscolher(o)}>
              {o.nome}
            </button>
          ))}
          {busca.trim().length >= 2 && (
            <button type="button" className="fornecedor-novo" onClick={() => setCadastrando(true)}>
              + Cadastrar “{busca.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function NovaContaPagar() {
  const router = useRouter();

  const [categoriasUsadas, setCategoriasUsadas] = useState<string[]>([]);
  const [foto, setFoto] = useState("");
  const [fornecedor, setFornecedor] = useState<FornecedorLite | null>(null);
  const [categoria, setCategoria] = useState("");
  const [categoriaLivre, setCategoriaLivre] = useState("");
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [recorrente, setRecorrente] = useState(false);
  const [jaPaga, setJaPaga] = useState(false);
  const [lendoFoto, setLendoFoto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  // fornecedor lido da foto e ainda não cadastrado
  const [nomeLido, setNomeLido] = useState("");
  const [docLido, setDocLido] = useState("");
  const [cadFornLido, setCadFornLido] = useState(false);
  const fotoJaLida = useRef(false);

  // categorias personalizadas já usadas, pra virarem botões extras
  useEffect(() => {
    fetch("/api/contas-pagar?situacao=todas")
      .then((r) => r.json())
      .then((d) => setCategoriasUsadas(d.categorias ?? []))
      .catch(() => {});
  }, []);

  async function lerBoleto(dataUrl: string) {
    setFoto(dataUrl);
    setLendoFoto(true);
    setErro(false);
    setAviso("Lendo o boleto…");
    try {
      const r = await fetch("/api/contas-pagar/ler-foto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foto: dataUrl }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não consegui ler.");

      const { dados, fornecedor: achado } = d;
      if (dados.valor > 0) setValor(paraMoeda(dados.valor));
      if (dados.vencimento) setVencimento(dados.vencimento);
      if (dados.documento) setDescricao(dados.documento);
      if (dados.categoria) setCategoria(dados.categoria);
      if (achado) {
        setFornecedor({ id: achado.id, nome: achado.nome });
        setAviso(`Fornecedor reconhecido: ${achado.nome}.`);
      } else if (dados.fornecedorNome) {
        setNomeLido(dados.fornecedorNome);
        setDocLido(dados.fornecedorDocumento || "");
        setAviso(`Li "${dados.fornecedorNome}" — cadastre o fornecedor abaixo se quiser.`);
      } else {
        setAviso("Boleto lido. Confira os campos.");
      }
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não consegui ler o boleto. Preencha na mão.");
    } finally {
      setLendoFoto(false);
    }
  }

  // foto tirada na tela anterior ("Nova conta por foto")
  useEffect(() => {
    if (fotoJaLida.current) return;
    fotoJaLida.current = true;
    try {
      const stash = sessionStorage.getItem(CHAVE_FOTO);
      if (stash) {
        sessionStorage.removeItem(CHAVE_FOTO);
        lerBoleto(stash);
      }
    } catch {
      /* sem sessionStorage */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const categoriaFinal =
    categoria === "outros" ? categoriaLivre.trim() || "outros" : categoria;
  const formularioValido = moedaParaNumero(valor) > 0 && Boolean(categoriaFinal);

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/contas-pagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fornecedorId: fornecedor?.id ?? null,
          categoria: categoriaFinal,
          descricao,
          valor: moedaParaNumero(valor),
          vencimento: vencimento || null,
          foto: foto || null,
          recorrente,
          pago: jaPaga,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        throw new Error([d?.erro, d?.detalhe].filter(Boolean).join(" — ") || "Não foi possível salvar.");
      }
      try {
        sessionStorage.setItem(CHAVE_FLASH, jaPaga ? "Conta incluída (já paga)." : "Conta a pagar incluída.");
      } catch {
        /* sem sessionStorage */
      }
      router.push("/contas-pagar");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
      setSalvando(false);
    }
  }

  return (
    <main className="tela">
      <header className="marca">Nova conta a pagar</header>

      <section className="cartao">
        <p className="ajuda-voz">
          Tire a foto do boleto ou da nota — o sistema tenta ler fornecedor, categoria,
          valor e vencimento. Depois é só conferir.
        </p>

        <div className="grade-form">
          <div className="rotulo largo">
            <CampoFoto
              rotulo="Foto do boleto / nota"
              preview={foto}
              aoEscolher={lerBoleto}
              aoRemover={foto ? () => setFoto("") : undefined}
              aoErro={(m) => {
                setErro(true);
                setAviso(m);
              }}
            />
          </div>

          <div className="rotulo largo">
            Categoria
            <div className="categorias-conta">
              {CATEGORIAS_PADRAO.filter((c) => c.valor !== "outros").map((c) => (
                <button
                  key={c.valor}
                  type="button"
                  className="botao pagamento"
                  data-escolhido={categoria === c.valor}
                  onClick={() => setCategoria(c.valor)}
                >
                  {c.rotulo}
                </button>
              ))}
              {categoriasUsadas.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="botao pagamento"
                  data-escolhido={categoria === c}
                  onClick={() => setCategoria(c)}
                >
                  {c}
                </button>
              ))}
              <button
                type="button"
                className="botao pagamento"
                data-escolhido={categoria === "outros"}
                onClick={() => setCategoria("outros")}
              >
                Outros
              </button>
            </div>
            {categoria === "outros" && (
              <input
                value={categoriaLivre}
                onChange={(e) => setCategoriaLivre(e.target.value)}
                placeholder="Digite a categoria (ex.: Gás, Frete, Contador)"
                maxLength={40}
                autoComplete="off"
                style={{ marginTop: 8 }}
              />
            )}
          </div>

          <SeletorFornecedor valor={fornecedor} aoEscolher={setFornecedor} />

          {!fornecedor && nomeLido && !cadFornLido && (
            <div className="rotulo largo">
              <button type="button" className="botao neutro" onClick={() => setCadFornLido(true)}>
                Cadastrar fornecedor “{nomeLido}”
              </button>
            </div>
          )}
          {!fornecedor && cadFornLido && (
            <div className="rotulo largo">
              Novo fornecedor
              <FormularioFornecedor
                inicial={{ nome: nomeLido, documento: docLido }}
                aoSalvar={(f) => {
                  setFornecedor(f);
                  setCadFornLido(false);
                  setNomeLido("");
                }}
                aoCancelar={() => setCadFornLido(false)}
              />
            </div>
          )}

          <label className="rotulo largo">
            Descrição
            <input
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Boleto nota 4471, aluguel, energia…"
              autoComplete="off"
            />
          </label>

          <label className="rotulo">
            Valor
            <input
              value={valor}
              onChange={(e) => setValor(mascararMoeda(e.target.value))}
              placeholder="0,00"
              inputMode="decimal"
              autoComplete="off"
            />
          </label>

          <label className="rotulo">
            Vencimento
            <input type="date" value={vencimento} onChange={(e) => setVencimento(e.target.value)} />
          </label>

          <label className="check-whatsapp" style={{ gridColumn: "1 / -1" }}>
            <input
              type="checkbox"
              checked={recorrente}
              onChange={(e) => setRecorrente(e.target.checked)}
            />
            Conta recorrente (todo mês) — ao quitar, o sistema já lança a do mês seguinte
          </label>

          <label className="check-whatsapp" style={{ gridColumn: "1 / -1" }}>
            <input type="checkbox" checked={jaPaga} onChange={(e) => setJaPaga(e.target.checked)} />
            Esta conta já está paga
          </label>
        </div>

        <div className="acoes">
          <button
            className="botao primario"
            onClick={salvar}
            disabled={salvando || lendoFoto || !formularioValido}
          >
            {salvando ? "Salvando…" : jaPaga ? "Incluir conta (já paga)" : "Incluir conta a pagar"}
          </button>
          <button
            type="button"
            className="botao neutro"
            onClick={() => router.push("/contas-pagar")}
            disabled={salvando}
          >
            Cancelar
          </button>
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>
    </main>
  );
}
