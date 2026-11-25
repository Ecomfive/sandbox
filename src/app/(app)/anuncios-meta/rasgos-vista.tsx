import type { RasgoComun, RasgosDeGanadores } from "@/lib/meta-ads/rasgos-ganadores";
import { BarraProgreso } from "./graficas";
import { SeccionPlegable } from "./plegable";

const pct = (n: number) => `${Math.round(n * 100)} %`;

/** Un rasgo con dos barras: cuántos de los que funcionaron lo tienen y cuántos de los demás, para ver la diferencia de un vistazo. */
function FilaRasgo({ x, ganadores, resto, tono }: { x: RasgoComun; ganadores: number; resto: number; tono: "copiar" | "evitar" }) {
  return (
    <li className="rounded-md border border-border px-2.5 py-2 text-xs">
      <p className="m-0 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${tono === "copiar" ? "bg-success-soft text-success" : "bg-warning-soft text-warning"}`}>{x.dimension}</span>
        <span className="text-sm font-medium">{x.valor}</span>
      </p>
      <div className="mt-1.5 grid grid-cols-[5.5rem_1fr_auto] items-center gap-x-2 gap-y-1 tabular-nums">
        <span className="text-muted-foreground">Funcionaron</span>
        <BarraProgreso valor={x.parteGanadores * 100} maximo={100} color="var(--success)" alto={7} />
        <span className="text-right">
          {x.enGanadores} de {ganadores} · {pct(x.parteGanadores)}
        </span>
        <span className="text-muted-foreground">Los demás</span>
        <BarraProgreso valor={x.parteResto * 100} maximo={100} color="var(--grafica-5)" alto={7} />
        <span className="text-right text-muted-foreground">
          {x.enResto} de {resto} · {pct(x.parteResto)}
        </span>
      </div>
    </li>
  );
}

function Tarjeta({ r }: { r: RasgosDeGanadores }) {
  const de = r.sobre === "anuncios" ? "anuncios" : "páginas";
  return (
    <li className="rounded-lg border border-border bg-card">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 rounded-lg px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium leading-snug">{r.nombre}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-full bg-success-soft px-2 py-0.5 font-medium text-success">
                {r.ganadores} {de} funcionaron
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{r.resto} los demás</span>
              <span className="text-muted-foreground">{r.criterio}</span>
            </span>
            {r.recomendaciones[0] && <span className="mt-1.5 block text-sm text-muted-foreground">{r.recomendaciones[0]}</span>}
          </span>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16" className="mt-1 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3.5 10.5 8 6 12.5" />
          </svg>
        </summary>
        <div className="flex flex-col gap-4 border-t border-border px-3 py-3">
          {r.comunes.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="m-0 text-xs font-semibold text-success">Lo que comparten los que funcionaron (para copiar)</h4>
              <ul className="m-0 grid list-none gap-2 p-0 lg:grid-cols-2">
                {r.comunes.map((x) => (
                  <FilaRasgo key={x.rasgo} x={x} ganadores={r.ganadores} resto={r.resto} tono="copiar" />
                ))}
              </ul>
            </div>
          )}
          {r.evitar.length > 0 && (
            <div className="flex flex-col gap-2">
              <h4 className="m-0 text-xs font-semibold text-warning">Lo que casi nunca tienen y abunda en los que no funcionaron (para evitar)</h4>
              <ul className="m-0 grid list-none gap-2 p-0 lg:grid-cols-2">
                {r.evitar.map((x) => (
                  <FilaRasgo key={x.rasgo} x={x} ganadores={r.ganadores} resto={r.resto} tono="evitar" />
                ))}
              </ul>
            </div>
          )}
          {r.recomendaciones.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="m-0 text-xs font-semibold text-muted-foreground">Cómo parecerse más a los que funcionaron</h4>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                {r.recomendaciones.map((t) => (
                  <li key={t} className="flex gap-2 rounded-md bg-success-soft px-2.5 py-1.5 text-xs">
                    <span className="shrink-0 font-semibold text-success">Hacer</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {r.ejemplos.length > 0 && (
            <p className="m-0 text-[11px] text-muted-foreground">
              Los mejores: {r.ejemplos.map((e) => `${e.nombre} (${e.valor} %)`).join(" · ")}. Es lo que se asocia con funcionar, no una garantía: con pocos casos puede ser casualidad.
            </p>
          )}
        </div>
      </details>
    </li>
  );
}

/**
 * «Qué tienen en común los que funcionaron» (24 nov 2026, pedido de Alcides): para el CTR y el hook de los anuncios y para el clic a visita y la conversión de las páginas, cómo eran los que cayeron en la zona buena y funcionaron
 * (su video, su texto, su campaña y su página) frente a los demás, qué conviene copiar y qué evitar. Solo sale lo que tiene suficientes casos para decir algo.
 */
export function RasgosDeGanadoresVista({ rasgos, abierta = true }: { rasgos: RasgosDeGanadores[]; abierta?: boolean }) {
  if (rasgos.length === 0) return null;
  return (
    <SeccionPlegable titulo="Qué tienen en común los que funcionaron" abierta={abierta} resumen={`${rasgos.length} ${rasgos.length === 1 ? "métrica con patrones" : "métricas con patrones"}`} derecha="Anuncios (CTR, hook) y páginas (clic a visita, conversión)">
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {rasgos.map((r) => (
          <Tarjeta key={r.metrica} r={r} />
        ))}
      </ul>
    </SeccionPlegable>
  );
}
