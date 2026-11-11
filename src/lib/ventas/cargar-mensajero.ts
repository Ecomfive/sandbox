import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import { hashToken, tokenPlausible } from "@/lib/ventas/mensajero";

export interface MensajeroSesion { repartidorId: string; nombre: string }

/** Quién es el dueño de un enlace. Solo compara el hash; un código inválido, desactivado o de un mensajero inactivo no entra. */
export async function resolverMensajero(token: unknown): Promise<MensajeroSesion | null> {
  if (!tokenPlausible(token)) return null;
  const supabase = createServiceClient();
  const { data: enlace } = await supabase.from("ven_mensajero_enlaces").select("repartidor_id").eq("token_hash", hashToken(token)).maybeSingle();
  if (!enlace) return null;
  const { data: rep } = await supabase.from("del_repartidores").select("id, nombre, activo").eq("id", enlace.repartidor_id).maybeSingle();
  if (!rep || !rep.activo) return null;
  return { repartidorId: String(rep.id), nombre: String(rep.nombre) };
}

export interface OrdenEnRuta {
  id: string; numero: string; cliente: string | null; direccion: string | null; zona: string | null; notas: string | null;
  productos: string[]; cod: number | null; guia: string | null; pideCodigo: boolean; intentos: number; comprobantes: number;
}
export interface DatosMensajero { nombre: string; enRuta: OrdenEnRuta[]; entregadasHoy: number; efectivoEnMano: number }

/** Lo que ve el mensajero: sus órdenes en ruta (sin teléfono, sin precios de la tienda), lo entregado hoy y el efectivo que lleva. */
export async function cargarMensajero(sesion: MensajeroSesion, hoy: string): Promise<DatosMensajero> {
  const supabase = createServiceClient();
  const [{ data: ordenes }, { data: hoyEnt }, { data: saldos }] = await Promise.all([
    supabase.from("ven_ordenes").select("id, numero, cod_esperado, guia, codigo_entrega, intentos").eq("fase", "despachada").eq("repartidor_id", sesion.repartidorId).order("despachada_en", { ascending: true }).limit(300),
    supabase.from("ven_ordenes").select("id", { count: "exact", head: false }).eq("fase", "entregada").eq("repartidor_id", sesion.repartidorId).gte("entregada_en", `${hoy}T00:00:00-05:00`).limit(1000),
    supabase.from("ven_cod_saldo").select("pendiente").eq("repartidor_id", sesion.repartidorId).gt("pendiente", 0).limit(5000),
  ]);
  const lista = (ordenes ?? []) as { id: string; numero: string; cod_esperado: number | null; guia: string | null; codigo_entrega: string | null; intentos: number | null }[];
  const ids = lista.map((o) => o.id);
  const clientes = new Map<string, { nombre: string | null; direccion: string | null; corregimiento: string | null; notas: string | null }>();
  const lineas = new Map<string, string[]>();
  const fotos = new Map<string, number>();
  for (let i = 0; i < ids.length; i += 200) {
    const trozo = ids.slice(i, i + 200);
    const [c, l, f] = await Promise.all([
      supabase.from("ven_ordenes_clientes").select("orden_id, nombre, direccion, corregimiento, notas").in("orden_id", trozo),
      supabase.from("ven_orden_lineas").select("orden_id, producto, cantidad, es_servicio").in("orden_id", trozo),
      supabase.from("ven_orden_comprobantes").select("orden_id").in("orden_id", trozo),
    ]);
    for (const x of (c.data ?? []) as { orden_id: string; nombre: string | null; direccion: string | null; corregimiento: string | null; notas: string | null }[]) clientes.set(x.orden_id, x);
    for (const x of (l.data ?? []) as { orden_id: string; producto: string | null; cantidad: number; es_servicio: boolean }[]) {
      if (x.es_servicio) continue;
      lineas.set(x.orden_id, [...(lineas.get(x.orden_id) ?? []), `${x.cantidad} × ${x.producto ?? "Producto"}`]);
    }
    for (const x of (f.data ?? []) as { orden_id: string }[]) fotos.set(x.orden_id, (fotos.get(x.orden_id) ?? 0) + 1);
  }
  return {
    nombre: sesion.nombre,
    enRuta: lista.map((o) => {
      const c = clientes.get(o.id);
      return {
        id: o.id, numero: o.numero, cliente: c?.nombre ?? null, direccion: c?.direccion ?? null, zona: c?.corregimiento ?? null, notas: c?.notas ?? null,
        productos: lineas.get(o.id) ?? [], cod: o.cod_esperado === null ? null : Number(o.cod_esperado), guia: o.guia,
        pideCodigo: Boolean(o.codigo_entrega), intentos: Number(o.intentos ?? 0), comprobantes: fotos.get(o.id) ?? 0,
      };
    }),
    entregadasHoy: (hoyEnt ?? []).length,
    efectivoEnMano: Math.round(((saldos ?? []) as { pendiente: number | string }[]).reduce((a, s) => a + Number(s.pendiente), 0) * 100) / 100,
  };
}
