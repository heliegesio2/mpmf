"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

export type ProdutoCarrinho = {
  id: number;
  nome: string;
  categoria?: string | null;
  unidade?: string;
  tipo_venda: string;
  preco: string;
  score?: number;
  tem_foto?: boolean;
};

export type ItemCarrinho = {
  chave: string;
  produto: ProdutoCarrinho;
  quantidade: number;
};

const CHAVE_LS = "mpmf.carrinho";

type Contexto = {
  itens: ItemCarrinho[];
  setItens: Dispatch<SetStateAction<ItemCarrinho[]>>;
  limpar: () => void;
  /** true depois de ler o localStorage — antes disso `itens` ainda é []. */
  pronto: boolean;
};

const CarrinhoCtx = createContext<Contexto | null>(null);

/**
 * Carrinho da venda em andamento. Fica no localStorage pra sobreviver à
 * navegação (sair da tela de venda, olhar outra coisa e voltar sem perder os
 * itens). Some só quando a venda é finalizada ou cancelada.
 */
export function CarrinhoProvider({ children }: { children: ReactNode }) {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    try {
      const cru = localStorage.getItem(CHAVE_LS);
      if (cru) {
        const lido = JSON.parse(cru);
        if (Array.isArray(lido)) setItens(lido);
      }
    } catch {
      /* localStorage indisponível ou conteúdo inválido: começa vazio */
    }
    setPronto(true);
  }, []);

  useEffect(() => {
    // não grava antes de ter lido o que já estava salvo, senão o primeiro
    // efeito apagaria o carrinho persistido
    if (!pronto) return;
    try {
      if (itens.length === 0) localStorage.removeItem(CHAVE_LS);
      else localStorage.setItem(CHAVE_LS, JSON.stringify(itens));
    } catch {
      /* sem localStorage: o carrinho ainda funciona, só não persiste */
    }
  }, [itens, pronto]);

  const limpar = useCallback(() => setItens([]), []);

  return (
    <CarrinhoCtx.Provider value={{ itens, setItens, limpar, pronto }}>
      {children}
    </CarrinhoCtx.Provider>
  );
}

export function useCarrinho(): Contexto {
  const ctx = useContext(CarrinhoCtx);
  if (!ctx) throw new Error("useCarrinho precisa do <CarrinhoProvider>.");
  return ctx;
}

/** Limpa o carrinho guardado (usado no logout). */
export function esquecerCarrinho() {
  try {
    localStorage.removeItem(CHAVE_LS);
  } catch {
    /* nada a fazer */
  }
}
