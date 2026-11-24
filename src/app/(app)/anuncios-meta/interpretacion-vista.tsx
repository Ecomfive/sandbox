import Link from "next/link";
import type { ReactNode } from "react";
import type { InterpretacionGuardada, OpinionIA } from "@/lib/meta-ads/interpretacion-guardada";
import { SeccionPlegable } from "./plegable";

const fecha = (iso: string) => new Date(iso).toLocaleString("es-PA", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Panama" });

type Tono = "patron" | "riesgo" | "accion";

/** Cada bloque tiene su color, su ícono y su palabra: el significado no depende solo del color. */
const BLOQUE: Record<Tono, { titulo: string; cabecera: string; numero: string; icono: ReactNode }> = {
  patron: {
    titulo: "Patrones que se ven",
    cabecera: "bg-meta-3/10 text-meta-3",
    numero: "bg-meta-3 text-white",
    icono: <path d="M2.5 11.5 6 7.5l2.5 2.5 5-6M10.5 4h3v3" />,
  },
  riesgo: {
    titulo: "Riesgos",
    cabecera: "bg-destructive-soft text-destructive",
    numero: "bg-destructive text-white",
    icono: <path d="M8 2.5 14 13H2L8 2.5Zm0 4v3m0 1.8v.1" />,
  },
  accion: {
    titulo: "Qué conviene hacer",
    cabecera: "bg-success-soft text-success",
    numero: "bg-success text-white",
    icono: <path d="m3.5 8.5 3 3 6-6.5" />,
  },
};

/** Un bloque de la interpretación: el título de cada punto se ve de entrada y su detalle se despliega (y se vuelve a plegar). */
function BloquePuntos({ tono, puntos }: { tono: Tono; puntos: { titulo: string; detalle: string }[] }) {
  if (puntos.length === 0) return null;
  const b = BLOQUE[tono];
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-card">
      <h3 className={`m-0 flex items-center gap-2 px-3 py-2 text-xs font-semibold ${b.cabecera}`}>
        <svg aria-hidden="true" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          {b.icono}
        </svg>
        {b.titulo}
        <span className="ml-auto tabular-nums opacity-80">{puntos.length}</span>
      </h3>
      <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
        {puntos.map((p, i) => (
          <li key={p.titulo}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-start gap-2.5 px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground [&::-webkit-details-marker]:hidden">
                <span aria-hidden="true" className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${b.numero}`}>
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 font-medium leading-snug">{p.titulo}</span>
                <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" className="mt-1 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 3.5 10.5 8 6 12.5" />
                </svg>
              </summary>
              <p className="m-0 px-3 pb-3 pl-[2.6rem] text-sm text-muted-foreground">{p.detalle}</p>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Opinion({ o }: { o: OpinionIA }) {
  const i = o.interpretacion;
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 flex items-start gap-3 rounded-lg bg-meta-1/10 px-4 py-3 text-sm font-medium leading-relaxed ring-1 ring-meta-1/20">
        <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-meta-1 text-white">
          <svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor">
            <path d="M8 1.5 9.4 6 14 7.5 9.4 9 8 13.5 6.6 9 2 7.5 6.6 6 8 1.5Z" />
          </svg>
        </span>
        <span>{i.resumen}</span>
      </p>
      <div className="grid gap-3 lg:grid-cols-3">
        <BloquePuntos tono="patron" puntos={i.patrones} />
        <BloquePuntos tono="riesgo" puntos={i.riesgos} />
        <BloquePuntos tono="accion" puntos={i.recomendaciones} />
      </div>
      {i.limites.length > 0 && (
        <details className="rounded-lg border border-dashed border-border-control px-3 py-2 text-sm">
          <summary className="cursor-pointer text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">Lo que todavía no se puede concluir ({i.limites.length})</summary>
          <ul className="m-0 mt-2 flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
            {i.limites.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/**
 * La interpretación con IA del historial (24 nov 2026): la hace el sistema solo, una vez al día, con todas las IA que tengan clave. Rediseñada a pedido de Alcides: de listas de texto a tres bloques de color (patrones, riesgos, qué hacer)
 * cuyos puntos se despliegan uno a uno. La principal se ve de entrada; si hay otra, queda como «segunda opinión» desplegable. `enlace` lleva a Hallazgos (desde el Resumen). Sin interpretación todavía, dice que se está preparando.
 */
export function InterpretacionVista({ guardada, preparando, enlace = false, abierta = true }: { guardada: InterpretacionGuardada | null; preparando: boolean; enlace?: boolean; abierta?: boolean }) {
  const [principal, ...otras] = guardada?.opiniones ?? [];
  return (
    <SeccionPlegable
      titulo="Lo que dicen los datos del historial"
      abierta={abierta}
      resumen={principal ? principal.interpretacion.resumen : undefined}
      derecha={
        enlace ? (
          <Link href="/anuncios-meta/hallazgos" className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
            Ver el detalle y preguntar
          </Link>
        ) : guardada ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {guardada.opiniones.map((o) => (
              <span key={o.proveedor} className="rounded-full bg-card px-2 py-0.5 font-medium text-foreground ring-1 ring-border">
                {o.proveedor}
              </span>
            ))}
          </span>
        ) : undefined
      }
    >
      {!principal ? (
        <p className="m-0 text-sm text-muted-foreground" role="status">
          {preparando ? "El sistema está analizando el historial y la entrega de los productos: aparece aquí solo, en unos minutos." : "Todavía no hay una interpretación del historial. El sistema la prepara solo cada día, con las IA conectadas."}
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <Opinion o={principal} />
          {otras.map((o) => (
            <details key={o.proveedor} className="rounded-lg border border-border px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">Segunda opinión ({o.proveedor})</summary>
              <div className="mt-3">
                <Opinion o={o} />
              </div>
            </details>
          ))}
          <p className="m-0 text-xs text-muted-foreground">
            Hecho solo por el sistema con {guardada!.opiniones.map((o) => o.proveedor).join(" y ")} el {fecha(guardada!.generadaEn)}. Es una lectura de las estadísticas: si algo no cuadra, mandan las tablas.
          </p>
        </div>
      )}
    </SeccionPlegable>
  );
}
