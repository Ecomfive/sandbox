// Lectura de Deliverys desde Supabase (migración 0911). La comparten las páginas, las acciones y la ficha de un cierre.
// Solo lectura; los permisos los decide quien llama. El documento sale enmascarado: el completo solo lo piden la ficha
// del repartidor y el recibo.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "../supabase/paginar";
import { SIN_MIGRACION } from "./guardar";
import {
  cierreDeTotales,
  liquidar,
  redondear,
  type Categoria,
  type EstadoEntrega,
  type LineaLiquidacion,
  type MetodoCobro,
  type TotalTienda,
} from "./liquidacion";
import { enmascararDocumento } from "./repartidor";

export type EstadoCierre = "abierto" | "cerrado" | "pagado";

export const ETIQUETA_ESTADO_CIERRE: Record<EstadoCierre, string> = { abierto: "Abierto", cerrado: "Cerrado", pagado: "Pagado" };

export interface FilaCierre {
  /** `<repartidor>|<semana>`: existe aunque el cierre todavía no tenga fila. */
  id: string;
  cierreId: string | null;
  repartidorId: string;
  repartidor: string;
  /** Enmascarado. */
  documento: string;
  semana: string;
  estado: EstadoCierre;
  enRuta: number;
  entregas: number;
  fallidas: number;
  devueltas: number;
  reprogramadas: number;
  tasaEntrega: number | null;
  tarifas: number;
  propinas: number;
  aparte: number;
  cobradoEfectivo: number;
  adelantos: number;
  descuentos: number;
  aPagar: number;
  neto: number;
  fechaPago: string | null;
  enLibro: boolean;
  reciboNumero: number | null;
}

interface FilaVista {
  repartidor_id: string;
  semana: string;
  en_ruta: number;
  entregas: number;
  fallidas: number;
  devueltas: number;
  reprogramadas: number;
  tarifas: number | string;
  propinas: number | string;
  aparte: number | string;
  cobrado_efectivo: number | string;
}

interface FilaCierreBase {
  id: string;
  repartidor_id: string;
  semana: string;
  estado: EstadoCierre;
  adelantos: number | string;
  descuentos: number | string;
  en_ruta: number | null;
  entregas: number | null;
  fallidas: number | null;
  devueltas: number | null;
  reprogramadas: number | null;
  tarifas: number | string | null;
  propinas: number | string | null;
  aparte: number | string | null;
  cobrado_efectivo: number | string | null;
  a_pagar: number | string | null;
  neto: number | string | null;
  fecha_pago: string | null;
  en_libro: boolean;
}

const COLUMNAS_CIERRE =
  "id, repartidor_id, semana, estado, adelantos, descuentos, en_ruta, entregas, fallidas, devueltas, reprogramadas, tarifas, propinas, aparte, cobrado_efectivo, a_pagar, neto, fecha_pago, en_libro";

const n = (v: number | string | null | undefined) => Number(v ?? 0);
const dia = (v: string) => String(v).slice(0, 10);

/** Une la suma de la vista con el cierre guardado: abierto se calcula con los ajustes; cerrado o pagado, lo que quedó. */
export function armarFila(
  repartidor: { id: string; nombre: string; documento: string | null },
  semana: string,
  vista: FilaVista | undefined,
  cierre: FilaCierreBase | undefined,
  reciboNumero: number | null,
): FilaCierre {
  const ajustes = { adelantos: n(cierre?.adelantos), descuentos: n(cierre?.descuentos) };
  const fijo = cierre && cierre.estado !== "abierto";
  const t = fijo
    ? {
        enRuta: n(cierre.en_ruta),
        entregas: n(cierre.entregas),
        fallidas: n(cierre.fallidas),
        devueltas: n(cierre.devueltas),
        reprogramadas: n(cierre.reprogramadas),
        tarifas: n(cierre.tarifas),
        propinas: n(cierre.propinas),
        aparte: n(cierre.aparte),
        cobradoEfectivo: n(cierre.cobrado_efectivo),
      }
    : {
        enRuta: n(vista?.en_ruta),
        entregas: n(vista?.entregas),
        fallidas: n(vista?.fallidas),
        devueltas: n(vista?.devueltas),
        reprogramadas: n(vista?.reprogramadas),
        tarifas: n(vista?.tarifas),
        propinas: n(vista?.propinas),
        aparte: n(vista?.aparte),
        cobradoEfectivo: n(vista?.cobrado_efectivo),
      };
  const c = cierreDeTotales(t, ajustes);
  return {
    id: `${repartidor.id}|${semana}`,
    cierreId: cierre?.id ?? null,
    repartidorId: repartidor.id,
    repartidor: repartidor.nombre,
    documento: enmascararDocumento(repartidor.documento),
    semana,
    estado: cierre?.estado ?? "abierto",
    ...c,
    // Lo guardado al cerrar manda (por si las fórmulas cambian después).
    aPagar: fijo ? n(cierre.a_pagar) : c.aPagar,
    neto: fijo ? n(cierre.neto) : c.neto,
    fechaPago: cierre?.fecha_pago ? dia(cierre.fecha_pago) : null,
    enLibro: cierre?.en_libro === true,
    reciboNumero,
  };
}

/** Los cierres (calculados o guardados) de una semana, o de todas. */
export async function cargarCierres(supabase: SupabaseClient, semana?: string): Promise<{ error: string } | { filas: FilaCierre[]; semanas: string[] }> {
  const [vista, cierres, repartidores, recibos, semanas] = await Promise.all([
    traerTodasConError<FilaVista>((d, h) => {
      const q = supabase.from("del_semanas").select("repartidor_id, semana, en_ruta, entregas, fallidas, devueltas, reprogramadas, tarifas, propinas, aparte, cobrado_efectivo");
      return (semana ? q.eq("semana", semana) : q).order("semana").order("repartidor_id").range(d, h);
    }),
    traerTodasConError<FilaCierreBase>((d, h) => {
      const q = supabase.from("del_cierres").select(COLUMNAS_CIERRE);
      return (semana ? q.eq("semana", semana) : q).order("semana").order("id").range(d, h);
    }),
    supabase.from("del_repartidores").select("id, nombre, documento"),
    traerTodasConError<{ cierre_id: string; numero: number }>((d, h) => supabase.from("del_recibos").select("cierre_id, numero").order("numero").range(d, h)),
    semanasDisponibles(supabase),
  ]);
  if (vista.error || cierres.error || repartidores.error || recibos.error || "error" in semanas) return { error: SIN_MIGRACION };
  const personas = new Map((repartidores.data ?? []).map((r) => [r.id as string, r as { id: string; nombre: string; documento: string | null }]));
  const porClave = new Map<string, { vista?: FilaVista; cierre?: FilaCierreBase }>();
  for (const v of vista.data ?? []) porClave.set(`${v.repartidor_id}|${dia(v.semana)}`, { vista: v });
  for (const c of cierres.data ?? []) {
    const k = `${c.repartidor_id}|${dia(c.semana)}`;
    porClave.set(k, { ...porClave.get(k), cierre: c });
  }
  const recibo = new Map((recibos.data ?? []).map((r) => [r.cierre_id, r.numero]));
  const filas: FilaCierre[] = [];
  for (const [k, x] of porClave) {
    const [rid, s] = k.split("|");
    const p = personas.get(rid);
    if (!p) continue;
    filas.push(armarFila(p, s, x.vista, x.cierre, x.cierre ? (recibo.get(x.cierre.id) ?? null) : null));
  }
  filas.sort((a, b) => b.semana.localeCompare(a.semana) || a.repartidor.localeCompare(b.repartidor));
  return { filas, semanas: semanas.semanas };
}

/** Las semanas con entregas o con cierres, de la más vieja a la más nueva. */
export async function semanasDisponibles(supabase: SupabaseClient): Promise<{ error: string } | { semanas: string[] }> {
  const [v, c] = await Promise.all([
    traerTodasConError<{ semana: string }>((d, h) => supabase.from("del_semanas").select("semana").order("semana").range(d, h)),
    traerTodasConError<{ semana: string }>((d, h) => supabase.from("del_cierres").select("semana").order("semana").range(d, h)),
  ]);
  if (v.error || c.error) return { error: SIN_MIGRACION };
  return { semanas: [...new Set([...(v.data ?? []), ...(c.data ?? [])].map((x) => dia(x.semana)))].sort() };
}

// ---------------------------------------------------------------------------------------------
// Entregas
// ---------------------------------------------------------------------------------------------

export interface FilaEntrega {
  id: string;
  fecha: string;
  semana: string;
  repartidorId: string;
  repartidor: string;
  zona: string | null;
  tienda: string;
  pagoAparte: boolean;
  orden: string | null;
  categoria: Categoria | null;
  estado: EstadoEntrega;
  cantidad: number;
  tarifa: number;
  monto: number;
  montoCobrar: number | null;
  cobrado: number | null;
  metodo: MetodoCobro | null;
  origen: string;
  enCierre: boolean;
}

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Las entregas de una semana (o de un repartidor en esa semana). */
export async function cargarEntregas(
  supabase: SupabaseClient,
  semana: string,
  repartidorId?: string,
): Promise<{ error: string } | { filas: FilaEntrega[] }> {
  const [r, tiendas] = await Promise.all([
    traerTodasConError<Record<string, unknown>>((d, h) => {
      let q = supabase
        .from("del_entregas")
        .select("id, fecha, semana, repartidor_id, zona, unidad_id, orden, categoria, estado, cantidad, tarifa, monto, monto_cobrar, cobrado, metodo_cobro, origen, cierre_id, del_repartidores(nombre), fin_unidades(nombre)")
        .eq("semana", semana);
      if (repartidorId) q = q.eq("repartidor_id", repartidorId);
      return q.order("fecha").order("id").range(d, h);
    }),
    supabase.from("del_tiendas").select("unidad_id, pago_aparte"),
  ]);
  if (r.error || tiendas.error) return { error: SIN_MIGRACION };
  const aparte = new Set((tiendas.data ?? []).filter((t) => t.pago_aparte).map((t) => t.unidad_id as string));
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  return {
    filas: (r.data ?? []).map((x) => ({
      id: x.id as string,
      fecha: dia(x.fecha as string),
      semana: dia(x.semana as string),
      repartidorId: x.repartidor_id as string,
      repartidor: uno(x.del_repartidores as Uno<{ nombre: string }>)?.nombre ?? "—",
      zona: (x.zona as string | null) ?? null,
      tienda: uno(x.fin_unidades as Uno<{ nombre: string }>)?.nombre ?? "—",
      pagoAparte: aparte.has(x.unidad_id as string),
      orden: (x.orden as string | null) ?? null,
      categoria: (x.categoria as Categoria | null) ?? null,
      estado: x.estado as EstadoEntrega,
      cantidad: Number(x.cantidad),
      tarifa: Number(x.tarifa),
      monto: Number(x.monto),
      montoCobrar: num(x.monto_cobrar),
      cobrado: num(x.cobrado),
      metodo: (x.metodo_cobro as MetodoCobro | null) ?? null,
      origen: x.origen as string,
      enCierre: x.cierre_id !== null,
    })),
  };
}

export const aLineas = (filas: FilaEntrega[]): LineaLiquidacion[] =>
  filas.map((f) => ({
    estado: f.estado,
    categoria: f.categoria,
    cantidad: f.cantidad,
    tarifa: f.tarifa,
    tienda: f.tienda,
    pagoAparte: f.pagoAparte,
    cobrado: f.cobrado,
    metodo: f.metodo,
  }));

export interface DiaCierre {
  fecha: string;
  entregas: number;
  fallidas: number;
  devueltas: number;
  monto: number;
}

/** Lo de cada día de la semana (para la ficha del cierre). */
export function porDia(filas: FilaEntrega[]): DiaCierre[] {
  const m = new Map<string, DiaCierre>();
  for (const f of filas) {
    const d = m.get(f.fecha) ?? m.set(f.fecha, { fecha: f.fecha, entregas: 0, fallidas: 0, devueltas: 0, monto: 0 }).get(f.fecha)!;
    if (f.categoria !== "propina") {
      if (f.estado === "entregado") d.entregas += f.cantidad;
      else if (f.estado === "fallido") d.fallidas += f.cantidad;
      else d.devueltas += f.cantidad;
    }
    d.monto = redondear(d.monto + f.monto);
  }
  return [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** Los totales por tienda: los guardados si el cierre ya está cerrado, si no los de sus líneas. */
export function porTiendaDe(detalle: unknown, filas: FilaEntrega[]): TotalTienda[] {
  if (Array.isArray(detalle)) return detalle as TotalTienda[];
  return liquidar(aLineas(filas)).porTienda;
}

export { COLUMNAS_CIERRE, type FilaCierreBase, type FilaVista };
