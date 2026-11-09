// Lo que comparten las páginas de Rentabilidad: la ventana, el período y la tienda elegidos y las cascadas.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cargarRentabilidad } from "@/lib/finanzas/cargar-rentabilidad";
import { contextoEntidad } from "@/lib/finanzas/contexto-entidad";
import { CONSOLIDADO, type VistaEntidad } from "@/lib/finanzas/entidades";
import type { UnidadEerr } from "@/lib/finanzas/cargar-eerr";
import { hoyPanama, ultimosMeses } from "@/lib/af4/fecha";
import { elegirPeriodoAF4, opcionesPeriodo, type OpcionesPeriodo, type PeriodoAF4 } from "@/lib/af4/periodo";
import { ULTIMOS_3, cascadas, type Cascada, type LibroMes, type VentasMes } from "@/lib/finanzas/rentabilidad";
import type { OpcionSelector } from "../ventas-tiendas/selector";

export const TODAS = "todas";

export { hoyPanama };

/** Rentabilidad mira meses cerrados: los últimos 3 por defecto, 6, 12, el año a la fecha o un mes. */
export const PERIODO_RENTABILIDAD: OpcionesPeriodo = { predeterminado: ULTIMOS_3, ultimos: [3, 6, 12], incluirEnCurso: false, conAnio: true };

export interface DatosPagina {
  unidades: UnidadEerr[];
  libro: LibroMes[];
  ventas: VentasMes[];
  deTerceros: string[];
  sinVentas: boolean;
  /** Los 13 meses leídos (12 cerrados + el mes en curso). */
  ventana: string[];
  mesEnCurso: string;
  periodo: PeriodoAF4;
  /** Los meses con datos (libro o ventas), para el período anterior comparable. */
  conDatos: string[];
  tienda: UnidadEerr | null;
  /** Cascadas del período: por tienda (todas o la elegida), por mes y por tienda y mes. */
  porTienda: Map<string, Cascada>;
  porMes: Map<string, Cascada>;
  porTiendaMes: Map<string, Cascada>;
  nombre: (id: string) => string;
  /** Los accesos rápidos y los meses sueltos del período (`ControlPeriodo`). */
  opcionesPeriodo: ReturnType<typeof opcionesPeriodo>;
  opcionesTienda: OpcionSelector[];
  /** La entidad que se ve (migración 0923); siempre en dólares. */
  vista: VistaEntidad;
  opcionesEntidad: OpcionSelector[];
  /** `?entidad=…` para que los demás enlaces la conserven (vacío sin entidades). */
  vistaQuery: Record<string, string>;
  /** La persona tiene tiendas limitadas (mejora 99): «Todas» son solo las suyas. */
  limitado: boolean;
}

import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export async function cargarDatosPagina(
  supabase: SupabaseClient,
  params: { [k: string]: string | string[] | undefined },
): Promise<DatosPagina | { error: string }> {
  const hoy = hoyPanama();
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;
  const ventana = ultimosMeses(hoy, 13);
  const [cargadosTodos, ctx, permitidas] = await Promise.all([cargarRentabilidad(supabase, ventana), contextoEntidad(supabase, params), cargarTiendasPermitidas()]);
  if ("error" in cargadosTodos) return cargadosTodos;
  // Permisos por tienda (mejora 99): solo las tiendas que la persona puede ver.
  const cargados = permitidas
    ? {
        ...cargadosTodos,
        unidades: cargadosTodos.unidades.filter((u) => puedeVerUnidad(permitidas, u.id)),
        libro: cargadosTodos.libro.filter((l) => puedeVerUnidad(permitidas, l.unidad_id)),
        ventas: cargadosTodos.ventas.filter((v) => puedeVerUnidad(permitidas, v.unidad_id)),
        deTerceros: cargadosTodos.deTerceros.filter((id) => puedeVerUnidad(permitidas, id)),
      }
    : cargadosTodos;
  // Una entidad: solo sus tiendas (A DISTRIBUIR ya viene repartido dentro de cada entidad). En dólares.
  const vista: VistaEntidad = { ...ctx.vista, moneda: "USD", local: false };
  const deLaEntidad = new Set(cargados.unidades.filter((u) => !vista.entidad || u.entidad_id === vista.entidad.id).map((u) => u.id));
  const datos = vista.entidad
    ? {
        ...cargados,
        unidades: cargados.unidades.filter((u) => deLaEntidad.has(u.id)),
        libro: cargados.libro.filter((l) => deLaEntidad.has(l.unidad_id)),
        ventas: cargados.ventas.filter((v) => deLaEntidad.has(v.unidad_id)),
        deTerceros: cargados.deTerceros.filter((id) => deLaEntidad.has(id)),
      }
    : cargados;
  const vistaQuery: Record<string, string> = ctx.opciones.length ? { entidad: vista.entidad?.codigo ?? CONSOLIDADO } : {};
  const conDatos = [...new Set([...datos.libro.map((l) => l.periodo), ...datos.ventas.map((v) => v.periodo)])].sort();
  const periodo = elegirPeriodoAF4(param(params.periodo), conDatos, mesEnCurso, PERIODO_RENTABILIDAD);

  const conMovimiento = new Set([...datos.libro, ...datos.ventas].map((x) => x.unidad_id));
  const elegibles = datos.unidades.filter((u) => conMovimiento.has(u.id));
  const tienda = elegibles.find((u) => u.id === param(params.tienda)) ?? null;
  const { porTienda, porMes, porTiendaMes } = cascadas(
    datos.ventas,
    datos.libro,
    periodo.meses,
    tienda ? [tienda.id] : elegibles.map((u) => u.id),
  );
  // Fuera las unidades que en el período no tienen nada.
  for (const [id, c] of porTienda) if (!c.ventas.valor && !c.administracion && !c.marketing && !c.ordenes) porTienda.delete(id);

  const nombres = new Map(datos.unidades.map((u) => [u.id, u.nombre]));
  return {
    ...datos,
    ventana,
    mesEnCurso,
    periodo,
    conDatos,
    tienda,
    porTienda,
    porMes,
    porTiendaMes,
    nombre: (id) => nombres.get(id) ?? "—",
    vista,
    opcionesEntidad: ctx.opciones,
    vistaQuery,
    limitado: permitidas !== null,
    opcionesPeriodo: opcionesPeriodo(conDatos, mesEnCurso, { ...PERIODO_RENTABILIDAD, maxMeses: 13 }),
    opcionesTienda: [{ valor: TODAS, etiqueta: "Todas" }, ...elegibles.map((u) => ({ valor: u.id, etiqueta: u.nombre }))],
  };
}

/**
 * `?periodo=…&tienda=…` sin el período por defecto (y la entidad, si se pasa `vista`). La tienda va si se pasa, también
 * «todas»: sin ella la página arranca con la tienda global de la barra de arriba.
 */
export function hrefRentabilidad(ruta: string, filtros: { periodo?: string; tienda?: string | null; vista?: Record<string, string> }): string {
  const p = new URLSearchParams(filtros.vista ?? {});
  if (filtros.periodo && filtros.periodo !== ULTIMOS_3) p.set("periodo", filtros.periodo);
  if (filtros.tienda) p.set("tienda", filtros.tienda);
  const q = p.toString();
  return q ? `${ruta}?${q}` : ruta;
}
