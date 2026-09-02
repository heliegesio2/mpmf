"use client";

import { useCallback, useEffect, useState } from "react";
import { CampoVoz, SelecaoVoz } from "@/components/CampoVoz";
import DadosContato from "@/components/DadosContato";
import FiltroVoz from "@/components/FiltroVoz";
import { useVoz } from "@/lib/useVoz";
import { capitalizar, opcaoFalada } from "@/lib/voz";

type Empresa = {
  id: number;
  nome: string;
  documento: string | null;
  telefone: string | null;
  telefone_whatsapp: boolean | null;
  cidade: string | null;
  endereco: string | null;
  pix_chave: string | null;
  situacao: "pendente" | "aprovada" | "reprovada";
  motivo: string | null;
  criada_em: string;
  total_usuarios: string;
};

type NovoUsuario = {
  nome: string;
  email: string;
  senha: string;
  papel: "admin" | "operador";
};

type NovaEmpresa = {
  nome: string;
  documento: string;
  telefone: string;
  cidade: string;
};

type UsuarioResumo = {
  id: number;
  nome: string;
  email: string;
  papel: "super_admin" | "admin" | "operador";
  ativo: boolean;
};

const FILTROS = [
  { valor: "pendente", rotulo: "Aguardando" },
  { valor: "aprovada", rotulo: "Aprovadas" },
  { valor: "reprovada", rotulo: "Reprovadas" },
  { valor: "todas", rotulo: "Todas" },
];

const PAPEIS = [
  { valor: "admin", rotulo: "Administrador" },
  { valor: "operador", rotulo: "Operador" },
] as const;

const EMPRESA_VAZIA: NovaEmpresa = { nome: "", documento: "", telefone: "", cidade: "" };
const USUARIO_VAZIO: NovoUsuario = { nome: "", email: "", senha: "", papel: "admin" };

const data = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

export default function Empresas() {
  const [itens, setItens] = useState<Empresa[]>([]);
  const [filtro, setFiltro] = useState("pendente");
  const [busca, setBusca] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState("");
  const [erro, setErro] = useState(false);
  const [reprovando, setReprovando] = useState<number | null>(null);
  const [motivo, setMotivo] = useState("");

  // ---------- nova empresa ----------
  const [criando, setCriando] = useState(false);
  const [novaEmpresa, setNovaEmpresa] = useState<NovaEmpresa>(EMPRESA_VAZIA);
  const [usuarios, setUsuarios] = useState<NovoUsuario[]>([{ ...USUARIO_VAZIO }]);
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false);

  // ---------- editar empresa ----------
  const [editandoEmpresaId, setEditandoEmpresaId] = useState<number | null>(null);
  const [dadosEdicao, setDadosEdicao] = useState<NovaEmpresa>(EMPRESA_VAZIA);
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);

  // ---------- usuarios da empresa ----------
  const [usuariosAbertos, setUsuariosAbertos] = useState<number | null>(null);
  const [usuariosPorEmpresa, setUsuariosPorEmpresa] = useState<Record<number, UsuarioResumo[]>>({});
  const [carregandoUsuarios, setCarregandoUsuarios] = useState<number | null>(null);
  const [copiadoId, setCopiadoId] = useState<number | null>(null);

  // ---------- trocar senha do usuario ----------
  const [alterandoSenhaId, setAlterandoSenhaId] = useState<number | null>(null);
  const [novaSenha, setNovaSenha] = useState("");
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);

  const aplicarFala = useCallback((campo: string, texto: string) => {
    setErro(false);

    if (campo.startsWith("usuario:")) {
      const [, idxTexto, sub] = campo.split(":");
      const idx = Number(idxTexto);

      if (sub === "papel") {
        const escolha = opcaoFalada(texto, PAPEIS);
        if (!escolha) {
          setErro(true);
          setAviso(`Não achei "${texto}" nas opções.`);
          return;
        }
        setUsuarios((us) =>
          us.map((u, i) => (i === idx ? { ...u, papel: escolha as "admin" | "operador" } : u))
        );
        setAviso("");
        return;
      }

      setUsuarios((us) =>
        us.map((u, i) =>
          i === idx ? { ...u, [sub]: sub === "nome" ? capitalizar(texto) : texto } : u
        )
      );
      setAviso("");
      return;
    }

    const valor = campo === "nome" || campo === "cidade" ? capitalizar(texto) : texto;
    if (editandoEmpresaId !== null) {
      setDadosEdicao((f) => ({ ...f, [campo]: valor }));
    } else {
      setNovaEmpresa((f) => ({ ...f, [campo]: valor }));
    }
    setAviso("");
  }, [editandoEmpresaId]);

  const { ouvir, parar, ouvindoCampo, campoAtual, disponivel } = useVoz({
    aoFinalizar: (texto) => {
      const campo = campoAtual.current;
      if (campo) aplicarFala(campo, texto);
    },
    aoErrar: (m) => {
      setErro(true);
      setAviso(m);
    },
  });

  const comumEmpresa = (k: keyof NovaEmpresa) => ({
    campo: k as string,
    valor: novaEmpresa[k],
    aoMudar: (v: string) => setNovaEmpresa((f) => ({ ...f, [k]: v })),
    ouvindo: ouvindoCampo === k,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  const comumEdicao = (k: keyof NovaEmpresa) => ({
    campo: k as string,
    valor: dadosEdicao[k],
    aoMudar: (v: string) => setDadosEdicao((f) => ({ ...f, [k]: v })),
    ouvindo: ouvindoCampo === k,
    temVoz: disponivel,
    aoOuvir: ouvir,
    aoParar: parar,
  });

  const comumUsuario = (idx: number, k: "nome" | "email" | "senha") => {
    const campo = `usuario:${idx}:${k}`;
    return {
      campo,
      valor: usuarios[idx][k],
      aoMudar: (v: string) =>
        setUsuarios((us) => us.map((u, i) => (i === idx ? { ...u, [k]: v } : u))),
      ouvindo: ouvindoCampo === campo,
      temVoz: disponivel,
      aoOuvir: ouvir,
      aoParar: parar,
    };
  };

  function abrirNovaEmpresa() {
    setCriando(true);
    setEditandoEmpresaId(null);
    setNovaEmpresa(EMPRESA_VAZIA);
    setUsuarios([{ ...USUARIO_VAZIO }]);
    setAviso("");
    setErro(false);
  }

  function cancelarNovaEmpresa() {
    setCriando(false);
    setAviso("");
    setErro(false);
  }

  function abrirEdicao(e: Empresa) {
    setEditandoEmpresaId(e.id);
    setCriando(false);
    setDadosEdicao({
      nome: e.nome,
      documento: e.documento ?? "",
      telefone: e.telefone ?? "",
      cidade: e.cidade ?? "",
    });
    setAviso("");
    setErro(false);
  }

  function cancelarEdicao() {
    setEditandoEmpresaId(null);
    setAviso("");
    setErro(false);
  }

  const edicaoValida =
    dadosEdicao.nome.trim().length >= 2 && dadosEdicao.documento.replace(/\D/g, "").length >= 11;

  async function salvarEdicao() {
    if (editandoEmpresaId === null) return;
    setSalvandoEdicao(true);
    setErro(false);
    try {
      const r = await fetch(`/api/empresas/${editandoEmpresaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dadosEdicao),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");

      setAviso("Empresa atualizada.");
      setEditandoEmpresaId(null);
      await carregar(filtro, busca);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  async function alternarUsuarios(id: number) {
    if (usuariosAbertos === id) {
      setUsuariosAbertos(null);
      return;
    }
    setUsuariosAbertos(id);
    if (usuariosPorEmpresa[id]) return;

    setCarregandoUsuarios(id);
    try {
      const r = await fetch(`/api/empresas/${id}/usuarios`);
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setUsuariosPorEmpresa((atual) => ({ ...atual, [id]: dados.itens }));
    } catch {
      setErro(true);
      setAviso("Não foi possível carregar os usuários.");
    } finally {
      setCarregandoUsuarios(null);
    }
  }

  async function copiarLogin(usuarioId: number, email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopiadoId(usuarioId);
      setTimeout(() => setCopiadoId((atual) => (atual === usuarioId ? null : atual)), 1500);
    } catch {
      setErro(true);
      setAviso("Não foi possível copiar. Selecione o login na mão.");
    }
  }

  function abrirAlterarSenha(usuarioId: number) {
    setAlterandoSenhaId(usuarioId);
    setNovaSenha("");
    setSenhaVisivel(false);
    setAviso("");
    setErro(false);
  }

  function cancelarAlterarSenha() {
    setAlterandoSenhaId(null);
    setNovaSenha("");
  }

  async function salvarSenha(usuarioId: number) {
    setSalvandoSenha(true);
    setErro(false);
    try {
      const r = await fetch(`/api/usuarios/${usuarioId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senha: novaSenha }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível salvar.");

      setAviso("Senha alterada.");
      setErro(false);
      setAlterandoSenhaId(null);
      setNovaSenha("");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvandoSenha(false);
    }
  }

  function adicionarUsuario() {
    setUsuarios((us) => [...us, { ...USUARIO_VAZIO }]);
  }

  function removerUsuario(idx: number) {
    setUsuarios((us) => us.filter((_, i) => i !== idx));
  }

  const formularioValido =
    novaEmpresa.nome.trim().length >= 2 &&
    novaEmpresa.documento.replace(/\D/g, "").length >= 11 &&
    usuarios.every((u) => u.nome.trim() && u.email.trim() && u.senha.trim().length >= 8);

  async function salvarEmpresa() {
    setSalvandoEmpresa(true);
    setErro(false);
    try {
      const r = await fetch("/api/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...novaEmpresa, usuarios }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro ?? "Não foi possível cadastrar.");

      setErro(false);
      setAviso(dados.aviso ?? "Empresa cadastrada.");
      setCriando(false);
      setFiltro("aprovada");
      await carregar("aprovada");
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível cadastrar.");
    } finally {
      setSalvandoEmpresa(false);
    }
  }

  // ---------- lista ----------
  const carregar = useCallback(async (situacao: string, q = "") => {
    setCarregando(true);
    try {
      const r = await fetch(
        `/api/empresas?situacao=${situacao}&q=${encodeURIComponent(q)}`
      );
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);
      setItens(dados.itens);
    } catch {
      setErro(true);
      setAviso("Não foi possível carregar as empresas.");
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => carregar(filtro, busca), 250);
    return () => clearTimeout(t);
  }, [filtro, busca, carregar]);

  async function decidir(
    id: number,
    situacao: "aprovada" | "reprovada",
    texto?: string
  ) {
    try {
      const r = await fetch(`/api/empresas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ situacao, motivo: texto }),
      });
      const dados = await r.json();
      if (!r.ok) throw new Error(dados?.erro);

      setErro(false);
      setAviso(situacao === "aprovada" ? "Empresa aprovada." : "Empresa reprovada.");
      setReprovando(null);
      setMotivo("");
      await carregar(filtro, busca);
    } catch (e) {
      setErro(true);
      setAviso(e instanceof Error ? e.message : "Não foi possível salvar.");
    }
  }

  return (
    <main className="tela">
      <div className="cabecalho-tela">
        <header className="marca">
          Empresas <span>•</span> {itens.length} na lista
        </header>
        {!criando && (
          <button className="botao mini" onClick={abrirNovaEmpresa}>
            + Nova empresa
          </button>
        )}
      </div>

      {criando && (
        <section className="cartao">
          <h2 className="titulo-cartao">Nova empresa</h2>

          <p className="ajuda-voz" data-erro={!disponivel}>
            {disponivel
              ? "Toque no microfone do campo e fale."
              : "Este navegador não reconhece fala. Abra no Chrome ou no Edge para usar os microfones."}
          </p>

          <div className="grade-form">
            <CampoVoz rotulo="Nome da empresa" placeholder="Mercadinho do Bairro" largo {...comumEmpresa("nome")} />
            <CampoVoz rotulo="CNPJ ou CPF" placeholder="Só números" numerico {...comumEmpresa("documento")} />
            <CampoVoz rotulo="Telefone" placeholder="11989902144" numerico {...comumEmpresa("telefone")} />
            <CampoVoz rotulo="Cidade" placeholder="São Paulo" {...comumEmpresa("cidade")} />
          </div>

          {usuarios.map((u, idx) => (
            <div className="usuario-bloco" key={idx}>
              <div className="cabecalho-usuario">
                <strong>Usuário {idx + 1}</strong>
                {usuarios.length > 1 && (
                  <button
                    type="button"
                    className="botao mini perigo"
                    onClick={() => removerUsuario(idx)}
                  >
                    Remover
                  </button>
                )}
              </div>
              <div className="grade-form">
                <CampoVoz rotulo="Nome" placeholder="Nome do usuário" largo {...comumUsuario(idx, "nome")} />
                <CampoVoz rotulo="E-mail" placeholder="voce@empresa.com" {...comumUsuario(idx, "email")} />
                <CampoVoz rotulo="Senha" placeholder="mínimo 8 caracteres" {...comumUsuario(idx, "senha")} />
                <SelecaoVoz
                  rotulo="Papel"
                  opcoes={PAPEIS}
                  campo={`usuario:${idx}:papel`}
                  valor={u.papel}
                  aoMudar={(v) =>
                    setUsuarios((us) =>
                      us.map((x, i) => (i === idx ? { ...x, papel: v as "admin" | "operador" } : x))
                    )
                  }
                  ouvindo={ouvindoCampo === `usuario:${idx}:papel`}
                  temVoz={disponivel}
                  aoOuvir={ouvir}
                  aoParar={parar}
                />
              </div>
            </div>
          ))}

          <div className="acoes">
            <button type="button" className="botao neutro" onClick={adicionarUsuario}>
              + Adicionar usuário
            </button>
          </div>

          <div className="acoes">
            <button
              className="botao primario"
              onClick={salvarEmpresa}
              disabled={salvandoEmpresa || !formularioValido}
            >
              {salvandoEmpresa ? "Salvando…" : "Cadastrar empresa"}
            </button>
            <button className="botao neutro" onClick={cancelarNovaEmpresa} disabled={salvandoEmpresa}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      {editandoEmpresaId !== null && (
        <section className="cartao">
          <h2 className="titulo-cartao">Editar empresa</h2>

          <p className="ajuda-voz" data-erro={!disponivel}>
            {disponivel
              ? "Toque no microfone do campo e fale."
              : "Este navegador não reconhece fala. Abra no Chrome ou no Edge para usar os microfones."}
          </p>

          <div className="grade-form">
            <CampoVoz rotulo="Nome da empresa" placeholder="Mercadinho do Bairro" largo {...comumEdicao("nome")} />
            <CampoVoz rotulo="CNPJ ou CPF" placeholder="Só números" numerico {...comumEdicao("documento")} />
            <CampoVoz rotulo="Telefone" placeholder="11989902144" numerico {...comumEdicao("telefone")} />
            <CampoVoz rotulo="Cidade" placeholder="São Paulo" {...comumEdicao("cidade")} />
          </div>

          <div className="acoes">
            <button
              className="botao primario"
              onClick={salvarEdicao}
              disabled={salvandoEdicao || !edicaoValida}
            >
              {salvandoEdicao ? "Salvando…" : "Salvar alterações"}
            </button>
            <button className="botao neutro" onClick={cancelarEdicao} disabled={salvandoEdicao}>
              Cancelar
            </button>
          </div>
        </section>
      )}

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

      <FiltroVoz valor={busca} aoMudar={setBusca} placeholder="Filtrar pelo nome da empresa" />

      {aviso && (
        <p className="dica" data-erro={erro} role="status" aria-live="polite">
          {aviso}
        </p>
      )}

      {carregando ? (
        <p className="vazio">Carregando…</p>
      ) : itens.length === 0 ? (
        <p className="vazio">Nenhuma empresa nesta situação.</p>
      ) : (
        <ul className="lista">
          {itens.map((e) => (
            <li key={e.id} className="empresa">
              <span className="rotulo-item">
                {e.nome}
                <span className="sub">
                  {[
                    `${e.total_usuarios} usuário(s)`,
                    `desde ${data.format(new Date(e.criada_em))}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                <DadosContato
                  documento={e.documento}
                  telefone={e.telefone}
                  whatsapp={Boolean(e.telefone_whatsapp)}
                  local={[e.endereco, e.cidade].filter(Boolean).join(", ") || null}
                  pixChave={e.pix_chave}
                />
                {e.situacao === "reprovada" && e.motivo && (
                  <span className="sub motivo">Motivo: {e.motivo}</span>
                )}
              </span>

              <span className="selo" data-situacao={e.situacao}>
                {e.situacao}
              </span>

              {reprovando === e.id ? (
                <span className="reprovacao">
                  <input
                    value={motivo}
                    onChange={(ev) => setMotivo(ev.target.value)}
                    placeholder="Motivo da reprovação"
                    autoFocus
                  />
                  <button
                    className="botao mini perigo"
                    onClick={() => decidir(e.id, "reprovada", motivo)}
                    disabled={!motivo.trim()}
                  >
                    Confirmar
                  </button>
                  <button
                    className="botao mini"
                    onClick={() => {
                      setReprovando(null);
                      setMotivo("");
                    }}
                  >
                    Cancelar
                  </button>
                </span>
              ) : (
                <span className="botoes-linha">
                  <button className="botao mini" onClick={() => abrirEdicao(e)}>
                    Editar
                  </button>
                  <button className="botao mini" onClick={() => alternarUsuarios(e.id)}>
                    {usuariosAbertos === e.id ? "Ocultar usuários" : `Usuários (${e.total_usuarios})`}
                  </button>
                  {e.situacao !== "aprovada" && (
                    <button className="botao mini" onClick={() => decidir(e.id, "aprovada")}>
                      Aprovar
                    </button>
                  )}
                  {e.situacao !== "reprovada" && (
                    <button
                      className="botao mini perigo"
                      onClick={() => setReprovando(e.id)}
                    >
                      Reprovar
                    </button>
                  )}
                </span>
              )}

              {usuariosAbertos === e.id && (
                <span className="usuarios-empresa">
                  {carregandoUsuarios === e.id ? (
                    <span className="vazio">Carregando usuários…</span>
                  ) : (usuariosPorEmpresa[e.id] ?? []).length === 0 ? (
                    <span className="vazio">Nenhum usuário nessa empresa.</span>
                  ) : (
                    <ul className="lista">
                      {usuariosPorEmpresa[e.id].map((u) => (
                        <li key={u.id}>
                          <span className="rotulo-item">
                            {u.nome}
                            <span className="sub">
                              {[u.email, u.papel, !u.ativo && "inativo"].filter(Boolean).join(" · ")}
                            </span>
                          </span>

                          {alterandoSenhaId === u.id ? (
                            <span className="reprovacao">
                              <span className="campo-senha">
                                <input
                                  type={senhaVisivel ? "text" : "password"}
                                  value={novaSenha}
                                  onChange={(ev) => setNovaSenha(ev.target.value)}
                                  placeholder="Nova senha (mín. 8 caracteres)"
                                  autoFocus
                                />
                                <button
                                  type="button"
                                  className="olho-senha"
                                  onClick={() => setSenhaVisivel((v) => !v)}
                                  aria-label={senhaVisivel ? "Esconder senha" : "Mostrar senha"}
                                >
                                  {senhaVisivel ? (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                      <path
                                        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinejoin="round"
                                      />
                                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                                    </svg>
                                  ) : (
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                      <path
                                        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinejoin="round"
                                      />
                                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                                      <line
                                        x1="3"
                                        y1="3"
                                        x2="21"
                                        y2="21"
                                        stroke="currentColor"
                                        strokeWidth="1.8"
                                        strokeLinecap="round"
                                      />
                                    </svg>
                                  )}
                                </button>
                              </span>
                              <button
                                className="botao mini"
                                onClick={() => salvarSenha(u.id)}
                                disabled={salvandoSenha || novaSenha.length < 8}
                              >
                                {salvandoSenha ? "Salvando…" : "Confirmar"}
                              </button>
                              <button
                                className="botao mini"
                                onClick={cancelarAlterarSenha}
                                disabled={salvandoSenha}
                              >
                                Cancelar
                              </button>
                            </span>
                          ) : (
                            <span className="botoes-linha">
                              <button className="botao mini" onClick={() => copiarLogin(u.id, u.email)}>
                                {copiadoId === u.id ? "Copiado!" : "Copiar login"}
                              </button>
                              <button className="botao mini" onClick={() => abrirAlterarSenha(u.id)}>
                                Alterar senha
                              </button>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
