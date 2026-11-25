import { dolaresEnteros } from "@/lib/meta-ads/metricas";
import type { SenalesCreativas, VideoSenal } from "@/lib/meta-ads/senales-creativas";
import { BarraProgreso } from "./graficas";
import { SeccionPlegable } from "./plegable";

const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)} %`);
const cambio = (rec: number | null, prev: number | null) => (rec === null || prev === null || prev === 0 ? null : rec / prev - 1);

function FilaVideo({ v }: { v: VideoSenal }) {
  const c = cambio(v.ctrRec, v.ctrPrev);
  const h = cambio(v.hookRec, v.hookPrev);
  const fmt = (n: number | null) => (n === null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n * 100)} %`);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 text-xs sm:grid-cols-[minmax(0,14rem)_1fr_auto]">
      <span className="min-w-0">
        <span className="block truncate font-medium" title={v.nombre}>
          {v.nombre}
        </span>
        <span className="text-muted-foreground">
          {v.edadDias} días · {v.angulo ?? "sin ángulo"}
        </span>
      </span>
      <span className="hidden sm:block">
        <BarraProgreso valor={v.parte * 100} maximo={100} color={v.cansado ? "var(--destructive)" : "var(--meta-1)"} alto={8} />
      </span>
      <span className="flex flex-wrap items-center justify-end gap-1.5 tabular-nums">
        <span className="text-muted-foreground">{pct(v.parte)} del gasto</span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${c !== null && c < -0.15 ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground"}`}>CTR {fmt(c)}</span>
        <span className={`rounded-full px-2 py-0.5 font-medium ${h !== null && h < -0.15 ? "bg-destructive-soft text-destructive" : "bg-muted text-muted-foreground"}`}>Hook {fmt(h)}</span>
        {v.cansado && <span className="rounded-full bg-destructive px-2 py-0.5 font-medium text-white">Cansado</span>}
      </span>
    </li>
  );
}

function Producto({ s }: { s: SenalesCreativas }) {
  return (
    <li className="rounded-lg border border-border bg-card">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium leading-snug">{s.producto}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium tabular-nums">{dolaresEnteros(s.gasto14)} en 14 días</span>
              <span className="text-muted-foreground">
                {s.videosActivos} videos · {pct(s.parteVieja)} del gasto en videos viejos · {s.nuevos14.videos} nuevos
              </span>
            </span>
            <span className="mt-1.5 block text-sm text-muted-foreground">{s.causas[0] ? s.causas[0].titulo : "Sin señales de cansancio: los creativos se ven sanos."}</span>
          </span>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" className="mt-1 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </summary>
        <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
          {s.causas.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {s.causas.map((c) => (
                <li key={c.titulo} className="rounded-md border border-border p-2.5 text-sm">
                  <p className="m-0 font-medium leading-snug">{c.titulo}</p>
                  <p className="m-0 mt-1 text-xs text-muted-foreground">{c.detalle}</p>
                  <p className="m-0 mt-1.5 flex gap-2 rounded-md bg-success-soft px-2.5 py-1.5 text-xs">
                    <span className="shrink-0 font-semibold text-success">Qué hacer</span>
                    <span>{c.accion}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
          {s.videos.length > 0 && (
            <div className="flex flex-col gap-1">
              <h4 className="m-0 text-xs font-semibold text-muted-foreground">Los videos que más gastan (últimos 14 días, frente a la semana anterior)</h4>
              <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                {s.videos.map((v) => (
                  <FilaVideo key={v.id} v={v} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </details>
    </li>
  );
}

/**
 * «Por qué empeora: los creativos» (24 nov 2026, pedido de Alcides: ir más allá de «el CTR bajó»): por producto, si sus videos se están cansando, si dependen de uno solo, si hace días que no se sube nada nuevo y qué ángulo ha funcionado mejor,
 * con la acción concreta. Los que tienen causas primero.
 */
export function SenalesCreativasVista({ senales, abierta = true }: { senales: SenalesCreativas[]; abierta?: boolean }) {
  if (senales.length === 0) return null;
  const orden = [...senales].sort((a, b) => b.causas.length - a.causas.length || b.gasto14 - a.gasto14);
  const conCausas = orden.filter((s) => s.causas.length > 0).length;
  return (
    <SeccionPlegable titulo="Por qué empeora: los creativos" abierta={abierta} resumen={`${conCausas} de ${orden.length} productos con señales`} derecha="Cansancio, dependencia de un video y renovación">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {orden.map((s) => (
          <Producto key={s.producto} s={s} />
        ))}
      </ul>
    </SeccionPlegable>
  );
}
