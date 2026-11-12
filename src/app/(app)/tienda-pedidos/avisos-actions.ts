"use server";

import { getUsuarioActual } from "@/lib/auth";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { createServiceClient } from "@/lib/supabase/server";
import { nombreComparable } from "@/lib/tienda/ordenes-finanzas";

// El aviso de «Nuevo pedido» (12 nov 2026, pedido de Hernán: «si cae un pedido, nos cae a nosotros en el sistema y nos da un aviso, como lo hace el de
// Jorge»). El navegador pregunta cada 30 segundos por los pedidos que llegaron de Shopify desde la última vez; solo los de tiendas conectadas, de los
// países que la persona puede ver y de hoy o ayer (lo que se trae de antes al conectar no avisa). Basta poder abrir Pedidos de tienda.

export interface PedidoNuevo {
  id: string;
  tienda: string;
  numero: string;
  total: number;
  moneda: string;
  llego: string;
}

const ES_ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:?\d{2})$/;

export async function pedidosNuevos(desde: string): Promise<{ pedidos: PedidoNuevo[]; hasta: string } | { error: string }> {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("tienda-pedidos")) return { error: "Sin acceso." };
  const ahora = new Date().toISOString();
  if (typeof desde !== "string" || !ES_ISO.test(desde)) return { pedidos: [], hasta: ahora };
  // Como mucho, lo de la última hora (una pestaña dormida no trae una avalancha al despertar).
  const piso = new Date(Math.max(Date.parse(desde), Date.now() - 3_600_000)).toISOString();
  const supabase = createServiceClient();
  const { data: tiendas } = await supabase.from("tiendas").select("nombre, paises(codigo)").eq("estado", "conectada");
  const visibles = (tiendas ?? []).flatMap((t) => {
    const p = (Array.isArray(t.paises) ? t.paises[0] : t.paises) as { codigo: string } | null;
    return p && puedeVerPais(usuario.paisesPermitidos, p.codigo) ? [{ nombre: t.nombre as string, pais: p.codigo }] : [];
  });
  if (!visibles.length) return { pedidos: [], hasta: ahora };
  const { data: unidades } = await supabase.from("fin_unidades").select("id, nombre, pais").eq("clase", "tienda").in("pais", [...new Set(visibles.map((v) => v.pais))]);
  const nombreDe = new Map<string, string>();
  for (const u of unidades ?? []) {
    const t = visibles.find((v) => v.pais === u.pais && nombreComparable(v.nombre) === nombreComparable(u.nombre as string));
    if (t) nombreDe.set(u.id as string, t.nombre);
  }
  if (!nombreDe.size) return { pedidos: [], hasta: ahora };
  const ayer = new Date(Date.now() - 36 * 3_600_000).toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  const { data } = await supabase
    .from("ven_ordenes")
    .select("id, unidad_id, numero, total, moneda, creado_en")
    .in("unidad_id", [...nombreDe.keys()])
    .eq("origen", "shopify")
    .gt("creado_en", piso)
    .lte("creado_en", ahora)
    .gte("fecha", ayer)
    .order("creado_en")
    .limit(10);
  return {
    hasta: ahora,
    pedidos: (data ?? []).map((o) => ({
      id: o.id as string,
      tienda: nombreDe.get(o.unidad_id as string) ?? "",
      numero: (o.numero as string | null) ?? "—",
      total: Number(o.total) || 0,
      moneda: (o.moneda as string | null) ?? "USD",
      llego: o.creado_en as string,
    })),
  };
}
