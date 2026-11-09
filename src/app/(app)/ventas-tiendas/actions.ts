"use server";

import { revalidatePath } from "next/cache";
import { getUsuarioActual, requireModuloEscritura } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { createServiceClient } from "@/lib/supabase/server";
import { enmascararCliente, type ClienteMostrado } from "@/lib/ventas/cliente";
import { cargarBase, cargarResumen, cargarUnidades } from "@/lib/ventas/cargar";
import { filasAEscribir, planBaseReparto, type Decision } from "@/lib/ventas/base-reparto";
import type { EstadoEntrega, MetodoPago } from "@/lib/ventas/matriz";
import { sinAccesoARegistros, sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";

const MODULO = "ventas-tiendas";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PERIODO = /^\d{4}-\d{2}-01$/;

export interface LineaFicha {
  linea: number;
  producto: string;
  cantidad: number;
  costo: number | null;
  fuente: "costo_vigente" | "excel" | "servicio" | "sin_costo";
  costoClave: string | null;
}

export interface OrdenFicha {
  id: string;
  numero: string;
  fecha: string;
  tienda: string;
  estado: EstadoEntrega;
  estadoPago: string | null;
  metodo: MetodoPago | null;
  formaPago: string | null;
  informe: string | null;
  transportista: string | null;
  guia: string | null;
  fechaEnvio: string | null;
  fechaDevolucion: string | null;
  resultado: string | null;
  total: number;
  costoEnvio: number;
  facturado: boolean;
  factura: string | null;
  mesGestion: string | null;
  motivo: string | null;
  etiquetas: string | null;
  origen: string;
  lineas: LineaFicha[];
  /** Enmascarado: el completo solo con `mostrarDatosCliente`. */
  cliente: ClienteMostrado | null;
  puedeVerCliente: boolean;
}

/** La ficha de una orden: sus datos, sus líneas con el costo y los datos de la persona enmascarados. */
export async function obtenerOrden(id: string): Promise<{ error: string } | OrdenFicha> {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes(MODULO)) return { error: "No tienes acceso a Ventas por tienda." };
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Orden inválida." };
  const supabase = createServiceClient();
  const acceso = await sinAccesoARegistros(supabase, "ven_ordenes", [id]);
  if (acceso) return { error: acceso };
  const [o, l, c] = await Promise.all([
    supabase.from("ven_ordenes").select("*, fin_unidades(nombre)").eq("id", id).maybeSingle(),
    supabase.from("ven_lineas_costo").select("linea, producto, cantidad, costo, costo_fuente, costo_clave").eq("orden_id", id).order("linea"),
    supabase.from("ven_ordenes_clientes").select("nombre, telefono, direccion, corregimiento, notas").eq("orden_id", id).maybeSingle(),
  ]);
  if (o.error || !o.data) return { error: o.error?.message ?? "No encontré la orden." };
  const d = o.data as Record<string, unknown>;
  const unidad = d.fin_unidades as { nombre: string } | { nombre: string }[] | null;
  const tienda = Array.isArray(unidad) ? unidad[0]?.nombre : unidad?.nombre;
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
  return {
    id,
    numero: String(d.numero),
    fecha: String(d.fecha),
    tienda: tienda ?? "—",
    estado: d.estado_entrega as EstadoEntrega,
    estadoPago: s(d.estado_pago),
    metodo: (d.metodo_pago as MetodoPago | null) ?? null,
    formaPago: s(d.forma_pago_texto),
    informe: s(d.informe_servientrega),
    transportista: s(d.transportista),
    guia: s(d.guia),
    fechaEnvio: s(d.fecha_envio),
    fechaDevolucion: s(d.fecha_devolucion),
    resultado: s(d.resultado_courier),
    total: n(d.total),
    costoEnvio: n(d.costo_envio),
    facturado: d.facturado === true,
    factura: s(d.factura_numero),
    mesGestion: s(d.mes_gestion),
    motivo: s(d.motivo_cancelacion),
    etiquetas: s(d.etiquetas),
    origen: String(d.origen ?? ""),
    lineas: ((l.data ?? []) as Record<string, unknown>[]).map((x) => ({
      linea: n(x.linea),
      producto: String(x.producto),
      cantidad: n(x.cantidad),
      costo: x.costo === null || x.costo === undefined ? null : n(x.costo),
      fuente: (x.costo_fuente as LineaFicha["fuente"]) ?? "sin_costo",
      costoClave: s(x.costo_clave),
    })),
    cliente: c.data ? enmascararCliente(c.data as Parameters<typeof enmascararCliente>[0]) : null,
    puedeVerCliente: !usuario.modulosSoloLectura.includes(MODULO),
  };
}

/** Los datos completos de la persona de una orden. Pide poder modificar Ventas por tienda y queda en la auditoría. */
export async function mostrarDatosCliente(id: string): Promise<{ error: string } | { cliente: ClienteMostrado }> {
  try {
    await requireModuloEscritura(MODULO);
    if (typeof id !== "string" || !UUID.test(id)) return { error: "Orden inválida." };
    const supabase = createServiceClient();
    const acceso = await sinAccesoARegistros(supabase, "ven_ordenes", [id]);
    if (acceso) return { error: acceso };
    const [o, c] = await Promise.all([
      supabase.from("ven_ordenes").select("numero").eq("id", id).maybeSingle(),
      supabase.from("ven_ordenes_clientes").select("nombre, telefono, direccion, corregimiento, notas").eq("orden_id", id).maybeSingle(),
    ]);
    if (o.error || !o.data) return { error: "No encontré la orden." };
    if (c.error || !c.data) return { error: "Esta orden no tiene datos de la persona." };
    await registrarAuditoria({
      accion: "ver_cliente_venta",
      entidad: "ven_ordenes",
      entidadId: id,
      detalle: `Vio los datos de la persona de la orden ${o.data.numero}`,
    });
    const v = (x: unknown) => (typeof x === "string" ? x : "");
    return { cliente: { nombre: v(c.data.nombre), telefono: v(c.data.telefono), direccion: v(c.data.direccion), corregimiento: v(c.data.corregimiento), notas: v(c.data.notas) } };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudieron leer los datos." };
  }
}

export interface ResultadoBase {
  escritas: number;
  porDecision: Partial<Record<Decision, number>>;
}

/**
 * «Actualizar base de reparto»: escribe en `fin_base_distribucion` las órdenes y entregadas de cada tienda y mes (origen
 * «ventas»). Nunca pisa lo cargado a mano; lo que vino del libro de Excel y los meses sin la base de ECOMFIVE solo con
 * las opciones. `meses` limita a esos meses (vacío = todos).
 */
export async function actualizarBaseReparto(opciones: {
  reemplazarExcel?: boolean;
  incluirIncompletos?: boolean;
  meses?: string[];
}): Promise<{ error: string } | ResultadoBase> {
  try {
    await requireModuloEscritura(MODULO);
    // La base alimenta el EERR: escribirla también pide poder modificar el Libro de movimientos.
    await requireModuloEscritura("libro-movimientos");
    // La base de reparto es de toda la empresa (reparte lo común entre todas las tiendas).
    const acceso = await sinAccesoTodaLaEmpresa();
    if (acceso) return { error: acceso };
    const supabase = createServiceClient();
    const unidades = await cargarUnidades(supabase);
    if ("error" in unidades) return { error: unidades.error };
    const desde = "2000-01-01";
    const [ventas, base] = await Promise.all([cargarResumen(supabase, desde, unidades), cargarBase(supabase, desde)]);
    if ("error" in ventas) return { error: "Falta la migración 0909 (ventas por tienda)." };
    const meses = new Set((Array.isArray(opciones?.meses) ? opciones.meses : []).filter((m) => typeof m === "string" && PERIODO.test(m)).slice(0, 60));
    const conVentas = new Set(ventas.map((v) => v.unidad_id));
    const otras = unidades.filter((u) => u.clase === "tienda" && u.recibe_reparto && !conVentas.has(u.id)).map((u) => u.id);
    const plan = planBaseReparto(
      meses.size ? ventas.filter((v) => meses.has(v.periodo)) : ventas,
      base,
      otras,
      { reemplazarExcel: opciones?.reemplazarExcel === true, incluirIncompletos: opciones?.incluirIncompletos === true },
    );
    const filas = filasAEscribir(plan);
    if (filas.length) {
      const ahora = new Date().toISOString();
      const { error } = await supabase
        .from("fin_base_distribucion")
        .upsert(filas.map((f) => ({ ...f, actualizado_en: ahora })), { onConflict: "periodo,unidad_id" });
      if (error) return { error: error.message };
    }
    const porDecision: Partial<Record<Decision, number>> = {};
    for (const p of plan) porDecision[p.decision] = (porDecision[p.decision] ?? 0) + 1;
    const nombre = new Map(unidades.map((u) => [u.id, u.nombre]));
    await registrarAuditoria({
      accion: "actualizar_base_reparto",
      entidad: "fin_base_distribucion",
      detalle: filas.length
        ? `${filas.length} filas desde Ventas por tienda: ${filas
            .slice(0, 20)
            .map((f) => `${nombre.get(f.unidad_id) ?? "?"} ${f.periodo.slice(0, 7)} = ${f.envios}`)
            .join(", ")}${filas.length > 20 ? "…" : ""}`
        : "Sin cambios: la base ya estaba al día o se conservó la del Excel / la cargada a mano",
    });
    revalidatePath("/ventas-tiendas", "layout");
    revalidatePath("/estado-resultados");
    return { escritas: filas.length, porDecision };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo actualizar la base." };
  }
}
