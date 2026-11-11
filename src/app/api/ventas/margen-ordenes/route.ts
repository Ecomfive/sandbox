import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { csvMargen, PASARELA_TARJETA, reporteMargen, type CostosCobro } from "@/lib/ventas/reporte-margen";
import { hoyPanama } from "@/lib/af4/fecha";

export const dynamic = "force-dynamic";

export async function GET() {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("ventas-tiendas") || (await sinAccesoTodaLaEmpresa())) {
    return new Response("Sin acceso", { status: 403 });
  }
  const db = createServiceClient();
  const desde = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const { data: ordenes } = await db
    .from("ven_ordenes")
    .select("id, numero, fecha, total, envio, costo_envio, metodo_pago, repartidor_id, unidad_id")
    .eq("fase", "entregada")
    .gte("fecha", desde)
    .limit(20000);
  const ids = (ordenes ?? []).map((o) => String(o.id));
  // Costo de mercancía = suma de costo_excel × cantidad; si una línea no tiene costo, la orden queda sin margen.
  const costo = new Map<string, number | null>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data: lineas } = await db
      .from("ven_orden_lineas")
      .select("orden_id, cantidad, costo_excel, es_servicio")
      .in("orden_id", ids.slice(i, i + 500))
      .limit(50000);
    for (const l of lineas ?? []) {
      if (l.es_servicio) continue;
      const id = String(l.orden_id);
      const previo = costo.get(id);
      if (previo === null) continue;
      if (l.costo_excel == null) costo.set(id, null);
      else costo.set(id, (previo ?? 0) + Number(l.costo_excel) * Number(l.cantidad));
    }
  }
  // Mejora 78: pasarela (tarjeta) y mensajero propio. Las tarifas salen de cada repartidor y de `fin_config`
  // («ventas_pasarela_tarjeta» = {pct, fijo}; «ventas_costo_mensajero» = US$ por entrega cuando el repartidor no tiene tarifa).
  const [{ data: reps }, { data: cfg }, cfgM, cfgT] = await Promise.all([
    db.from("del_repartidores").select("id, tarifas"), // consulta-acotada: decenas de mensajeros
    db.from("fin_config").select("clave, valor").in("clave", ["ventas_pasarela_tarjeta", "ventas_costo_mensajero"]), // consulta-acotada
    db.from("ven_mensajero_config").select("repartidor_id, comision_entrega"), // consulta-acotada
    db.from("ven_tiendas_conexion").select("unidad_id, pasarela_pct, pasarela_fijo"), // consulta-acotada
  ]);
  // Lo configurado en el Pipeline manda: la comisión de cada mensajero y la pasarela de cada tienda.
  const comisionDe = new Map<string, number>();
  for (const c of cfgM.error ? [] : (cfgM.data ?? [])) if (c.comision_entrega != null) comisionDe.set(String(c.repartidor_id), Number(c.comision_entrega));
  const pasarelaDe = new Map<string, { pct: number; fijo: number }>();
  for (const t of cfgT.error ? [] : (cfgT.data ?? []))
    if (t.pasarela_pct != null) pasarelaDe.set(String(t.unidad_id), { pct: Number(t.pasarela_pct), fijo: Number(t.pasarela_fijo ?? 0) });
  const tarifaDe = new Map<string, number | null>();
  for (const r of reps ?? []) {
    const t = (r.tarifas as Record<string, unknown> | null)?.entrega;
    tarifaDe.set(String(r.id), typeof t === "number" && t >= 0 ? t : null);
  }
  const valor = (clave: string) => (cfg ?? []).find((c) => c.clave === clave)?.valor as unknown;
  const pas = valor("ventas_pasarela_tarjeta") as { pct?: unknown; fijo?: unknown } | undefined;
  const porDefecto = Number(valor("ventas_costo_mensajero"));
  const costos: CostosCobro = {
    pasarelaTarjeta: pas && typeof pas.pct === "number" && typeof pas.fijo === "number" ? { pct: pas.pct, fijo: pas.fijo } : PASARELA_TARJETA,
    mensajeroPorDefecto: Number.isFinite(porDefecto) && porDefecto >= 0 && valor("ventas_costo_mensajero") != null ? porDefecto : null,
  };
  const filas = reporteMargen(
    (ordenes ?? []).map((o) => ({
      numero: String(o.numero ?? o.id),
      fecha: String(o.fecha ?? ""),
      total: Number(o.total ?? 0),
      envio: Number(o.envio ?? 0),
      costoEnvio: Number(o.costo_envio ?? 0),
      costoMercancia: costo.has(String(o.id)) ? (costo.get(String(o.id)) ?? null) : null,
      metodo: (o.metodo_pago as string | null) ?? null,
      mensajeroPropio: !!o.repartidor_id,
      tarifaMensajero: o.repartidor_id ? (comisionDe.get(String(o.repartidor_id)) ?? tarifaDe.get(String(o.repartidor_id)) ?? null) : null,
      pasarelaTienda: pasarelaDe.get(String(o.unidad_id)) ?? null,
    })),
    costos,
  );
  return new Response(csvMargen(filas), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="margen-ordenes-${hoyPanama()}.csv"`, "Cache-Control": "no-store" },
  });
}
