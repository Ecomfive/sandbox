"use server";

import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";

const ES_ID = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

export interface VentasDropiDropshipper {
  /** Hasta qué día llegan los datos (la última carga de Desempeño › Ventas Dropi). */
  corte: string | null;
  paises: {
    codigoPais: string;
    pedidas: number;
    ordenes: number;
    noEfectivas: number;
    netas: number;
    netas30: number;
    ultimaOrden: string | null;
    /** Netas por mes (YYYY-MM), del más viejo al más nuevo. */
    porMes: { mes: string; netas: number }[];
    /** Qué productos vende, de más a menos netas. */
    productos: { id: number; nombre: string; pedidas: number; netas: number; noEfectivas: number }[];
  }[];
}

/**
 * Las ventas en Dropi del dropshipper (Desempeño › Ventas Dropi, migraciones 0120 y 0121), por sus cuentas de Dropi vinculadas:
 * unidades pedidas y netas, lo no efectivo (cancelado, rechazado o devuelto), por mes y por producto. Es una lectura: basta
 * poder abrir el CRM. Devuelve el error como valor.
 */
export async function obtenerVentasDropi(dropshipperId: string): Promise<VentasDropiDropshipper | { error: string }> {
  await requireModulo("crm-dropshippers");
  if (!ES_ID(dropshipperId)) return { error: "Dropshipper no válido." };
  const supabase = createServiceClient();
  const { data: dropi } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").maybeSingle();
  if (!dropi) return { corte: null, paises: [] };
  const { data: cuentas, error } = await supabase.from("dropshipper_cuentas").select("pais_id, id_externo").eq("dropshipper_id", dropshipperId).eq("plataforma_id", dropi.id);
  if (error) return { error: "No se pudieron cargar las ventas." };
  const porPais = new Map<string, number[]>();
  for (const c of cuentas ?? []) {
    const n = Number(c.id_externo);
    if (Number.isInteger(n)) porPais.set(c.pais_id as string, [...(porPais.get(c.pais_id as string) ?? []), n]);
  }
  if (!porPais.size) return { corte: null, paises: [] };

  const resultado: VentasDropiDropshipper = { corte: null, paises: [] };
  const { data: paises } = await supabase.from("paises").select("id, codigo").in("id", [...porPais.keys()]);
  const codigo = new Map((paises ?? []).map((p) => [p.id as string, p.codigo as string]));
  for (const [paisId, usuarios] of porPais) {
    const [carga, totales, meses] = await Promise.all([
      supabase.from("dropi_ventas_cargas").select("corte").eq("pais_id", paisId).order("corte", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("dropi_ventas_dropshippers").select("pedidas, ordenes, no_efectivas, netas_30d, ultima_orden").eq("pais_id", paisId).in("dropi_usuario_id", usuarios),
      supabase.from("dropi_ventas_dropshipper_mes").select("dropi_producto_id, mes, pedidas, no_efectivas").eq("pais_id", paisId).in("dropi_usuario_id", usuarios).limit(10000),
    ]);
    if (totales.error || meses.error) return { error: "No se pudieron cargar las ventas. Falta correr en Supabase la migración 0121." };
    if (!carga.data || !(totales.data ?? []).length) continue;
    const corte = new Date(new Date(carga.data.corte as string).getTime() - 5 * 3600e3).toISOString().slice(0, 10);
    if (!resultado.corte || corte > resultado.corte) resultado.corte = corte;
    const t = (totales.data ?? []).reduce(
      (a, r) => ({
        pedidas: a.pedidas + Number(r.pedidas),
        ordenes: a.ordenes + Number(r.ordenes),
        noEfectivas: a.noEfectivas + Number(r.no_efectivas),
        netas30: a.netas30 + Number(r.netas_30d),
        ultima: r.ultima_orden && (!a.ultima || (r.ultima_orden as string) > a.ultima) ? (r.ultima_orden as string) : a.ultima,
      }),
      { pedidas: 0, ordenes: 0, noEfectivas: 0, netas30: 0, ultima: null as string | null },
    );
    const mesMap = new Map<string, number>();
    const prodMap = new Map<number, { pedidas: number; noEfectivas: number }>();
    for (const r of meses.data ?? []) {
      const m = (r.mes as string).slice(0, 7);
      const netas = Number(r.pedidas) - Number(r.no_efectivas);
      mesMap.set(m, (mesMap.get(m) ?? 0) + netas);
      const p = prodMap.get(Number(r.dropi_producto_id)) ?? { pedidas: 0, noEfectivas: 0 };
      p.pedidas += Number(r.pedidas);
      p.noEfectivas += Number(r.no_efectivas);
      prodMap.set(Number(r.dropi_producto_id), p);
    }
    const { data: nombres } = await supabase.from("dropi_ventas_productos").select("dropi_producto_id, nombre").eq("pais_id", paisId).in("dropi_producto_id", [...prodMap.keys()]);
    const nombre = new Map((nombres ?? []).map((n) => [Number(n.dropi_producto_id), n.nombre as string]));
    resultado.paises.push({
      codigoPais: codigo.get(paisId) ?? "—",
      pedidas: t.pedidas,
      ordenes: t.ordenes,
      noEfectivas: t.noEfectivas,
      netas: t.pedidas - t.noEfectivas,
      netas30: t.netas30,
      ultimaOrden: t.ultima,
      porMes: [...mesMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, netas]) => ({ mes, netas })),
      productos: [...prodMap.entries()]
        .map(([id, p]) => ({ id, nombre: nombre.get(id) ?? `Producto ${id}`, pedidas: p.pedidas, noEfectivas: p.noEfectivas, netas: p.pedidas - p.noEfectivas }))
        .sort((a, b) => b.netas - a.netas),
    });
  }
  return resultado;
}
