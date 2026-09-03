import FormularioFornecedorProduto from "@/components/FormularioFornecedorProduto";

export default async function EditarProdutoFornecedor({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FormularioFornecedorProduto produtoId={Number(id)} />;
}
