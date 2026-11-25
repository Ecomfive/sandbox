import { BotonesDecidir } from "./decidir";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, type Tone } from "@/components/ui/badge";
import { claseMetrica, type NivelMetrica } from "@/lib/metricas-meta-ads";
import { GASTO_MINIMO_CONFIABLE, METRICAS_CAMPANA, conSigno, confiable, cpa, cpm, ctr, cvr, dolares, efectividad, hookRate, nivelDeCpa, nivelDeCtr, nivelDeHook, nivelDeResultado, nivelesDeMetricas, nivelFrecuencia, nivelTiempo, resultado, tiempoPromedio, type ClaveMetrica, type Resultados } from "@/lib/meta-ads/metricas";
import { NOMBRE_PRIORIDAD, type Pendiente } from "@/lib/meta-ads/prioridad";
import type { CifraSugerencia, Prioridad } from "@/lib/meta-ads/sugerencias";
import { NOMBRE_ETAPA, NOMBRE_PUJA, type Estructura, type Etapa, type Puja } from "@/lib/meta-ads/nombre";

export const entero = (n: number) => n.toLocaleString("es-PA", { maximumFractionDigits: 0 });
export const porcentaje = (n: number | null, decimales = 1) => (n === null ? "—" : `${n.toFixed(decimales)} %`);
export const valorCpa = (r: Resultados) => {
  const v = cpa(r);
  // Sin compras no hay CPA (gasto ÷ compras): si ya gastó, se dice «Sin compras» y no un guion que parece un dato que falta.
  return v === null ? (r.gasto > 0 ? "Sin compras" : "—") : dolares(v);
};

const TONO_ETAPA: Record<Etapa, Tone> = { testing: "azul", venta: "info", escala: "success", retargeting: "warning" };

const TONO_PRIORIDAD: Record<Prioridad, Tone> = { apagar: "destructive", actuar: "warning", oportunidad: "success", observar: "azul", historial: "neutral" };

/** Lo más urgente de una fila («Apagar», «Actuar hoy»…); con varias de lo mismo, cuántas. Sin nada pendiente no se dibuja. */
export function InsigniaPrioridad({ pendiente }: { pendiente: Pendiente | null | undefined }) {
  if (!pendiente) return null;
  return (
    <Badge tone={TONO_PRIORIDAD[pendiente.prioridad]}>
      {NOMBRE_PRIORIDAD[pendiente.prioridad]}
      {pendiente.cuantas > 1 ? ` · ${pendiente.cuantas}` : ""}
    </Badge>
  );
}

/** El «Qué hacer» de una fila, dentro de su ficha: la prioridad, las cifras que la explican y la acción. */
export function QueHacer({ pendiente }: { pendiente: Pendiente }) {
  return (
    <section aria-label="Qué hacer" className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-sm font-semibold">Qué hacer</h3>
        <InsigniaPrioridad pendiente={{ ...pendiente, cuantas: 1 }} />
      </div>
      {pendiente.cifras && pendiente.cifras.length > 0 && <CifrasEnLinea cifras={pendiente.cifras} />}
      <p className="m-0 text-sm">{pendiente.accion}</p>
      {pendiente.clave && <BotonesDecidir clave={pendiente.clave} titulo={pendiente.titulo} />}
    </section>
  );
}

const TONO_CIFRA = { bueno: "bg-success-soft text-success", medio: "bg-warning-soft text-warning", malo: "bg-destructive-soft text-destructive" } as const;

/** El CPA de una campaña de un vistazo (7 días, últimos 3, semana anterior y tope), coloreado frente al tope. */
export function CifrasEnLinea({ cifras }: { cifras: CifraSugerencia[] }) {
  return (
    <dl className="m-0 flex flex-wrap gap-1.5">
      {cifras.map((c) => (
        <div key={c.etiqueta} className={`flex items-baseline gap-1.5 rounded-md px-2 py-1 text-xs ${c.tono ? TONO_CIFRA[c.tono] : "bg-muted text-foreground"}`}>
          <dt>{c.etiqueta}</dt>
          <dd className="m-0 font-semibold tabular-nums">{c.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/** La etapa de una campaña; sin etapa en el nombre ni corregida a mano, «Sin etapa». */
export function InsigniaEtapa({ etapa }: { etapa: Etapa | null }) {
  return etapa ? <Badge tone={TONO_ETAPA[etapa]}>{NOMBRE_ETAPA[etapa]}</Badge> : <Badge tone="neutral">Sin etapa</Badge>;
}

export function InsigniaEstructura({ estructura, puja }: { estructura: Estructura | null; puja: Puja | null }) {
  if (!estructura && !puja) return <Badge tone="neutral">Sin datos</Badge>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {estructura && <Badge tone="neutral">{estructura}</Badge>}
      {puja && <Badge tone="neutral">{NOMBRE_PUJA[puja]}</Badge>}
    </span>
  );
}

export const NOMBRE_ESTADO_META: Record<string, string> = { ACTIVE: "Activa", PAUSED: "Pausada", CAMPAIGN_PAUSED: "Pausada", ADSET_PAUSED: "Pausada", ARCHIVED: "Archivada", DELETED: "Eliminada", WITH_ISSUES: "Con problemas", IN_PROCESS: "En revisión", PENDING_REVIEW: "En revisión", DISAPPROVED: "Rechazada" };
export const nombreEstado = (estado: string) => NOMBRE_ESTADO_META[estado] ?? "Sin estado";

/** El color de una cifra por su nivel; el nivel también se dice con texto para lectores de pantalla y para quien no distingue colores. */
export function Nivel({ nivel, children }: { nivel: NivelMetrica; children: ReactNode }) {
  const texto = nivel === "bueno" ? "bueno" : nivel === "medio" ? "regular" : nivel === "malo" ? "malo" : null;
  return (
    <span className={`font-medium tabular-nums ${claseMetrica(nivel)}`}>
      {children}
      {texto && <span className="sr-only"> ({texto})</span>}
    </span>
  );
}

export function PuntoNivel({ nivel }: { nivel: NivelMetrica }) {
  const clase = nivel === "bueno" ? "bg-success" : nivel === "medio" ? "bg-warning" : nivel === "malo" ? "bg-destructive" : "bg-muted-foreground";
  return <span aria-hidden="true" className={`inline-block h-2 w-2 shrink-0 rounded-full ${clase}`} />;
}

/** El resultado estimado (compras × CPA tope − gasto): verde si deja, rojo si pierde; con poca data se atenúa y lo dice. */
export function Resultado({ r, tope, grande = false, valor }: { r: Resultados; tope: number; grande?: boolean; valor?: number }) {
  const v = valor ?? resultado(r, tope);
  if (r.gasto === 0) return <span className="text-muted-foreground">—</span>;
  const ok = confiable(r);
  return (
    <span className={`${grande ? "text-lg font-semibold" : "text-sm font-medium"} tabular-nums ${ok ? claseMetrica(nivelDeResultado(v)) : "text-muted-foreground"}`}>
      {conSigno(v)}
      {!ok && <span className="ml-1 text-xs font-normal">poca data</span>}
    </span>
  );
}

/** Una cifra con su nombre: título, valor y una línea de apoyo (como las tarjetas de indicadores del resto del sistema). */
export function Cifra({ titulo, valor, apoyo, nivel }: { titulo: string; valor: ReactNode; apoyo?: ReactNode; nivel?: NivelMetrica }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {nivel && nivel !== "neutral" && <PuntoNivel nivel={nivel} />}
        <span>{titulo}</span>
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{valor}</p>
      {apoyo && <p className="mt-0.5 text-xs text-muted-foreground">{apoyo}</p>}
    </div>
  );
}

/** Tiempo promedio de reproducción («7.4 s») y frecuencia de los últimos 7 días («1.85»); «—» si todavía no se leen de Meta. */
export const textoTiempo = (r: Resultados): string => (tiempoPromedio(r) === null ? "—" : `${tiempoPromedio(r)!.toFixed(1)} s`);
export const textoFrecuencia = (f: number | null): string => (f === null ? "—" : f.toFixed(2));

/** El texto de cada una de las ocho cifras de una campaña («$4.20», «49.12 %», «Sin compras»). */
export function textoMetrica(clave: ClaveMetrica, r: Resultados): string {
  const pct = (n: number | null) => porcentaje(n, 2);
  switch (clave) {
    case "cpm":
      return cpm(r) === null ? "—" : dolares(cpm(r)!);
    case "efectividad":
      return pct(efectividad(r));
    case "hook":
      return pct(hookRate(r));
    case "ctr":
      return pct(ctr(r));
    case "cpa":
      return valorCpa(r);
    case "gasto":
      return r.gasto > 0 ? dolares(r.gasto) : "—";
    case "compras":
      return r.gasto > 0 || r.compras > 0 ? entero(r.compras) : "—";
    case "cvr":
      return pct(cvr(r));
  }
}

/**
 * Las ocho cifras de la hoja de Control de Testing (CPM, % Efectividad, Hook Rate, CTR, CPA, Gasto, Compras y CVR) como celdas de una fila de campaña: en pantalla ancha cada una es una columna (su título
 * lo dice el encabezado) y en una angosta van en una línea con su nombre. Con la etapa «testing» llevan el color de las escalas de la hoja.
 */
export function CeldasMetricas({ r, etapa, tope }: { r: Resultados; etapa: string | null; tope: number }) {
  const niveles = nivelesDeMetricas(r, etapa, tope);
  return (
    <span className="col-span-full flex flex-wrap gap-x-4 gap-y-0.5 xl:contents">
      {METRICAS_CAMPANA.map((m) => (
        <span key={m.clave} className="text-sm tabular-nums xl:text-right">
          <span className="text-xs text-muted-foreground xl:sr-only">{m.titulo} </span>
          <Nivel nivel={niveles[m.clave]}>{textoMetrica(m.clave, r)}</Nivel>
        </span>
      ))}
    </span>
  );
}

/** Las métricas de un resultado en una línea: para filas y fichas. Con `completa`, las ocho de la hoja de Testing (con sus colores según la etapa); sin ella, solo CPA, CTR y Hook. */
export function MetricasEnLinea({ r, tope, etapa = null, completa = false, frecuencia = null }: { r: Resultados; tope: number; etapa?: string | null; completa?: boolean; frecuencia?: number | null }) {
  if (completa) {
    const niveles = nivelesDeMetricas(r, etapa, tope);
    return (
      <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        {METRICAS_CAMPANA.filter((m) => textoMetrica(m.clave, r) !== "—").map((m) => (
          <span key={m.clave}>
            {m.titulo} <Nivel nivel={niveles[m.clave]}>{textoMetrica(m.clave, r)}</Nivel>
          </span>
        ))}
        {tiempoPromedio(r) !== null && (
          <span>
            Tiempo prom. <Nivel nivel={nivelTiempo(tiempoPromedio(r))}>{textoTiempo(r)}</Nivel>
          </span>
        )}
        {frecuencia !== null && (
          <span>
            Frecuencia <Nivel nivel={nivelFrecuencia(frecuencia)}>{textoFrecuencia(frecuencia)}</Nivel>
          </span>
        )}
      </span>
    );
  }
  const c = cpa(r);
  const t = ctr(r);
  const h = hookRate(r);
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      <span>
        CPA <Nivel nivel={nivelDeCpa(c, tope)}>{valorCpa(r)}</Nivel>
      </span>
      <span>
        CTR <Nivel nivel={nivelDeCtr(t)}>{porcentaje(t)}</Nivel>
      </span>
      {h !== null && (
        <span>
          Hook <Nivel nivel={nivelDeHook(h)}>{porcentaje(h, 0)}</Nivel>
        </span>
      )}
    </span>
  );
}

export const AVISO_POCA_DATA = `Con menos de ${dolares(GASTO_MINIMO_CONFIABLE)} gastados todavía no se puede decir si funciona: las cifras se ven atenuadas y no entran en los primeros lugares.`;

/** Una barra horizontal: el ancho es `valor` sobre `maximo`. Solo decora: el número va siempre al lado. */
export function BarraSimple({ valor, maximo, clase = "bg-foreground" }: { valor: number; maximo: number; clase?: string }) {
  const ancho = maximo > 0 ? Math.max(valor > 0 ? 2 : 0, Math.min(100, (valor / maximo) * 100)) : 0;
  return (
    <span aria-hidden="true" className="block h-2 w-full overflow-hidden rounded-full bg-muted">
      <span className={`block h-full rounded-full ${clase}`} style={{ width: `${ancho}%` }} />
    </span>
  );
}

export function AvisoMigracion() {
  return (
    <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
      Falta correr en Supabase la migración 0320 (Anuncios Meta).
    </p>
  );
}

export function SinCuentas({ pais, puedeAgregar }: { pais: string; puedeAgregar: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-border-control bg-card px-4 py-8 text-center">
      <p className="m-0 text-sm font-medium">No hay cuentas publicitarias de Meta en {pais}.</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {puedeAgregar ? (
          <>
            Agrégalas en <Link className="underline underline-offset-2" href="/anuncios-meta/cuentas">Cuentas</Link>, con el ID que empieza por act_ de cada una.
          </>
        ) : (
          "Pídele a quien administra el módulo que las agregue."
        )}
      </p>
    </div>
  );
}
