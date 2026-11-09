// Lo que comparten las páginas de Clientes y marketing: los datos (sin datos personales), el período y la tienda elegidos.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarClientes, type DatosClientes, type Tienda } from "@/lib/clientes/cargar";
import { TODAS, curvaAcumulada, gastoPorMesDe, indicadores, type Indicadores } from "@/lib/clientes/metricas";
import type { ComparacionKpi } from "@/components/af4/kpi-af4";
import { hoyPanama, mesCorto, mesEnCursoPanama } from "@/lib/af4/fecha";
import { elegirPeriodoAF4, opcionesPeriodo, periodoAnterior, type OpcionesPeriodo, type PeriodoAF4 } from "@/lib/af4/periodo";
import { calcularVariacion, type Sentido } from "@/lib/af4/variacion";
import { ULTIMOS_3 } from "@/lib/finanzas/rentabilidad";
import type { OpcionSelector } from "../ventas-tiendas/selector";

export { hoyPanama };

/** El período de Clientes y marketing: el mismo patrón que Rentabilidad (últimos 3, 6 o 12 meses cerrados, el año o un mes). */
const PERIODO_CLIENTES: OpcionesPeriodo = { predeterminado: ULTIMOS_3, ultimos: [3, 6, 12], incluirEnCurso: false, conAnio: true };

export interface DatosPagina extends DatosClientes {
  periodo: PeriodoAF4;
  tienda: Tienda | null;
  /** `todas` o el id de la tienda elegida. */
  ambito: string;
  /** Meses con órdenes (todas las tiendas). */
  conDatos: string[];
  nombre: (id: string) => string;
  opcionesPeriodo: ReturnType<typeof opcionesPeriodo>;
  opcionesTienda: OpcionSelector[];
}

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export async function cargarDatosPagina(
  supabase: SupabaseClient,
  params: { [k: string]: string | string[] | undefined },
): Promise<DatosPagina | { error: string }> {
  const datos = await cargarClientes(supabase);
  if ("error" in datos) return datos;
  const mesEnCurso = mesEnCursoPanama();
  const conDatos = [...new Set(datos.resumen.filter((r) => r.ambito === TODAS).map((r) => r.periodo))].sort();
  const periodo = elegirPeriodoAF4(param(params.periodo), conDatos, mesEnCurso, PERIODO_CLIENTES);
  const tienda = datos.tiendas.find((t) => t.id === param(params.tienda)) ?? null;
  const nombres = new Map(datos.tiendas.map((t) => [t.id, t.nombre]));
  return {
    ...datos,
    periodo,
    tienda,
    ambito: tienda?.id ?? TODAS,
    conDatos,
    nombre: (id) => (id === TODAS ? "Todas las tiendas" : (nombres.get(id) ?? "—")),
    opcionesPeriodo: opcionesPeriodo(conDatos, mesEnCurso, { ...PERIODO_CLIENTES, maxMeses: 12 }),
    opcionesTienda: [{ valor: TODAS, etiqueta: "Todas" }, ...datos.tiendas.map((t) => ({ valor: t.id, etiqueta: t.nombre }))],
  };
}

/** Los indicadores de un ámbito en unos meses. */
export function indicadoresDe(datos: DatosClientes, ambito: string, meses: string[]): Indicadores {
  const cohortes = datos.cohortes.filter((c) => c.ambito === ambito);
  const curva = datos.corte ? curvaAcumulada(datos.curva.filter((p) => p.ambito === ambito), cohortes, datos.corte) : [];
  return indicadores(
    datos.resumen.filter((r) => r.ambito === ambito),
    gastoPorMesDe(datos.marketing, ambito),
    cohortes,
    curva,
    meses,
    datos.mesesLibro,
  );
}

/**
 * Las comparaciones de los KPIs contra el período anterior del mismo largo (si hay datos para todo ese período): `vs`
 * en % (o con el sentido que se pida) y `vsPuntos` para tasas (fracciones), en puntos porcentuales.
 */
export function comparador(datos: DatosPagina, ambito: string) {
  const previos = periodoAnterior(datos.periodo, datos.conDatos);
  const previo = previos.length && previos.length === datos.periodo.meses.length ? indicadoresDe(datos, ambito, previos) : null;
  const contra = previos.length === 1 ? mesCorto(previos[0]) : "período anterior";
  const vs = (actual: number | null, antes: (x: Indicadores) => number | null, sentido: Sentido = "mas-es-mejor"): ComparacionKpi[] => {
    const a = previo ? antes(previo) : null;
    return actual !== null && a !== null ? [{ v: calcularVariacion(actual, a, sentido), contra }] : [];
  };
  const vsPuntos = (actual: number | null, antes: (x: Indicadores) => number | null): ComparacionKpi[] => {
    const a = previo ? antes(previo) : null;
    return actual !== null && a !== null ? [{ v: calcularVariacion(actual * 100, a * 100), contra, modo: "puntos" }] : [];
  };
  return { vs, vsPuntos };
}

/** `?periodo=…&tienda=…` sin lo que está en su valor por defecto. */
export function hrefClientes(ruta: string, filtros: { periodo?: string; tienda?: string | null }): string {
  const p = new URLSearchParams();
  if (filtros.periodo && filtros.periodo !== ULTIMOS_3) p.set("periodo", filtros.periodo);
  if (filtros.tienda && filtros.tienda !== TODAS) p.set("tienda", filtros.tienda);
  const q = p.toString();
  return q ? `${ruta}?${q}` : ruta;
}

export interface FilaTiendaMes {
  id: string;
  periodo: string;
  tiendaId: string;
  tienda: string;
  /** El primer mes con órdenes: sus «nuevos» incluyen clientes de antes. */
  primerMes: boolean;
  sinLibro: boolean;
  i: Indicadores;
}

/** Una fila por tienda y mes del período (solo las que tienen órdenes o gasto). */
export function filasTiendaMes(datos: DatosPagina): FilaTiendaMes[] {
  const tiendas = datos.tienda ? [datos.tienda] : datos.tiendas;
  const primero = datos.conDatos[0];
  const filas: FilaTiendaMes[] = [];
  for (const t of tiendas) {
    for (const m of datos.periodo.meses) {
      const i = indicadoresDe(datos, t.id, [m]);
      if (!i.ordenes && !i.gasto) continue;
      filas.push({ id: `${m}|${t.id}`, periodo: m, tiendaId: t.id, tienda: t.nombre, primerMes: m === primero, sinLibro: !datos.mesesLibro.has(m), i });
    }
  }
  return filas.sort((a, b) => a.periodo.localeCompare(b.periodo) || a.tienda.localeCompare(b.tienda));
}
