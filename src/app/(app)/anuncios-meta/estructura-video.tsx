/* Anuncios Meta › ficha de un video: cómo está armado (estructura por partes con sus segundos), el llamado a la acción y la oferta que vio la IA, y cuánta gente llega a ese llamado. */

import type { ReactNode } from "react";
import { clicAVisita, ctr, llegaAlLlamado, nivelDeCtr, retencion } from "@/lib/meta-ads/metricas";
import type { VideoVista } from "@/lib/meta-ads/vistas";
import { VERSION_ANALISIS } from "@/lib/meta-ads/video-angulo";
import { Cifra, porcentaje } from "./piezas";

function Fila({ t, children }: { t: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{t}</dt>
      <dd className="m-0 break-words text-sm">{children}</dd>
    </div>
  );
}

const ROTULO = (d: number | null, h: number | null) => (d === null ? "—" : h === null || h === d ? `${d} s` : `${d}–${h} s`);

export function EstructuraYLlamado({ v }: { v: VideoVista }) {
  const a = v.analisis;
  if (!a || a.estado !== "analizado") return null;
  if (a.version < VERSION_ANALISIS) {
    return <p className="m-0 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground">Este video se analizó antes de que la IA sacara la estructura y el llamado a la acción. Pulsa «Volver a analizar con IA» arriba para completarlos.</p>;
  }
  const dur = a.duracionS && a.duracionS > 0 ? a.duracionS : null;
  const conTiempos = !!dur && a.estructura.length > 0 && a.estructura.every((p) => p.desde !== null);
  const llega = llegaAlLlamado(v.r, a.ctaSegundo, dur);
  const q = retencion(v.r);
  const clic = clicAVisita(v.r);
  const hayCta = !!a.cta && a.ctaTipo !== "ninguno";
  return (
    <div className="flex flex-col gap-4">
      {a.estructura.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="m-0 text-xs font-medium text-muted-foreground">Cómo está armado{dur ? ` (${dur} s)` : ""}</p>
          {conTiempos && dur && (
            <div role="img" aria-label={a.estructura.map((p) => `${p.parte} ${ROTULO(p.desde, p.hasta)}`).join(", ")} className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
              {a.estructura.map((p, i) => {
                const ancho = Math.max(2, (((p.hasta ?? p.desde ?? 0) - (p.desde ?? 0)) / dur) * 100);
                return <span key={i} style={{ width: `${ancho}%` }} className={p.parte === "llamado a la acción" ? "bg-primario" : "bg-border-control"} />;
              })}
            </div>
          )}
          <ol role="list" className="m-0 flex list-none flex-col gap-1.5 p-0">
            {a.estructura.map((p, i) => (
              <li key={i} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 text-sm">
                <span className="tabular-nums text-xs text-muted-foreground">{ROTULO(p.desde, p.hasta)}</span>
                <span className="min-w-0 break-words">
                  <span className="font-medium capitalize">{p.parte}</span>
                  <span className="text-muted-foreground"> · {p.resumen}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <dl className="m-0 flex flex-col gap-3">
        <Fila t="Llamado a la acción">
          {hayCta ? (
            <>
              <span className="font-medium">«{a.cta}»</span>
              <span className="text-xs text-muted-foreground">
                {a.ctaTipo ? ` · ${a.ctaTipo}` : ""}
                {a.ctaSegundo !== null ? ` · aparece en el segundo ${a.ctaSegundo}${dur ? ` de ${dur}` : ""}` : ""}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">El video no trae un llamado a la acción claro.</span>
          )}
        </Fila>
        {a.oferta && <Fila t="Oferta">{a.oferta}</Fila>}
        {a.recursos.length > 0 && (
          <Fila t="Recursos que usa">
            <span className="flex flex-wrap gap-1.5">
              {a.recursos.map((r) => (
                <span key={r} className="rounded-full border border-border px-2 py-0.5 text-xs">
                  {r}
                </span>
              ))}
            </span>
          </Fila>
        )}
      </dl>
      <div className="flex flex-col gap-2">
        <p className="m-0 text-xs font-medium text-muted-foreground">Qué tanto funcionó en el periodo</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2">
          <Cifra titulo="Llegan al llamado" valor={porcentaje(llega, 0)} apoyo={llega === null ? (q ? "Falta el segundo del llamado" : "Meta aún no da la retención") : "de los que vieron 3 s (estimado)"} />
          <Cifra titulo="CTR del enlace" valor={porcentaje(ctr(v.r), 2)} nivel={nivelDeCtr(ctr(v.r))} apoyo="clics ÷ impresiones" />
          <Cifra titulo="Clic → vio la página" valor={porcentaje(clic, 0)} apoyo="visitas ÷ clics" />
        </div>
        {q ? (
          <p className="m-0 text-xs tabular-nums text-muted-foreground">
            Siguen viendo (de los que vieron 3 s): 25 % del video {porcentaje(q.p25, 0)} · 50 % {porcentaje(q.p50, 0)} · 75 % {porcentaje(q.p75, 0)} · 95 % {porcentaje(q.p95, 0)}
          </p>
        ) : (
          <p className="m-0 text-xs text-muted-foreground">La retención del video (25, 50, 75 y 95 %) llega en la próxima lectura de Meta.</p>
        )}
      </div>
    </div>
  );
}
