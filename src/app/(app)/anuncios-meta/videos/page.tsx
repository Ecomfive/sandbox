import { confiable, cpa } from "@/lib/meta-ads/metricas";
import { cargarPaginaMeta, type ParametrosMeta } from "../datos-pagina";
import { ListaVideos } from "../lista-videos";
import { MarcoMeta } from "../marco-meta";

export const metadata = { title: "Videos · Anuncios Meta" };

export const dynamic = "force-dynamic";
// «Analizar los pendientes» corre aquí: baja y analiza varios videos (Gemini tarda de 20 a 90 segundos en cada uno).
export const maxDuration = 300;

/** Anuncios Meta › Videos: cada video una sola vez (aunque esté en varios anuncios), con el hook, cuántos pasan los 3 y los 15 segundos y lo que cuesta cada compra. Tocar uno muestra en qué campañas se usa. Los últimos 30 días. */
export default async function VideosMetaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, hayToken } = await cargarPaginaMeta(searchParams);
  const videos = [...datos.videos].sort((a, b) => Number(confiable(b.r)) - Number(confiable(a.r)) || (cpa(a.r) ?? 999) - (cpa(b.r) ?? 999) || b.r.gasto - a.r.gasto);
  return (
    <MarcoMeta titulo="Videos" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais}>
      {videos.length === 0 ? (
        <p className="m-0 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">Todavía no hay videos con gasto en los últimos 30 días.</p>
      ) : (
        <>
          <p className="-mb-2 text-xs text-muted-foreground">Últimos 30 días, de mejor a peor CPA. Un video repetido en varios anuncios cuenta una sola vez.</p>
          <ListaVideos videos={videos} escribe={escribe} iaConectada={datos.iaConectada} sinAnalizar={datos.videosSinAnalizar} />
        </>
      )}
    </MarcoMeta>
  );
}
