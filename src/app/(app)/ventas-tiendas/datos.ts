import type { SupabaseClient } from "@supabase/supabase-js";
import { hoyPanama, mesCorto, mesEnCursoPanama, sumarMeses, ultimosMeses } from "@/lib/af4/fecha";
import { cargarResumen, cargarUnidades, type Unidad } from "@/lib/ventas/cargar";
import type { FilaResumen } from "@/lib/ventas/resumen";
import type { Diario, FilaCod, FilaSemana, MesDropi } from "@/lib/ventas/patrones";
import type { OpcionSelector } from "./selector";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { filtrarUnidades, puedeVerUnidad, veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";

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
  /** Ve toda la empresa (sin tiendas limitadas): puede ver la proveeduría (Dropi). */
  veTodo: boolean;
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
    veTodo: veTodaLaEmpresa(permitidas),
    opcionesTienda: [...(permitidas ? [] : [{ valor: TODAS, etiqueta: "Todas" }]), ...tiendas.map((u) => ({ valor: u.id, etiqueta: u.nombre }))],
  };
}

/** Días del patrón de la semana: las últimas 13 semanas hasta ayer. */
export const DIAS_PATRON = 91;

export interface Extras {
  /** Por día, del mes elegido y los tres anteriores (proyección). Null sin la migración 0988. */
  diarios: Diario[] | null;
  semana: { filas: FilaSemana[]; desde: string; hasta: string } | null;
  /** Unidades de producto entregadas por tienda en el mes. */
  unidades: Map<string, number> | null;
  /** El mismo mes del año anterior (comparación de los indicadores). */
  anioAnterior: FilaResumen[];
  /** `fin_tiendas_mensual` del mes (efectivo contra entrega); null sin la migración 0962. */
  cod: FilaCod[] | null;
  /** Dropi del mes; null si no lo ve o falta la migración 0938. */
  dropi: MesDropi[] | null;
}

const num = (v: unknown) => Number(v ?? 0) || 0;

/**
 * Lo que agregan las mejoras 41, 43 y 46 a 49 a la página principal. Cada lectura va por su lado: si falta su migración,
 * esa parte queda vacía y lo demás se ve igual. `ids` = las tiendas que se ven (null = todas).
 */
export async function cargarExtras(
  supabase: SupabaseClient,
  { mes, ids, unidades, veTodo }: { mes: string; ids: string[] | null; unidades: Unidad[]; veTodo: boolean },
): Promise<Extras> {
  const hoy = hoyPanama();
  const ayer = new Date(Date.parse(`${hoy}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const desdeSemana = new Date(Date.parse(`${ayer}T00:00:00Z`) - (DIAS_PATRON - 1) * 86_400_000).toISOString().slice(0, 10);
  const finMes = new Date(Date.parse(`${sumarMeses(mes, 1)}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const pasado = sumarMeses(mes, -12);
  const filtro = ids ?? null;

  const [diarios, semana, uds, anio, cod, dropi] = await Promise.all([
    supabase.rpc("ven_ventas_diarias", { p_desde: sumarMeses(mes, -3), p_hasta: finMes, p_unidades: filtro }),
    supabase.rpc("ven_ventas_semana", { p_desde: desdeSemana, p_hasta: ayer, p_unidades: filtro }),
    supabase.rpc("ven_unidades_mes", { p_desde: mes, p_hasta: mes, p_unidades: filtro }),
    cargarResumen(supabase, pasado, unidades, pasado),
    (() => {
      let q = supabase.from("fin_tiendas_mensual").select("unidad_id, ventas_entregadas, cod_esperado, cod_cobrado, cod_remitido").eq("periodo", mes);
      if (filtro) q = q.in("unidad_id", filtro);
      return q;
    })(),
    veTodo && !ids ? supabase.from("fin_dropi_mensual").select("moneda, pedidos, entregados, ventas_entregadas, ganancias").eq("periodo", mes) : Promise.resolve(null),
  ]);

  return {
    diarios: diarios.error
      ? null
      : ((diarios.data ?? []) as Record<string, unknown>[]).map((d) => ({
          fecha: String(d.fecha).slice(0, 10),
          ordenes: num(d.ordenes),
          ventas: num(d.ventas),
          entregadas: num(d.entregadas),
          canceladas: num(d.canceladas),
        })),
    semana: semana.error
      ? null
      : {
          filas: ((semana.data ?? []) as Record<string, unknown>[]).map((f) => ({
            dia: num(f.dia),
            hora: f.hora === null || f.hora === undefined ? null : num(f.hora),
            ordenes: num(f.ordenes),
            ventas: num(f.ventas),
          })),
          desde: desdeSemana,
          hasta: ayer,
        },
    unidades: uds.error ? null : new Map(((uds.data ?? []) as Record<string, unknown>[]).map((f) => [String(f.unidad_id), num(f.unidades)])),
    anioAnterior: "error" in anio ? [] : anio.filter((r) => !ids || ids.includes(r.unidad_id)),
    cod: cod.error ? null : ((cod.data ?? []) as FilaCod[]),
    dropi: !dropi || dropi.error ? null : ((dropi.data ?? []) as MesDropi[]),
  };
}
