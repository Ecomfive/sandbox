import type { SupabaseClient } from "@supabase/supabase-js";
import { hoyPanama, mesCorto, mesEnCursoPanama, ultimosMeses } from "@/lib/af4/fecha";
import { cargarResumen, cargarUnidades, type Unidad } from "@/lib/ventas/cargar";
import type { FilaResumen } from "@/lib/ventas/resumen";
import type { OpcionSelector } from "./selector";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { filtrarUnidades, puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";

export const TODAS = "todas";
/** Ventana que muestran las páginas: los últimos 12 meses. */
const MESES = 12;


export interface DatosPagina {
  unidades: Unidad[];
  resumen: FilaResumen[];
  meses: string[];
  /** El mes que se ve: el pedido, o el último con órdenes. */
  mes: string;
  /** La tienda que se ve, o null para todas. */
  tienda: Unidad | null;
  opcionesMes: OpcionSelector[];
  opcionesTienda: OpcionSelector[];
}

/** Lo que comparten las páginas de Ventas por tienda: unidades, resumen de la ventana y el mes y la tienda elegidos. */
export async function cargarDatosPagina(
  supabase: SupabaseClient,
  params: { [k: string]: string | string[] | undefined },
): Promise<DatosPagina | { error: string }> {
  const ventana = ultimosMeses(hoyPanama(), MESES);
  const [todas, permitidas] = await Promise.all([cargarUnidades(supabase), cargarTiendasPermitidas()]);
  if ("error" in todas) return todas;
  // Permisos por tienda (mejora 99): solo sus tiendas, y sin «Todas» (se ve una a la vez).
  const unidades = filtrarUnidades(permitidas, todas);
  const resumenTodo = await cargarResumen(supabase, ventana[0], unidades);
  if ("error" in resumenTodo) return resumenTodo;
  const resumen = permitidas ? resumenTodo.filter((r) => puedeVerUnidad(permitidas, r.unidad_id)) : resumenTodo;
  const meses = [...new Set(resumen.map((r) => r.periodo))].sort();
  const pedido = typeof params.mes === "string" ? params.mes : "";
  // Sin pedir un mes, el último cerrado con órdenes (el mes en curso está a medias); el mes en curso se elige igual y sale
  // marcado «parcial».
  const enCurso = mesEnCursoPanama();
  const cerrados = meses.filter((m) => m < enCurso);
  const mes = meses.includes(pedido) ? pedido : (cerrados.at(-1) ?? meses.at(-1) ?? ventana[ventana.length - 1]);
  const conVentas = new Set(resumen.map((r) => r.unidad_id));
  const tiendas = unidades.filter((u) => conVentas.has(u.id));
  const tienda = tiendas.find((u) => u.id === params.tienda) ?? (permitidas ? (tiendas[0] ?? unidades[0] ?? null) : null);
  return {
    unidades,
    resumen,
    meses,
    mes,
    tienda,
    opcionesMes: meses.map((m) => ({ valor: m, etiqueta: m >= enCurso ? `${mesCorto(m)} · parcial` : mesCorto(m) })),
    opcionesTienda: [...(permitidas ? [] : [{ valor: TODAS, etiqueta: "Todas" }]), ...tiendas.map((u) => ({ valor: u.id, etiqueta: u.nombre }))],
  };
}
