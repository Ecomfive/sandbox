// Lo que muestra Ventas por tienda › Pipeline: las órdenes abiertas por fase, la plata contra entrega que tiene cada
// mensajero, los mensajeros y las tiendas conectadas (sin su token). Solo servidor.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Fase, SaldoCod } from "./ciclo";

export interface OrdenPipeline {
  id: string;
  numero: string;
  fecha: string;
  tienda: string;
  unidadId: string;
  pais: string;
  fase: Fase;
  total: number;
  metodo: string | null;
  codEsperado: number | null;
  productos: string;
  repartidorId: string | null;
  transportista: string | null;
  guia: string | null;
  motivoFallo: string | null;
  intentos: number;
  horas: number;
}

export interface TiendaConectada {
  unidadId: string;
  nombre: string;
  pais: string;
  dominio: string | null;
  activa: boolean;
  ultimaLectura: string | null;
  error: string | null;
  ultimoWebhook: string | null;
  porEnv: boolean;
}

export interface DatosPipeline {
  ordenes: OrdenPipeline[];
  saldos: (SaldoCod & { numero: string; tienda: string })[];
  mensajeros: { id: string; nombre: string }[];
  transportistas: string[];
  tiendas: TiendaConectada[];
  puedeConectar: boolean;
  /** Cuentas del libro para asentar una remesa; vacío si la persona no puede modificar el libro. */
  cuentas: { id: string; nombre: string }[];
  puedeLibro: boolean;
}

const num = (v: unknown) => Number(v ?? 0) || 0;
const ABIERTAS = ["por_confirmar", "confirmada", "despachada", "fallida"];

export async function cargarPipeline(
  supabase: SupabaseClient,
  unidades: { id: string; nombre: string; pais?: string }[],
  opciones: { puedeConectar: boolean; envTiendas: string[]; puedeLibro?: boolean },
): Promise<DatosPipeline | { error: string }> {
  const ids = unidades.map((u) => u.id);
  const nombre = new Map(unidades.map((u) => [u.id, u]));
  const [ord, sal, rep, con, uni] = await Promise.all([
    ids.length
      ? supabase
          .from("ven_ordenes")
          .select("id, numero, fecha, unidad_id, fase, total, metodo_pago, cod_esperado, repartidor_id, transportista, guia, motivo_fallo, intentos, creado_en, ven_orden_lineas(linea, producto, cantidad)")
          .in("unidad_id", ids)
          .in("fase", ABIERTAS)
          .order("fecha", { ascending: true })
          .limit(3000)
      : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from("ven_cod_saldo").select("orden_id, unidad_id, numero, repartidor_id, transportista, esperado, cobrado, remitido, pendiente, dias").in("unidad_id", ids).gt("pendiente", 0).limit(5000) : Promise.resolve({ data: [], error: null }),
    supabase.from("del_repartidores").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("ven_tiendas_conexion").select("*"),
    supabase.from("fin_unidades").select("id, nombre, pais").eq("clase", "tienda").eq("activo", true).order("nombre"),
  ]);
  if (ord.error) return { error: /fase/.test(ord.error.message) ? "Falta correr la migración 0956 (ciclo de órdenes) en Supabase." : ord.error.message };
  if (sal.error) return { error: sal.error.message };
  const ahora = Date.now();
  const ordenes: OrdenPipeline[] = ((ord.data ?? []) as Record<string, unknown>[]).map((o) => {
    const l = ((o.ven_orden_lineas as { linea: number; producto: string; cantidad: number | string }[] | null) ?? []).sort((a, b) => a.linea - b.linea);
    const u = nombre.get(String(o.unidad_id));
    return {
      id: String(o.id),
      numero: String(o.numero),
      fecha: String(o.fecha),
      tienda: u?.nombre ?? "—",
      unidadId: String(o.unidad_id),
      pais: u?.pais ?? "PA",
      fase: o.fase as Fase,
      total: num(o.total),
      metodo: (o.metodo_pago as string | null) ?? null,
      codEsperado: o.cod_esperado === null || o.cod_esperado === undefined ? null : num(o.cod_esperado),
      productos: l.map((x) => `${num(x.cantidad)}× ${x.producto}`).join(" · "),
      repartidorId: (o.repartidor_id as string | null) ?? null,
      transportista: (o.transportista as string | null) ?? null,
      guia: (o.guia as string | null) ?? null,
      motivoFallo: (o.motivo_fallo as string | null) ?? null,
      intentos: num(o.intentos),
      horas: Math.max(0, Math.floor((ahora - Date.parse(String(o.creado_en ?? o.fecha))) / 3_600_000)),
    };
  });
  const saldos = ((sal.data ?? []) as Record<string, unknown>[]).map((s) => ({
    ordenId: String(s.orden_id),
    numero: String(s.numero),
    tienda: nombre.get(String(s.unidad_id))?.nombre ?? "—",
    esperado: num(s.esperado),
    cobrado: num(s.cobrado),
    remitido: num(s.remitido),
    pendiente: num(s.pendiente),
    dias: num(s.dias),
    repartidorId: (s.repartidor_id as string | null) ?? null,
    transportista: (s.transportista as string | null) ?? null,
  }));
  const conexion = new Map((con.data ?? []).map((c) => [String(c.unidad_id), c as Record<string, unknown>]));
  const env = new Set(opciones.envTiendas.map((t) => t.toUpperCase()));
  const tiendas: TiendaConectada[] = ((uni.data ?? []) as { id: string; nombre: string; pais: string }[])
    .filter((u) => nombre.has(u.id))
    .map((u) => {
      const c = conexion.get(u.id);
      return {
        unidadId: u.id,
        nombre: u.nombre,
        pais: u.pais,
        dominio: (c?.dominio as string | undefined) ?? null,
        activa: Boolean(c?.activo) || env.has(u.nombre.toUpperCase()),
        ultimaLectura: (c?.ultima_lectura as string | null) ?? null,
        error: (c?.ultimo_error as string | null) ?? null,
        ultimoWebhook: (c?.ultimo_webhook as string | null) ?? null,
        porEnv: !c?.activo && env.has(u.nombre.toUpperCase()),
      };
    });
  const cuentas = opciones.puedeLibro
    ? (((await supabase.from("fin_cuentas").select("id, nombre").eq("activo", true).order("nombre")).data ?? []) as { id: string; nombre: string }[])
    : [];
  const transportistas = [...new Set([...ordenes.map((o) => o.transportista), "Servientrega"].filter((x): x is string => !!x))].sort();
  return {
    ordenes,
    saldos,
    mensajeros: ((rep.data ?? []) as { id: string; nombre: string }[]).map((r) => ({ id: r.id, nombre: r.nombre })),
    transportistas,
    tiendas,
    puedeConectar: opciones.puedeConectar,
    cuentas,
    puedeLibro: !!opciones.puedeLibro,
  };
}
