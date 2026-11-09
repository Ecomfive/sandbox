"use server";

import { getUsuarioActual } from "@/lib/auth";
import { sinAccesoARegistros } from "@/lib/finanzas/acceso-tienda";
import { createServiceClient } from "@/lib/supabase/server";
import type { Fase } from "@/lib/ventas/ciclo";
import type { OrdenPipeline } from "@/lib/ventas/cargar-pipeline";
import { sugerirEnvio, type CargaMensajero, type Sugerencia } from "@/lib/ventas/operacion";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const num = (v: unknown) => Number(v ?? 0) || 0;

export interface PasoOrden {
  orden: OrdenPipeline;
  mensajeros: { id: string; nombre: string }[];
  transportistas: string[];
  sugerencia: Sugerencia | null;
  puedeEscribir: boolean;
}

/** Lo que necesita el «Siguiente paso» de una orden desde la ficha de Órdenes: su fase, con quién enviarla y quién cubre la zona. */
export async function obtenerPasoOrden(id: string): Promise<{ error: string } | { sinCiclo: true; puedeEscribir: boolean } | PasoOrden> {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("ventas-tiendas")) return { error: "No tienes acceso a Ventas por tienda." };
  if (typeof id !== "string" || !UUID.test(id)) return { error: "Orden inválida." };
  const db = createServiceClient();
  const acceso = await sinAccesoARegistros(db, "ven_ordenes", [id]);
  if (acceso) return { error: acceso };
  const puedeEscribir = !usuario.modulosSoloLectura.includes("ventas-tiendas");
  const { data: o, error } = await db
    .from("ven_ordenes")
    .select("id, numero, fecha, unidad_id, fase, total, metodo_pago, cod_esperado, repartidor_id, transportista, guia, motivo_fallo, intentos, creado_en, ven_orden_lineas(linea, producto, cantidad)")
    .eq("id", id)
    .maybeSingle();
  if (error || !o) return { error: error?.message ?? "No encontré la orden." };
  if (!o.fase) return { sinCiclo: true, puedeEscribir };
  const [{ data: u }, { data: cli }, { data: rep }, { data: cob }, { data: ruta }, { data: tr }] = await Promise.all([
    db.from("fin_unidades").select("nombre, pais").eq("id", o.unidad_id).maybeSingle(),
    db.from("ven_ordenes_clientes").select("corregimiento").eq("orden_id", id).maybeSingle(),
    db.from("del_repartidores").select("id, nombre").eq("activo", true).order("nombre"),
    db.from("ven_cobertura").select("zona, repartidor_id, transportista, tarifa, prioridad, pais"),
    db.from("ven_ordenes").select("repartidor_id").eq("fase", "despachada").not("repartidor_id", "is", null).limit(5000),
    db.from("ven_ordenes").select("transportista").not("transportista", "is", null).limit(2000),
  ]);
  const pais = (u?.pais as string | undefined) ?? "PA";
  const mensajeros = ((rep ?? []) as { id: string; nombre: string }[]).map((m) => ({ id: String(m.id), nombre: String(m.nombre) }));
  const enRuta = new Map<string, number>();
  for (const r of (ruta ?? []) as { repartidor_id: string }[]) enRuta.set(r.repartidor_id, (enRuta.get(r.repartidor_id) ?? 0) + 1);
  const carga: CargaMensajero[] = mensajeros.map((m) => ({ repartidorId: m.id, ordenesHoy: enRuta.get(m.id) ?? 0, capacidad: null, tasaEntrega: null, efectivoEnMano: 0, limiteEfectivo: null }));
  const coberturas = ((cob ?? []) as { zona: string; repartidor_id: string | null; transportista: string | null; tarifa: number | string | null; prioridad: number; pais: string }[])
    .filter((c) => c.pais === pais)
    .map((c) => ({ zona: c.zona, repartidorId: c.repartidor_id, transportista: c.transportista, tarifa: c.tarifa === null ? null : num(c.tarifa), prioridad: c.prioridad }));
  const lineas = ((o.ven_orden_lineas as { linea: number; producto: string; cantidad: number | string }[] | null) ?? []).sort((a, b) => a.linea - b.linea);
  const orden: OrdenPipeline = {
    id,
    numero: String(o.numero),
    fecha: String(o.fecha),
    tienda: (u?.nombre as string | undefined) ?? "—",
    unidadId: String(o.unidad_id),
    pais,
    fase: o.fase as Fase,
    total: num(o.total),
    metodo: (o.metodo_pago as string | null) ?? null,
    codEsperado: o.cod_esperado === null || o.cod_esperado === undefined ? null : num(o.cod_esperado),
    productos: lineas.map((x) => `${num(x.cantidad)}× ${x.producto}`).join(" · "),
    repartidorId: (o.repartidor_id as string | null) ?? null,
    transportista: (o.transportista as string | null) ?? null,
    guia: (o.guia as string | null) ?? null,
    motivoFallo: (o.motivo_fallo as string | null) ?? null,
    intentos: num(o.intentos),
    horas: Math.max(0, Math.floor((Date.now() - Date.parse(String(o.creado_en ?? o.fecha))) / 3_600_000)),
  };
  const transportistas = [...new Set([...((tr ?? []) as { transportista: string }[]).map((x) => x.transportista), "Servientrega"])].sort();
  return {
    orden,
    mensajeros,
    transportistas,
    sugerencia: orden.fase === "por_confirmar" || orden.fase === "confirmada" ? sugerirEnvio((cli?.corregimiento as string | undefined) ?? "", coberturas, carga) : null,
    puedeEscribir,
  };
}
