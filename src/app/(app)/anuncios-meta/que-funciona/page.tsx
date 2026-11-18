import { cargarPaginaMeta, type ParametrosMeta } from "../datos-pagina";
import { MarcoMeta } from "../marco-meta";
import { QueFunciona } from "../vista-que-funciona";

export const metadata = { title: "Qué funciona · Anuncios Meta" };

export const dynamic = "force-dynamic";

/** Anuncios Meta › Qué funciona: qué ángulo, estructura (CBO o ABO), puja, copy, landing, producto y etapa dan mejores resultados, de mejor a peor CPA. */
export default async function QueFuncionaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, hayToken } = await cargarPaginaMeta(searchParams);
  return (
    <MarcoMeta titulo="Qué funciona" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais}>
      <QueFunciona grupos={datos.grupos} />
    </MarcoMeta>
  );
}
