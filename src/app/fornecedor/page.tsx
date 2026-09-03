"use client";

import { useCallback, useEffect, useState } from "react";
import { CampoVoz } from "@/components/CampoVoz";
import CampoTelefone from "@/components/CampoTelefone";
import { useVoz } from "@/lib/useVoz";
import { capitalizar } from "@/lib/voz";

type Bairro = { id: number; nome: string };

type Form = {
  nome: string;
  documento: string;
  telefone: string;
  telefoneWhatsapp: boolean;
  endereco: string;
  observacao: string;
  pixChave: string;
  cidade: string;
};

const VAZIO: Form = {
  nome: "",
  documento: "",
  telefone: "",
  telefoneWhatsapp: false,
  endereco: "",
  observacao: "",
  pixChave: "",
  cidade: "",
};

const ROTULO_SITUACAO: Record<string, string> = {
  aprovado: "aprovado",
  pendente: "aguardando aprovação",
  reprovado: "não aprovado",
};

export default function AreaFornecedor() {
  const [form, setForm] = useState<Form>(VAZIO);
  const [situacao, setSituacao] = useState("");
  const [motivo, setMotivo] = useState<string | null>(null);
  const [bairros, setBairros] = useState<Bairro[]>([]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [filtroBairro, setFiltroBairro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const k = campoAtual.current as keyof Form | null;
      if (!k) return;
      const soDigitos = k === "documento" || k === "telefone";
      const cru = k === "pixChave";
      setForm((f) => ({
        ...f,
        [k]: soDigitos ? texto.replace(/\D/g, "") : cru ? texto : capitalizar(texto),
      }));
      setErro(false);
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  const comum = (k: keyof Form) => ({
    campo: k as string,
    valor: String(form[k]),
    aoMudar: (v: string) => setForm((f) => ({ ...f, [k]: v })),
    ouvindo: ouvindoCampo === k,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await fetch("/api/fornecedor");
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro);
      const it = d.item;
      setForm({
        nome: it.nome ?? "",
        documento: it.documento ?? "",
        telefone: it.telefone ?? "",
        telefoneWhatsapp: Boolean(it.telefone_whatsapp),
        endereco: it.endereco ?? "",
        observacao: it.observacao ?? "",
        pixChave: it.pix_chave ?? "",
        cidade: it.cidade ?? "",
      });
      setSituacao(it.situacao);
      setMotivo(it.motivo ?? null);
      setBairros(it.bairrosCidade ?? []);
      setSel(new Set((it.bairroIds ?? []).map(Number)));
    } catch {
      setErro(true);
      setAviso("Não foi possível carregar seu cadastro.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function alternar(id: number) {
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const semAcento = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const bairrosFiltrados = filtroBairro.trim()
    ? bairros.filter((b) => semAcento(b.nome).includes(semAcento(filtroBairro.trim())))
    : bairros;

  async function salvar() {
    setSalvando(true);
    setErro(false);
    try {
      const r = await fetch("/api/fornecedor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          cidade: form.cidade || "Conselheiro Lafaiete",
          bairroIds: [...sel],
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.erro ?? "Não foi possível salvar.");
      setAviso("Cadastro atualizado.");
      await carregar();
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <main className="tela">
        <p className="vazio">Carregando…</p>
      </main>
    );
  }

  return (
    <main className="tela">
      <header className="marca">
        Meu cadastro <span>•</span> fornecedor
      </header>

      <section className="cartao">
        <p className="dica">
          Situação:{" "}
          <span
            className="selo"
            data-situacao={situacao === "aprovado" ? "aprovada" : situacao === "reprovado" ? "reprovada" : "pendente"}
          >
            {ROTULO_SITUACAO[situacao] ?? situacao}
          </span>
        </p>
        {situacao === "reprovado" && motivo && (
          <p className="dica" data-erro="true">
            Motivo: {motivo}
          </p>
        )}
        {situacao === "pendente" && (
          <p className="dica">
            Enquanto não for aprovado, seu cadastro não aparece para as lojas. Você pode ajustar os
            dados abaixo — quando for aprovado, é isso que as lojas vão ver.
          </p>
        )}
      </section>

      <section className="cartao">
        <h2 className="titulo-cartao">Dados</h2>

        <p className="ajuda-voz" data-erro={!disponivel}>
          {disponivel
            ? "Toque no microfone do campo e fale."
            : "Este navegador não reconhece fala. Abra no Chrome ou no Edge para usar os microfones."}
        </p>

        <div className="grade-form">
          <CampoVoz rotulo="Nome / razão social" placeholder="Distribuidora do Zé" largo {...comum("nome")} />
          <CampoVoz rotulo="CNPJ ou CPF" placeholder="Só números" numerico {...comum("documento")} />
          <CampoTelefone
            rotulo="Telefone"
            {...comum("telefone")}
            ehWhatsapp={form.telefoneWhatsapp}
            aoMudarWhatsapp={(v) => setForm((f) => ({ ...f, telefoneWhatsapp: v }))}
          />
          <CampoVoz rotulo="Endereço" placeholder="Rua, número, bairro" largo {...comum("endereco")} />
          <label className="rotulo largo">
            Cidade que atende
            <input type="text" value={form.cidade || "Conselheiro Lafaiete"} disabled readOnly />
          </label>
          <CampoVoz rotulo="Chave Pix (opcional)" placeholder="CPF/CNPJ, celular, e-mail…" largo {...comum("pixChave")} />
          <CampoVoz rotulo="Observação (opcional)" placeholder="Dias de entrega, pedido mínimo…" largo {...comum("observacao")} />

          <div className="rotulo largo">
            <span className="campo-foto-rotulo">Bairros que você atende</span>
            {bairros.length === 0 ? (
              <p className="dica">Nenhum bairro cadastrado para {form.cidade || "sua cidade"}.</p>
            ) : (
              <>
                <input
                  type="text"
                  className="filtro-bairro"
                  value={filtroBairro}
                  onChange={(e) => setFiltroBairro(e.target.value)}
                  placeholder="Buscar bairro pelo nome"
                />
                <div className="bairros-grade">
                  {bairrosFiltrados.length === 0 ? (
                    <p className="dica">Nenhum bairro com “{filtroBairro}”.</p>
                  ) : (
                    bairrosFiltrados.map((b) => (
                      <label key={b.id} className="bairro-opcao" data-ativo={sel.has(b.id)}>
                        <input type="checkbox" checked={sel.has(b.id)} onChange={() => alternar(b.id)} />
                        {b.nome}
                      </label>
                    ))
                  )}
                </div>
              </>
            )}
            <p className="dica">{sel.size} bairro(s) selecionado(s)</p>
          </div>
        </div>

        <div className="acoes">
          <button className="botao primario" onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </button>
        </div>

        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      </section>
    </main>
  );
}
