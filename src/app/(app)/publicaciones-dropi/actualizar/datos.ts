import type { SupabaseClient } from "@supabase/supabase-js";
import { PARTES, type ClaveParte } from "@/lib/dropi-actualizar/partes";

export interface ResultadoParte {
  estado: "listo" | "error";
  resumen?: string;
  error?: string;
  avisos?: string[];
  fin?: string;
}

export interface Corrida {
  id: string;
  quien: string;
  origen: "manual" | "automatica";
  estado: "corriendo" | "listo" | "con_fallos" | "detenido";
  pedidas: ClaveParte[];
  partes: Partial<Record<ClaveParte, ResultadoParte>>;
  inicio: string;
  fin: string | null;
}

/** La última vez de cada parte: de «Actualizar Dropi» o, si todavía no se usó, de las tareas programadas. */
export interface UltimaParte {
  fecha: string;
  estado: "listo" | "error";
  detalle: string;
  porTarea: boolean;
}

/**
 * Lo que muestra el panel: las últimas actualizaciones (migración 0154) y la última vez de cada parte. Mientras siguen las tareas
 * programadas, su última carga también cuenta (ventas: `dropi_ventas_cargas`; stock: `dropi_productos_proveedor_lecturas`;
 * pedidos, cartera y retiros: `dropi_sesiones` de la tarea de las 7:00). Sin la migración, `disponible` = false.
 */
export async function cargarPanel(supabase: SupabaseClient): Promise<{ disponible: boolean; corridas: Corrida[]; ultima: Partial<Record<ClaveParte, UltimaParte>> }> {
  // Las tareas programadas son solo de Panamá: su última carga cuenta solo para las partes de Panamá (28 oct 2026, llegó Costa Rica).
  const { data: pa } = await supabase.from("paises").select("id").eq("codigo", "PA").maybeSingle();
  const paId = (pa?.id as string | undefined) ?? "00000000-0000-0000-0000-000000000000";
  const [r, ventas, stock, sesion] = await Promise.all([
    supabase.from("dropi_actualizaciones").select("id, iniciado_por_nombre, origen, estado, pedidas, partes, inicio, fin").order("inicio", { ascending: false }).limit(30),
    supabase.from("dropi_ventas_cargas").select("corte, productos").eq("pais_id", paId).order("corte", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("dropi_productos_proveedor_lecturas").select("leido_en, productos").eq("pais_id", paId).order("leido_en", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("dropi_sesiones").select("renovada_en, ok, mensaje").eq("pais_codigo", "PA").eq("tipo", "proveedor").maybeSingle(),
  ]);
  const corridas: Corrida[] = (r.data ?? []).map((c) => ({
    id: c.id as string,
    quien: (c.iniciado_por_nombre as string | null) ?? "Automática",
    origen: c.origen as Corrida["origen"],
    estado: c.estado as Corrida["estado"],
    pedidas: (c.pedidas as ClaveParte[]) ?? [],
    partes: (c.partes as Corrida["partes"]) ?? {},
    inicio: c.inicio as string,
    fin: (c.fin as string | null) ?? null,
  }));
  const ultima: Partial<Record<ClaveParte, UltimaParte>> = {};
  for (const c of corridas)
    for (const p of PARTES) {
      const x = c.partes[p.clave];
      if (!ultima[p.clave] && x?.fin) ultima[p.clave] = { fecha: x.fin, estado: x.estado, detalle: x.estado === "listo" ? (x.resumen ?? "") : (x.error ?? "Error"), porTarea: false };
    }
  const masNueva = (clave: ClaveParte, u: UltimaParte | null) => {
    if (u && (!ultima[clave] || u.fecha > ultima[clave]!.fecha)) ultima[clave] = u;
  };
  if (ventas.data?.corte) masNueva("ventas", { fecha: ventas.data.corte as string, estado: "listo", detalle: `${Number(ventas.data.productos ?? 0).toLocaleString("es-PA")} productos`, porTarea: true });
  if (stock.data?.leido_en) masNueva("stock", { fecha: stock.data.leido_en as string, estado: "listo", detalle: `${Number(stock.data.productos ?? 0).toLocaleString("es-PA")} productos`, porTarea: true });
  if (sesion.data?.renovada_en && /diaria/i.test(String(sesion.data.mensaje ?? "")))
    for (const clave of ["pedidos", "cartera", "retiros"] as ClaveParte[])
      masNueva(clave, { fecha: sesion.data.renovada_en as string, estado: sesion.data.ok ? "listo" : "error", detalle: String(sesion.data.mensaje ?? ""), porTarea: true });
  return { disponible: !r.error, corridas, ultima };
}
