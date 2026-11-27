// Panel del repartidor (24 nov 2026): lo que lee su ruta del día de `mon_despachos` (la misma fila de Envíos Delivery), con el cliente, la dirección,
// los productos y la última nota del equipo de cada pedido, y su cierre del día si ya lo envió. Solo servidor: quien llama ya tiene la cuenta
// (`requireRepartidor`); el repartidor se filtra por su nombre en Envíos Delivery, nunca por lo que mande el navegador.

import type { SupabaseClient } from "@supabase/supabase-js";
import { aFila, COLUMNAS_DESPACHO, COLUMNAS_PANEL, tableroConsolidado } from "./datos";
import { sinDuplicados } from "./etiquetas";
import { nombreRepartidor, resumenCierre, seccionDe, tituloTienda, type ResumenCierre, type Seccion } from "./panel-repartidor";
import type { CuentaRepartidor } from "./cuenta-repartidor";
import { enlazarOrden, unidadDeTexto, variantesPedido, type OrdenCandidata } from "@/lib/monday/columnas";
import { zonaDeEtiquetas } from "@/lib/tienda/ordenes-finanzas";
import { unidadDeTienda } from "@/lib/ventas/matriz";

export interface PedidoRuta {
  itemId: string;
  numero: string;
  tienda: string | null;
  tiendaTitulo: string;
  estado: string | null;
  seccion: Seccion;
  formaPago: string | null;
  porCobrar: number | null;
  cobrado: number | null;
  costeEnvio: number | null;
  comprobantes: number;
  comentario: string | null;
  productos: string[];
  /** Del pedido de la tienda (Shopify o la Matriz): nombre, teléfono, dirección, corregimiento y la nota del pedido (indicaciones del cliente o de los asesores). */
  cliente: { nombre: string | null; telefono: string | null; direccion: string | null; corregimiento: string | null; notas: string | null } | null;
  /** «Ciudad» o «Interior», por las etiquetas del pedido. */
  zona: string | null;
  /** La última nota del equipo (atención al cliente) en el pedido. */
  notaEquipo: string | null;
  reprogramadoPara: string | null;
}

export interface CierreGuardado {
  id: string;
  estado: "enviado" | "validado" | "devuelto";
  nota: string | null;
  enviadoEn: string;
  revisadoPor: string | null;
  revisadoEn: string | null;
  depositos: { tienda: string; monto: number; archivo: string | null }[];
}

export interface RutaDelDia {
  dia: string;
  pedidos: PedidoRuta[];
  resumen: ResumenCierre;
  cierre: CierreGuardado | null;
  faltaMigracion: boolean;
}

/** La ruta del repartidor en un día (AAAA-MM-DD): sus filas de Envíos Delivery, sin archivadas ni repetidas (consolidado y su tablero). */
export async function cargarRuta(supabase: SupabaseClient, cuenta: CuentaRepartidor, dia: string): Promise<RutaDelDia> {
  const { data, error } = await supabase
    .from("mon_despachos")
    .select(`${COLUMNAS_DESPACHO}${COLUMNAS_PANEL}, reprogramado_para`)
    .eq("clase", "ciudad")
    .is("archivado_en", null)
    .eq("fecha_despacho", dia)
    .limit(2000);
  if (error) return { dia, pedidos: [], resumen: resumenCierre([]), cierre: null, faltaMigracion: true };
  const crudas = ((data ?? []) as unknown as Record<string, unknown>[]).filter((r) => nombreRepartidor(r.courier as string | null) === nombreRepartidor(cuenta.courier));
  const reprogramado = new Map(crudas.map((r) => [String(r.item_id), (r.reprogramado_para as string | null) ?? null]));
  const filas = sinDuplicados(
    crudas.map((r) => aFila(r, "ciudad")),
    await tableroConsolidado(supabase),
  )
    // Una fila de cierre de Monday («CIERRE») no es un pedido.
    .filter((f) => (f.numero ?? "").trim().toUpperCase() !== "CIERRE")
    .sort((a, b) => a.posicion - b.posicion || (a.numero ?? "").localeCompare(b.numero ?? ""));

  // El pedido de cada fila, para mostrar su cliente y productos. Una fila sin pedido enlazado (las del tablero de prueba, o una que aún no enlazó) se
  // busca por su número y su tienda SOLO para mostrarlo (25 nov 2026, pedido de Hernán: «el delivery debe ver todo»): no se enlaza, así que lo que se
  // marque en ella no cambia ese pedido.
  const pedidoDe = new Map<string, string>();
  for (const f of filas) if (f.ordenId) pedidoDe.set(f.itemId, f.ordenId);
  const sinPedido = filas.filter((f) => !f.ordenId && f.numero);
  if (sinPedido.length) {
    const variantes = [...new Set(sinPedido.flatMap((f) => variantesPedido(f.numero)))];
    const [{ data: unidades }, { data: cands }] = await Promise.all([
      supabase.from("fin_unidades").select("id, nombre"),
      supabase.from("ven_ordenes").select("id, unidad_id, numero, periodo").in("numero", variantes.slice(0, 500)),
    ]);
    const candidatas: OrdenCandidata[] = ((cands ?? []) as Record<string, unknown>[]).map((o) => ({ id: String(o.id), unidad_id: String(o.unidad_id), numero: String(o.numero), periodo: String(o.periodo).slice(0, 10) }));
    for (const f of sinPedido) {
      const unidad = unidadDeTexto(f.tienda, (unidades ?? []) as { id: string; nombre: string }[], unidadDeTienda);
      const o = enlazarOrden(f.numero, unidad, candidatas);
      if (o) pedidoDe.set(f.itemId, o.id);
    }
  }
  const ordenes = [...new Set(pedidoDe.values())];
  const [clientes, lineas, notas, etiquetas] = ordenes.length
    ? await Promise.all([
        supabase.from("ven_ordenes_clientes").select("orden_id, nombre, telefono, direccion, corregimiento, notas").in("orden_id", ordenes),
        supabase.from("ven_orden_lineas").select("orden_id, linea, producto, cantidad, es_servicio").in("orden_id", ordenes).order("linea"),
        supabase.from("ven_orden_notas").select("orden_id, texto, creado_en").in("orden_id", ordenes).order("creado_en", { ascending: false }),
        supabase.from("ven_ordenes").select("id, etiquetas").in("id", ordenes),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const clienteDe = new Map(((clientes.data ?? []) as Record<string, unknown>[]).map((c) => [String(c.orden_id), c]));
  const productosDe = new Map<string, string[]>();
  for (const l of (lineas.data ?? []) as Record<string, unknown>[]) {
    if (l.es_servicio) continue;
    const k = String(l.orden_id);
    productosDe.set(k, [...(productosDe.get(k) ?? []), `${Number(l.cantidad) || 1}× ${String(l.producto ?? "").trim()}`]);
  }
  const notaDe = new Map<string, string>();
  for (const n of (notas.data ?? []) as Record<string, unknown>[]) if (!notaDe.has(String(n.orden_id))) notaDe.set(String(n.orden_id), String(n.texto ?? ""));

  const zonaDe = new Map(((etiquetas.data ?? []) as Record<string, unknown>[]).map((o) => [String(o.id), zonaDeEtiquetas((o.etiquetas as string | null) ?? null)]));

  const pedidos: PedidoRuta[] = filas.map((f) => {
    const orden = pedidoDe.get(f.itemId) ?? null;
    const c = orden ? (clienteDe.get(orden) as Record<string, string | null> | undefined) : undefined;
    return {
      itemId: f.itemId,
      numero: (f.numero ?? "").replace(/^#/, ""),
      tienda: f.tienda,
      tiendaTitulo: tituloTienda(f.tienda),
      estado: f.estado,
      seccion: seccionDe(f.estado),
      formaPago: f.formaPago,
      porCobrar: f.porCobrar,
      cobrado: f.cobrado,
      costeEnvio: f.costeEnvio,
      comprobantes: f.comprobantes,
      comentario: f.comentario,
      productos: orden ? (productosDe.get(orden) ?? []) : [],
      cliente: c ? { nombre: c.nombre ?? null, telefono: c.telefono ?? null, direccion: c.direccion ?? null, corregimiento: c.corregimiento ?? null, notas: c.notas ?? null } : null,
      zona: orden ? (zonaDe.get(orden) ?? null) : null,
      notaEquipo: orden ? (notaDe.get(orden) ?? null) : null,
      reprogramadoPara: reprogramado.get(f.itemId) ?? null,
    };
  });

  const { data: cierre } = await supabase.from("despacho_cierres").select("id, estado, nota, enviado_en, revisado_por_nombre, revisado_en, depositos").eq("courier", cuenta.courier).eq("dia", dia).maybeSingle();
  return {
    dia,
    pedidos,
    resumen: resumenCierre(pedidos),
    cierre: cierre
      ? {
          id: cierre.id as string,
          estado: cierre.estado as CierreGuardado["estado"],
          nota: (cierre.nota as string | null) ?? null,
          enviadoEn: cierre.enviado_en as string,
          revisadoPor: (cierre.revisado_por_nombre as string | null) ?? null,
          revisadoEn: (cierre.revisado_en as string | null) ?? null,
          depositos: (cierre.depositos as CierreGuardado["depositos"]) ?? [],
        }
      : null,
    faltaMigracion: false,
  };
}
