import type { SupabaseClient } from "@supabase/supabase-js";

export interface PuntoInventario {
  fecha: string; // dd/mm
  entradas: number;
  salidas: number;
}

/** Entradas vs salidas por día, últimos 14 días, para el país dado. */
export async function getSerieInventario(
  supabase: SupabaseClient,
  paisId: string
): Promise<PuntoInventario[]> {
  const desde = new Date();
  desde.setDate(desde.getDate() - 13);
  const desdeStr = desde.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("movimientos_inventario")
    .select("fecha, tipo, cantidad")
    .eq("pais_id", paisId)
    .gte("fecha", desdeStr);

  const porDia = new Map<string, PuntoInventario>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(desde);
    d.setDate(d.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    porDia.set(iso, { fecha: `${iso.slice(8, 10)}/${iso.slice(5, 7)}`, entradas: 0, salidas: 0 });
  }

  for (const m of data ?? []) {
    const punto = porDia.get(String(m.fecha));
    if (!punto) continue;
    if (m.tipo === "entrada") punto.entradas += Number(m.cantidad);
    else punto.salidas += Number(m.cantidad);
  }

  return Array.from(porDia.values());
}

export interface PuntoFinanzas {
  periodo: string; // mm/yy
  diferencia: number;
}

/** Diferencia banco vs plataforma por mes, últimos 6 meses con datos, para el país dado. */
export async function getSerieFinanzas(
  supabase: SupabaseClient,
  paisId: string
): Promise<PuntoFinanzas[]> {
  const { data } = await supabase
    .from("conciliaciones")
    .select("periodo, diferencia")
    .eq("pais_id", paisId)
    .order("periodo", { ascending: true })
    .limit(6);

  return (data ?? []).map((c) => ({
    periodo: `${String(c.periodo).slice(5, 7)}/${String(c.periodo).slice(2, 4)}`,
    diferencia: Number(c.diferencia),
  }));
}
