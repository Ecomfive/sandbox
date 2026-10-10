"use client";

import { etiquetaVia, prometidoJunto, resumenReal, VIAS_RUTA, type ResumenesReales } from "@/lib/compras/rutas-envio";
import type { FilaRuta } from "./def-envios";

/** Hoy en Panamá (AAAA-MM-DD). */
export const hoyPanama = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Panama" });

/**
 * Los envíos de varias rutas juntas (un país, o todos), sin contar dos veces los de dos rutas del mismo agente, país y vía
 * (Venezuela aéreo por UPS y por DHL miden las mismas compras).
 */
export function realJunto(filas: FilaRuta[], hoy: string): ResumenesReales {
  const vistos = new Map<string, FilaRuta["envios"]>();
  for (const f of filas) if (f.agente) vistos.set(`${f.agente.toLowerCase()}|${f.paisCodigo}|${f.via}`, f.envios);
  return resumenReal([...vistos.values()].flat(), hoy);
}

/** Las vías que tienen esas rutas, en su orden (marítimo, aéreo, terrestre), con sus rutas. */
export const porVia = (filas: FilaRuta[]) => VIAS_RUTA.map((v) => ({ via: v.valor as string, filas: filas.filter((f) => f.via === v.valor) })).filter((x) => x.filas.length > 0);

/** Los colores de cada marca de la barra (los mismos en la leyenda). */
const MARCAS = [
  { clave: "historico", nombre: "Promedio histórico", clase: "bg-foreground" },
  { clave: "ultimos12", nombre: "Últimos 12 meses", clase: "bg-primario" },
  { clave: "ultimos2", nombre: "Últimos 2 meses", clase: "bg-amber-500" },
] as const;

/**
 * La barra de tiempos: la franja verde es lo que promete el agente (de mínimo a máximo) y cada punto es lo que de verdad tarda
 * (el promedio histórico, el de los últimos 12 meses y el de los últimos 2). Un punto con borde rojo pasa de lo prometido.
 * `compacta` es la de una fila de la tabla (sin números ni leyenda; todo va en su descripción para lectores de pantalla).
 */
export function BarraTiempos({
  prometido,
  real,
  compacta = false,
  escala: escalaFija,
}: {
  prometido: { min: number; max: number } | null;
  real: ResumenesReales;
  compacta?: boolean;
  /** Días del final de la barra (para que varias barras se comparen en la misma escala). */
  escala?: number;
}) {
  const valores = MARCAS.map((m) => ({ ...m, dias: real[m.clave].promedio, n: real[m.clave].n })).filter((m) => m.dias !== null) as (Omit<(typeof MARCAS)[number], never> & { dias: number; n: number })[];
  if (!prometido && valores.length === 0) return <span className="text-muted-foreground">—</span>;
  const escala = escalaFija ?? Math.max(10, Math.ceil((Math.max(prometido?.max ?? 0, ...valores.map((v) => v.dias)) * 1.15) / 10) * 10);
  const pos = (d: number) => `${Math.min(100, (d / escala) * 100)}%`;
  const descripcion = [
    prometido ? `Prometido ${prometido.min === prometido.max ? prometido.min : `${prometido.min} a ${prometido.max}`} días` : "Sin tiempo prometido",
    ...valores.map((v) => `${v.nombre}: ${v.dias} días`),
  ].join(". ");

  return (
    <div className={`flex min-w-0 flex-col ${compacta ? "w-44" : "w-full gap-1.5"}`}>
      <div role="img" aria-label={descripcion} className={`relative ${compacta ? "h-4" : "h-6"}`}>
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-muted" />
        {prometido && (
          <div
            className="absolute top-1/2 h-2.5 -translate-y-1/2 rounded-full border border-success/60 bg-success/25"
            style={{ left: pos(prometido.min), width: `max(6px, calc(${pos(prometido.max)} - ${pos(prometido.min)}))` }}
          />
        )}
        {valores.map((v) => (
          <span
            key={v.clave}
            className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ${v.clase} ${compacta ? "h-2.5 w-2.5" : "h-3.5 w-3.5"} ${
              prometido && v.dias > prometido.max ? "ring-destructive" : "ring-card"
            }`}
            style={{ left: pos(v.dias) }}
          />
        ))}
      </div>
      {!compacta && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-4 rounded-full border border-success/60 bg-success/25" />
            Prometido <strong className="font-semibold text-foreground tabular-nums">{prometido ? (prometido.min === prometido.max ? `${prometido.min} d` : `${prometido.min}–${prometido.max} d`) : "—"}</strong>
          </span>
          {MARCAS.map((m) => {
            const r = real[m.clave];
            return (
              <span key={m.clave} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${m.clase}`} />
                {m.nombre}{" "}
                <strong className={`font-semibold tabular-nums ${prometido && r.promedio !== null && r.promedio > prometido.max ? "text-destructive" : "text-foreground"}`}>
                  {r.promedio === null ? "—" : `${r.promedio} d`}
                </strong>
                {r.n > 0 && <span className="tabular-nums">({r.n})</span>}
              </span>
            );
          })}
          <span className="ml-auto tabular-nums">0–{escala} días</span>
        </div>
      )}
    </div>
  );
}

/**
 * Arriba de la tabla: todos los países juntos, una barra por vía (lo prometido en promedio contra lo que de verdad tarda).
 * Cuenta las rutas que deja ver la página (de los países que la persona puede ver).
 */
export function ResumenGlobal({ rutas }: { rutas: FilaRuta[] }) {
  const hoy = hoyPanama();
  const vias = porVia(rutas);
  if (vias.length === 0) return null;
  const paises = new Set(rutas.map((r) => r.paisCodigo)).size;
  return (
    <section aria-labelledby="titulo-resumen-envios" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
      <h2 id="titulo-resumen-envios" className="m-0 text-sm font-semibold">
        Todos los países <span className="font-normal text-muted-foreground">· {paises} países · {rutas.length} rutas</span>
      </h2>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {vias.map(({ via, filas }) => (
          <div key={via} className="flex min-w-0 flex-col gap-1.5">
            <span className="text-sm font-medium">{etiquetaVia(via)}</span>
            <BarraTiempos prometido={prometidoJunto(filas)} real={realJunto(filas, hoy)} />
          </div>
        ))}
      </div>
    </section>
  );
}
