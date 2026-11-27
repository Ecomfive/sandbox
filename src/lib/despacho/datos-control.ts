// Envíos Delivery › Cierres y Control de envíos, y «Mis pagos» del delivery (25 nov 2026, migración 0366): lo que leen de la base. Las filas son las
// mismas del tablero (`mon_despachos`, ciudad, sin archivar ni repetidas); las cuentas salen de `control-envios.ts`. Solo servidor; quien llama ya
// revisó el permiso (módulo Envíos Delivery con todas las tiendas, o la cuenta del delivery).

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { sinDuplicados } from "./etiquetas";
import { aFila, COLUMNAS_DESPACHO, tableroConsolidado, type FilaTablero } from "./datos";
import {
  ajustesGuardados,
  finSemanaPago,
  resumenSemana,
  TARIFAS_BASE,
  type Ajuste,
  type DeliveryControl,
  type FilaEnvio,
  type FormaPagoRecibo,
  type ResumenDelivery,
} from "./control-envios";
import { nombreRepartidor } from "./panel-repartidor";

export const BUCKET_RECIBOS = "despacho-recibos";

export interface Delivery extends DeliveryControl {
  nombreCompleto: string | null;
  cedula: string | null;
  formaPago: FormaPagoRecibo;
  activo: boolean;
}

export type EstadoSemana = "abierta" | "enviada" | "firmada";

export interface SemanaGuardada {
  id: string;
  deliveryId: string;
  semana: string;
  estado: EstadoSemana;
  ajustes: Ajuste[];
  nota: string | null;
  /** Lo que se le mandó al delivery al cerrar la semana (queda fijo aunque después cambie un pedido). */
  detalle: ResumenDelivery | null;
  totalOceans: number | null;
  totalClicksi: number | null;
  fechaPago: string | null;
  enviadaEn: string | null;
  firmadaEn: string | null;
  pdfRuta: string | null;
  codigo: string | null;
  anulados: { firmadaEn: string; pdfRuta: string; anuladaEn: string; por: string }[];
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function aDelivery(d: Record<string, unknown>): Delivery {
  return {
    id: d.id as string,
    nombre: d.nombre as string,
    couriers: (d.couriers as string[] | null) ?? [],
    tarifas: { entrega: num(d.tarifa_entrega) ?? TARIFAS_BASE.entrega, cambio: num(d.tarifa_cambio) ?? TARIFAS_BASE.cambio },
    nombreCompleto: (d.nombre_completo as string | null) ?? null,
    cedula: (d.cedula as string | null) ?? null,
    formaPago: (d.forma_pago as FormaPagoRecibo) ?? "transferencia",
    activo: d.activo !== false,
  };
}

export function aSemana(s: Record<string, unknown>): SemanaGuardada {
  return {
    id: s.id as string,
    deliveryId: s.delivery_id as string,
    semana: s.semana as string,
    estado: s.estado as EstadoSemana,
    ajustes: ajustesGuardados(s.ajustes),
    nota: (s.nota as string | null) ?? null,
    detalle: (s.detalle as ResumenDelivery | null) ?? null,
    totalOceans: num(s.total_oceans),
    totalClicksi: num(s.total_clicksi),
    fechaPago: (s.fecha_pago as string | null) ?? null,
    enviadaEn: (s.enviada_en as string | null) ?? null,
    firmadaEn: (s.firmada_en as string | null) ?? null,
    pdfRuta: (s.pdf_ruta as string | null) ?? null,
    codigo: (s.codigo as string | null) ?? null,
    anulados: Array.isArray(s.anulados) ? (s.anulados as SemanaGuardada["anulados"]) : [],
  };
}

export const COLUMNAS_DELIVERY = "id, nombre, nombre_completo, cedula, forma_pago, couriers, activo, tarifa_entrega, tarifa_cambio";
export const COLUMNAS_SEMANA =
  "id, delivery_id, semana, estado, ajustes, nota, detalle, total_oceans, total_clicksi, fecha_pago, enviada_en, firmada_en, pdf_ruta, codigo, anulados";

/** Los deliverys registrados (activos e inactivos); null sin la migración 0366. */
export async function cargarDeliverys(supabase: SupabaseClient): Promise<Delivery[] | null> {
  const { data, error } = await supabase.from("despacho_deliverys").select(COLUMNAS_DELIVERY).order("nombre");
  if (error) return null;
  return (data ?? []).map((d) => aDelivery(d as Record<string, unknown>));
}

/** Los repartos de ciudad de `desde` a `hasta` (sin archivar, sin repetir el pedido que está en dos tableros). */
export async function cargarFilasRango(supabase: SupabaseClient, desde: string, hasta: string): Promise<FilaTablero[]> {
  const crudas = await traerTodasLasFilas<Record<string, unknown>>((d, h) =>
    supabase
      .from("mon_despachos")
      .select(COLUMNAS_DESPACHO)
      .eq("clase", "ciudad")
      .is("archivado_en", null)
      .gte("fecha_despacho", desde)
      .lte("fecha_despacho", hasta)
      .order("item_id")
      .range(d, h),
  );
  return sinDuplicados(
    crudas.map((r) => aFila(r, "ciudad")),
    await tableroConsolidado(supabase),
  );
}

export const aFilaEnvio = (f: FilaTablero): FilaEnvio => ({ courier: f.courier, tienda: f.tienda, estado: f.estado, formaPago: f.formaPago, comprobantes: f.comprobantes, dia: f.dia ?? "" });

/** Las semanas guardadas de un jueves, por delivery. */
export async function cargarSemanas(supabase: SupabaseClient, jueves: string): Promise<Map<string, SemanaGuardada>> {
  const { data } = await supabase.from("despacho_semanas").select(COLUMNAS_SEMANA).eq("semana", jueves);
  return new Map((data ?? []).map((s) => [s.delivery_id as string, aSemana(s as Record<string, unknown>)]));
}

export interface ControlSemana {
  jueves: string;
  deliverys: Delivery[];
  resumenes: ResumenDelivery[];
  semanas: Map<string, SemanaGuardada>;
}

/**
 * El control de una semana: el cálculo con los pedidos de hoy y las propinas y ajustes guardados. Para una semana ya enviada o firmada, el renglón es
 * lo que se le mandó (queda fijo). Los deliverys inactivos solo salen si tienen pedidos.
 */
export async function cargarControl(supabase: SupabaseClient, jueves: string): Promise<ControlSemana | null> {
  const deliverys = await cargarDeliverys(supabase);
  if (!deliverys) return null;
  const [filas, semanas] = await Promise.all([cargarFilasRango(supabase, jueves, finSemanaPago(jueves)), cargarSemanas(supabase, jueves)]);
  const enFilas = new Set(filas.map((f) => nombreRepartidor(f.courier)));
  const visibles = deliverys.filter((d) => d.activo || d.couriers.some((c) => enFilas.has(nombreRepartidor(c))));
  const vivos = resumenSemana(filas.map(aFilaEnvio), visibles, (id) => semanas.get(id)?.ajustes ?? []);
  const resumenes = vivos.map((r) => {
    const s = r.deliveryId ? semanas.get(r.deliveryId) : undefined;
    return s && s.estado !== "abierta" && s.detalle ? { ...s.detalle, prueba: r.prueba } : r;
  });
  return { jueves, deliverys, resumenes, semanas };
}

/** El delivery de una cuenta del panel (por su nombre en Envíos Delivery); null si no está registrado o sin la migración 0366. */
export async function deliveryDeCourier(supabase: SupabaseClient, courier: string): Promise<Delivery | null> {
  const deliverys = await cargarDeliverys(supabase);
  const clave = nombreRepartidor(courier);
  return deliverys?.find((d) => d.couriers.some((c) => nombreRepartidor(c) === clave)) ?? null;
}

/** La semana en curso de un delivery (lo que lleva, en vivo, con lo anotado), con sus pedidos de los días que ya pasaron. */
export async function resumenEnVivo(supabase: SupabaseClient, d: Delivery, jueves: string, ajustes: Ajuste[]): Promise<ResumenDelivery> {
  const claves = new Set(d.couriers.map(nombreRepartidor));
  const filas = (await cargarFilasRango(supabase, jueves, finSemanaPago(jueves))).filter((f) => claves.has(nombreRepartidor(f.courier)));
  return resumenSemana(filas.map(aFilaEnvio), [d], () => ajustes).find((r) => r.deliveryId === d.id)!;
}

/** Las semanas que se le mandaron a un delivery (enviadas o firmadas), de la más nueva a la más vieja. */
export async function semanasDelDelivery(supabase: SupabaseClient, deliveryId: string, limite = 12): Promise<SemanaGuardada[]> {
  const { data } = await supabase.from("despacho_semanas").select(COLUMNAS_SEMANA).eq("delivery_id", deliveryId).neq("estado", "abierta").order("semana", { ascending: false }).limit(limite);
  return (data ?? []).map((s) => aSemana(s as Record<string, unknown>));
}

/** Los recibos firmados de un mes (AAAA-MM), de todos los deliverys, para Despacho y Finanzas. */
export async function recibosDelMes(supabase: SupabaseClient, mes: string): Promise<(SemanaGuardada & { delivery: string })[]> {
  const desde = `${mes}-01`;
  const [a, m] = mes.split("-").map(Number);
  const hasta = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const [{ data }, deliverys] = await Promise.all([
    supabase.from("despacho_semanas").select(COLUMNAS_SEMANA).gte("semana", desde).lte("semana", hasta).neq("estado", "abierta").order("semana", { ascending: false }),
    cargarDeliverys(supabase),
  ]);
  const nombres = new Map((deliverys ?? []).map((d) => [d.id, d.nombre]));
  return (data ?? []).map((s) => {
    const sem = aSemana(s as Record<string, unknown>);
    return { ...sem, delivery: nombres.get(sem.deliveryId) ?? "—" };
  });
}
