import Link from "next/link";
import { Children, Fragment, isValidElement, type ReactNode } from "react";
import { claseKpi, type Tono } from "@/components/ui/kpi-card";
import type { Moneda } from "@/lib/af4/formato";
import type { ModoVariacion, Variacion as DatosVariacion } from "@/lib/af4/variacion";
import { Variacion } from "./variacion";

const PUNTO: Record<Tono, string> = {
  neutral: "bg-muted-foreground",
  info: "bg-accent-foreground",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
};

export interface ComparacionKpi {
  v: DatosVariacion;
  /** Contra qué: «ago 26», «presupuesto». */
  contra: string;
  modo?: ModoVariacion;
}

/** Una curva mínima de la serie (sin ejes): la tendencia, no los valores. Decorativa: el valor y la variación ya la dicen. */
function MiniSerie({ valores }: { valores: number[] }) {
  const puntos = valores.filter((v) => Number.isFinite(v));
  if (puntos.length < 2) return null;
  const min = Math.min(...puntos);
  const max = Math.max(...puntos);
  const rango = max - min || 1;
  const ancho = 72;
  const alto = 22;
  const paso = ancho / (puntos.length - 1);
  const y = (v: number) => alto - 2 - ((v - min) / rango) * (alto - 4);
  const d = puntos.map((v, i) => `${i ? "L" : "M"}${(i * paso).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  const cero = min < 0 && max > 0 ? y(0) : null;
  return (
    <svg viewBox={`0 0 ${ancho} ${alto}`} width={ancho} height={alto} aria-hidden="true" className="shrink-0 overflow-visible">
      {cero !== null && <line x1="0" x2={ancho} y1={cero} y2={cero} stroke="var(--border-control)" strokeWidth="1" strokeDasharray="2 2" />}
      <path d={d} fill="none" stroke="var(--grafica-2)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={(puntos.length - 1) * paso} cy={y(puntos[puntos.length - 1])} r="2" fill="var(--grafica-2)" />
    </svg>
  );
}

export interface PropsContenidoKpiAF4 {
  titulo: string;
  /** Ya formateado (`dineroKpi`, `porcentaje`). */
  valor: ReactNode;
  tono?: Tono;
  comparaciones?: ComparacionKpi[];
  /** Los valores de los últimos meses, del más viejo al más nuevo. */
  serie?: number[];
  subtexto?: ReactNode;
  moneda?: Moneda;
  /** El indicador principal de la fila: valor un paso más grande. */
  destacado?: boolean;
}

/** Lo de adentro de un KPI AF4 (título con su punto, valor, comparaciones, curva y subtexto): lo comparten `KpiAF4` y
 * `KpiFiltroAF4` (la tarjeta que filtra la tabla de la página). */
export function ContenidoKpiAF4({ titulo, valor, tono = "neutral", comparaciones = [], serie, subtexto, moneda = "USD", destacado = false }: PropsContenidoKpiAF4) {
  return (
    <>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[tono]}`} />
        <span className="truncate">{titulo}</span>
      </p>
      <div className="mt-1.5 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <p className={`min-w-0 font-semibold tracking-tight tabular-nums ${destacado ? "text-xl leading-7 sm:text-[1.625rem] sm:leading-8" : "text-lg leading-7 sm:text-[1.375rem]"}`}>
          {valor}
        </p>
        {serie && <MiniSerie valores={serie} />}
      </div>
      {comparaciones.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-0.5">
          {comparaciones.map((c) => (
            <li key={c.contra} className="min-w-0">
              <Variacion v={c.v} contra={c.contra} modo={c.modo} moneda={moneda} />
            </li>
          ))}
        </ul>
      )}
      {subtexto && <p className="mt-1 text-xs text-muted-foreground">{subtexto}</p>}
    </>
  );
}

/**
 * El KPI ejecutivo del Portal AF4: título con su punto de estado, el valor grande, hasta dos comparaciones (vs el período
 * anterior, vs el presupuesto) y, opcional, la curva de los últimos meses. Usa la misma caja que `KpiCard` (`claseKpi`),
 * así que convive en un `KpiGrid` con tarjetas de siempre. Con `href` es un enlace a su detalle.
 */
export function KpiAF4({
  href,
  activa = false,
  ...props
}: PropsContenidoKpiAF4 & {
  href?: string;
  /** Con `href`: la que está elegida ahora (un escenario, un filtro), con el resalte y `aria-current` de `KpiCard`. */
  activa?: boolean;
}) {
  const tono = props.tono ?? "neutral";
  if (!href)
    return (
      <div className={`${claseKpi(tono, false)} max-sm:p-3`}>
        <ContenidoKpiAF4 {...props} />
      </div>
    );
  return (
    <Link href={href} scroll={false} aria-current={activa ? "true" : undefined} className={`${claseKpi(tono, true, activa)} max-sm:p-3`}>
      <ContenidoKpiAF4 {...props} />
    </Link>
  );
}

/**
 * Columnas según cuántas tarjetas hay, para que las filas queden completas (5 en una fila, 6 en dos de 3 o en una de 6 si
 * cabe) en vez de dejar una tarjeta sola con un hueco al lado. Con 1, 2 o más de 6, columnas de un ancho fijo.
 * Clases escritas enteras: Tailwind solo genera las que ve.
 */
const COLUMNAS_KPI: Record<number, string> = {
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-2 xl:grid-cols-4",
  5: "sm:grid-cols-3 xl:grid-cols-5",
  6: "sm:grid-cols-3 2xl:grid-cols-6",
};

/**
 * La fila de KPIs ejecutivos, nunca recortadas: dos por fila en el celular y, en pantallas más anchas, filas completas
 * (ver `COLUMNAS_KPI`).
 */
/** Cuántas tarjetas hay, contando las que vienen dentro de un fragmento (`{caja && <>…</>}`). */
function contarTarjetas(nodos: ReactNode): number {
  return Children.toArray(nodos).reduce<number>(
    (n, nodo) => n + (isValidElement<{ children?: ReactNode }>(nodo) && nodo.type === Fragment ? contarTarjetas(nodo.props.children) : 1),
    0,
  );
}

export function FilaKpiAF4({ children }: { children: ReactNode }) {
  const n = contarTarjetas(children);
  const columnas = COLUMNAS_KPI[n] ?? "sm:grid-cols-[repeat(auto-fill,minmax(13rem,1fr))]";
  return <div className={`grid min-w-0 grid-cols-2 gap-2 sm:gap-3 ${columnas} [&>*]:min-w-0`}>{children}</div>;
}
