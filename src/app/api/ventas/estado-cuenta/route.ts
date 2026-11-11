import { getUsuarioActual } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { sinAccesoTodaLaEmpresa } from "@/lib/finanzas/acceso-tienda";
import { celdaCsv } from "@/lib/tabla/csv";
import { hoyPanama } from "@/lib/af4/fecha";

export const dynamic = "force-dynamic";

/** Estado de cuenta del efectivo de un mensajero (?r=<id>) o de una transportadora (?t=<nombre>): orden por orden. */
export async function GET(req: Request) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("ventas-tiendas") || (await sinAccesoTodaLaEmpresa())) {
    return new Response("Sin acceso", { status: 403 });
  }
  const u = new URL(req.url);
  const r = u.searchParams.get("r");
  const t = u.searchParams.get("t");
  const db = createServiceClient();
  let q = db.from("ven_cod_saldo").select("numero, unidad_id, esperado, cobrado, remitido, pendiente, dias").gt("pendiente", 0).order("dias", { ascending: false }).limit(5000);
  let quien = "";
  if (r && /^[0-9a-f-]{36}$/i.test(r)) {
    q = q.eq("repartidor_id", r);
    const { data: m } = await db.from("del_repartidores").select("nombre").eq("id", r).maybeSingle();
    quien = String(m?.nombre ?? "mensajero");
  } else if (t) {
    q = q.is("repartidor_id", null).ilike("transportista", t.replace(/[%_,()]/g, ""));
    quien = t;
  } else return new Response("Falta r o t", { status: 400 });
  const [{ data }, { data: uni }] = await Promise.all([q, db.from("fin_unidades").select("id, nombre").eq("clase", "tienda")]);
  const tienda = new Map((uni ?? []).map((x) => [String(x.id), String(x.nombre)]));
  const filas = (data ?? []) as Record<string, unknown>[];
  const n = (v: unknown) => Number(v ?? 0);
  const lineas = [["Orden", "Tienda", "Esperado", "Cobrado", "Devuelto", "Pendiente", "Días"].map(celdaCsv).join(",")];
  let tot = 0;
  for (const f of filas) {
    tot += n(f.pendiente);
    lineas.push([String(f.numero ?? ""), tienda.get(String(f.unidad_id)) ?? "", n(f.esperado), n(f.cobrado), n(f.remitido), n(f.pendiente), n(f.dias)].map(celdaCsv).join(","));
  }
  lineas.push(["Total pendiente", "", "", "", "", Math.round(tot * 100) / 100, ""].map(celdaCsv).join(","));
  const archivo = quien.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "cuenta";
  return new Response("﻿" + lineas.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="estado-cuenta-${archivo}-${hoyPanama()}.csv"`, "Cache-Control": "no-store" },
  });
}
