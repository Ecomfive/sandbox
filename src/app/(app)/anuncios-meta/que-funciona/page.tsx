import { cargarPaginaMeta, type ParametrosMeta } from "../datos-pagina";
import { MarcoMeta } from "../marco-meta";
import { QueFunciona } from "../vista-que-funciona";

export const metadata = { title: "Qué funciona · Anuncios Meta" };

export const dynamic = "force-dynamic";

/** Anuncios Meta › Qué funciona: lo que ya sabemos y, por videos (ángulo, gancho, formato, llamado, recursos, estructura, duración, oferta), campañas (ángulo, CBO o ABO, puja, producto, etapa) y anuncios (copy, landing), qué da mejores resultados, de mejor a peor CPA y con qué tan seguro es. */
export default async function QueFuncionaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, hayToken } = await cargarPaginaMeta(searchParams);
  return (
    <MarcoMeta titulo="Qué funciona" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais}>
      <QueFunciona grupos={datos.grupos} gruposVideo={datos.gruposVideo} videosSinAngulo={datos.videosSinAngulo} ganchosSinTipo={datos.ganchosSinTipo} iaConectada={datos.iaConectada} escribe={escribe} />
    </MarcoMeta>
  );
}
