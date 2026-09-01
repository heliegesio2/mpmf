import FormularioProduto from "@/components/FormularioProduto";

export default async function EditarProduto({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FormularioProduto id={Number(id)} />;
}
