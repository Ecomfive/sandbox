import { dolaresEnteros } from "@/lib/meta-ads/metricas";
import type { VideoVista } from "@/lib/meta-ads/vistas";
import { ParaRevisar } from "./para-revisar";
import { Anillo, BarraApilada, Leyenda, partesConColor, TarjetaMeta } from "./graficas";

type EstadoAnalisis = "analizado" | "provisional" | "error" | "sin_analizar";
const NOMBRE: Record<EstadoAnalisis, string> = { analizado: "Analizado con el video", provisional: "Provisional (solo el texto)", error: "Con error", sin_analizar: "Sin analizar" };
const COLOR: Record<EstadoAnalisis, string> = { analizado: "var(--success)", provisional: "var(--warning)", error: "var(--destructive)", sin_analizar: "var(--grafica-5)" };
const estado = (v: VideoVista): EstadoAnalisis => (!v.analisis ? "sin_analizar" : v.analisis.estado === "analizado" ? "analizado" : v.analisis.estado === "sin_archivo" ? "provisional" : "error");

/** Arriba de Videos: cuántos ya vio la IA y cómo se reparte lo que se gastó por ángulo, por gancho y por formato de video. */
export function ResumenVideos({ videos, escribe = false, iaConectada = false }: { videos: VideoVista[]; escribe?: boolean; iaConectada?: boolean }) {
  if (videos.length === 0) return null;
  const estados: Record<EstadoAnalisis, number> = { analizado: 0, provisional: 0, error: 0, sin_analizar: 0 };
  for (const v of videos) estados[estado(v)]++;
  const gasto = videos.reduce((s, v) => s + v.r.gasto, 0);
  const porGasto = (clave: (v: VideoVista) => string | null | undefined) => {
    const m = new Map<string, number>();
    for (const v of videos) {
      const k = clave(v);
      if (k) m.set(k, (m.get(k) ?? 0) + v.r.gasto);
    }
    return partesConColor([...m].map(([nombre, valor]) => ({ nombre, valor })));
  };
  const angulos = porGasto((v) => v.analisis?.angulo ?? v.angulo);
  const ganchos = porGasto((v) => v.analisis?.ganchoTipo);
  const formatos = porGasto((v) => (v.analisis && v.analisis.estado !== "error" ? v.analisis.formato : null));
  const tipos = Object.keys(estados) as EstadoAnalisis[];
  // Los videos que la IA no pudo ver completos (solo texto o con error), con el motivo, para abrirlos y decidir qué hacer.
  const aRevisar = videos.filter((v) => v.analisis && estado(v) !== "analizado").sort((a, b) => b.r.gasto - a.r.gasto);
  return (
    <section aria-label="Resumen de los videos" className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <TarjetaMeta titulo="Lo que ya vio la IA" derecha={`${videos.length} videos`} id="resumen-analisis">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
          <Anillo
            tamano={112}
            grosor={13}
            etiqueta={`Videos: ${tipos.map((t) => `${estados[t]} ${NOMBRE[t].toLowerCase()}`).join(", ")}`}
            partes={tipos.map((t) => ({ nombre: NOMBRE[t], valor: estados[t], color: COLOR[t] }))}
            centro={
              <>
                <span className="text-xl font-semibold tabular-nums">{Math.round((estados.analizado / videos.length) * 100)} %</span>
                <span className="text-[11px] text-muted-foreground">analizados</span>
              </>
            }
          />
          <ul role="list" className="m-0 flex min-w-[10rem] flex-1 list-none flex-col gap-1.5 p-0 text-sm">
            {tipos.map((t) => (
              <li key={t} className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2">
                  <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: COLOR[t] }} />
                  {NOMBRE[t]}
                </span>
                <span className="font-semibold tabular-nums">{estados[t]}</span>
              </li>
            ))}
          </ul>
        </div>
        {aRevisar.length > 0 && (
          <ParaRevisar
            total={aRevisar.length}
            puedeReintentar={escribe && iaConectada}
            videos={aRevisar.slice(0, 6).map((v) => ({ id: v.id, nombre: v.nombre, estado: NOMBRE[estado(v)], color: COLOR[estado(v)], motivo: v.analisis?.error ?? null }))}
          />
        )}
      </TarjetaMeta>

      <TarjetaMeta titulo="Dónde se gasta" derecha={`${dolaresEnteros(gasto)} en videos del periodo`} id="resumen-gasto">
        <div className="flex flex-col gap-5">
          <Reparto titulo="Por ángulo" partes={angulos} vacio="Todavía no hay videos con ángulo." />
          <div className="grid gap-5 md:grid-cols-2">
            <Reparto titulo="Por tipo de gancho" partes={ganchos} vacio="Todavía no hay ganchos clasificados (se hace en Qué funciona › Gancho)." />
            <Reparto titulo="Por formato" partes={formatos} vacio="Todavía no hay videos analizados." />
          </div>
        </div>
      </TarjetaMeta>
    </section>
  );
}

function Reparto({ titulo, partes, vacio }: { titulo: string; partes: { nombre: string; valor: number; color: string }[]; vacio: string }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="m-0 text-xs font-medium text-muted-foreground">{titulo}</p>
      {total === 0 ? (
        <p className="m-0 text-sm text-muted-foreground">{vacio}</p>
      ) : (
        <>
          <BarraApilada partes={partes} alto={14} conPorcentaje etiqueta={`Gasto ${titulo.toLowerCase()}: ${partes.map((p) => `${p.nombre} ${Math.round((p.valor / total) * 100)} %`).join(", ")}`} />
          <Leyenda partes={partes.map((p) => ({ nombre: p.nombre, color: p.color, texto: `${Math.round((p.valor / total) * 100)} %` }))} />
        </>
      )}
    </div>
  );
}
