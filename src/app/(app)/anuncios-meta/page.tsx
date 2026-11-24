import { cargarPaginaMeta, prepararAnalisisSiHaceFalta, type ParametrosMeta } from "./datos-pagina";
import { ContenidoResumen } from "./contenido-resumen";
import { MarcoMeta } from "./marco-meta";

export const metadata = { title: "Anuncios Meta" };

export const dynamic = "force-dynamic";
/** El análisis del historial, si falta, se prepara en segundo plano al abrir esta pantalla (con la IA puede tardar unos minutos). */
export const maxDuration = 300;

/**
 * Marketing › Anuncios Meta › Resumen (18 nov 2026, pedido de Alcides; boceto aprobado https://claude.ai/artifact/WebDAX2JDydNkzNhpSk4LC; rediseño visual del 20 nov 2026): lo que se gastó y se compró en las cuentas
 * publicitarias de Meta, día por día, cómo van las campañas, el embudo, en qué ángulos se gasta y lo que el sistema sugiere decidir hoy. Solo lee Meta: no crea, pausa ni cambia nada allá.
 */
export default async function AnunciosMetaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, hayToken, paisId } = await cargarPaginaMeta(searchParams);
  prepararAnalisisSiHaceFalta(datos, paisId, pais);
  return (
    <MarcoMeta titulo="Anuncios Meta" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais}>
      <ContenidoResumen datos={datos} escribe={escribe} />
    </MarcoMeta>
  );
}
