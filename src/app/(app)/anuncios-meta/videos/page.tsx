import { estadoAnalisisAutomatico } from "@/lib/meta-ads/ajustes";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPaginaMeta, type ParametrosMeta } from "../datos-pagina";
import { HallazgosDeSeccion } from "../hallazgos-tarjetas";
import { QueGeneraMasVentas } from "../historial-seccion";
import { ListaVideos } from "../lista-videos";
import { SenalesCreativasVista } from "../senales-vista";
import { MarcoMeta } from "../marco-meta";
import { ResumenVideos } from "../resumen-videos";

export const metadata = { title: "Videos · Anuncios Meta" };

export const dynamic = "force-dynamic";
// «Analizar los pendientes» corre aquí: baja y analiza varios videos (Gemini tarda de 20 a 90 segundos en cada uno).
export const maxDuration = 300;

/**
 * Anuncios Meta › Videos: cada video una sola vez (aunque esté en varios anuncios), con el hook, cuántos pasan los 3 y los 15 segundos y lo que cuesta cada compra. Los últimos 30 días. La barra filtra y agrupa
 * (ángulo, producto, campaña, etapa…), un selector ordena por lo que se quiera, y tocar un video muestra en qué campañas se usa (`?abrir=<id>` lo abre directo).
 */
export default async function VideosMetaPage({ searchParams }: { searchParams: ParametrosMeta }) {
  const { datos, escribe, pais, hayToken } = await cargarPaginaMeta(searchParams);
  const sp = await searchParams;
  const abrir = Array.isArray(sp.abrir) ? sp.abrir[0] : sp.abrir;
  const automatico = await estadoAnalisisAutomatico(createServiceClient());
  return (
    <MarcoMeta titulo="Videos" datos={datos} escribe={escribe} hayToken={hayToken} pais={pais}>
      {datos.videos.length === 0 ? (
        <p className="m-0 rounded-xl border border-border bg-card px-4 py-6 text-sm text-muted-foreground">Todavía no hay videos con gasto en este periodo.</p>
      ) : (
        <>
          <ResumenVideos videos={datos.videos} escribe={escribe} iaConectada={datos.iaConectada} />
          {datos.historial && (
            <div className="flex flex-col gap-3">
              <SenalesCreativasVista senales={datos.senales} />
              <HallazgosDeSeccion titulo="Lo que dicen los datos de los videos" hallazgos={datos.historial.hallazgos.videos} />
              <QueGeneraMasVentas historial={datos.historial} claves={["videos", "angulos", "ganchos", "formatos"]} />
            </div>
          )}
          <p className="-mb-2 text-xs text-muted-foreground">Del periodo elegido arriba. Un video repetido en varios anuncios cuenta una sola vez. Ordénalos, fíltralos o agrúpalos por campaña, ángulo, gancho o producto.</p>
          <ListaVideos videos={datos.videos} escribe={escribe} iaConectada={datos.iaConectada} sinAnalizar={datos.videosSinAnalizar} abrirInicial={abrir ?? null} automatico={automatico} />
        </>
      )}
    </MarcoMeta>
  );
}
