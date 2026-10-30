import { createServiceClient } from "@/lib/supabase/server";

export interface DesempenoPais {
  codigoPais: string;
  pedidos: number;
  despachados: number;
  entregados: number;
  devueltos: number;
  cancelados: number;
  conNovedad: number;
  ventas: number;
}
export interface ProductoVendido {
  producto: string;
  sku: string | null;
  /** Su ID en la plataforma («7820»; «7820, 8701» si el mismo nombre tuvo dos). Null sin la migración 0198 o si el pedido no lo traía. */
  ids: string | null;
  unidades: number;
  entregadas: number;
}
export type Desempeno = { paises: DesempenoPais[]; productos: ProductoVendido[] };

const ES_ID = (v: string) => /^[0-9a-fA-F-]{8,64}$/.test(v);
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Lo que hizo un dropshipper en Dropi (u otra plataforma vinculada) entre dos fechas: guías, despachadas, entregadas,
 * tasa de entrega y productos. Las sumas las hace Postgres (`crm_desempeno`, `crm_productos_vendidos`). Devuelve el error
 * como valor. No revisa permisos: lo llama la ruta `/api/crm/desempeno`, que exige poder abrir el CRM (29 oct 2026: era una
 * acción del servidor y, como las acciones de una página van en fila, al cambiar de período esperaba detrás de las demás
 * lecturas de la ficha y parecía que los botones no hacían nada).
 */
export async function leerDesempeno(dropshipperId: string, desde: string, hasta: string): Promise<Desempeno | { error: string }> {
  if (!ES_ID(dropshipperId)) return { error: "Dropshipper no válido." };
  if (!FECHA_ISO.test(desde) || !FECHA_ISO.test(hasta) || Number.isNaN(Date.parse(desde)) || Number.isNaN(Date.parse(hasta))) {
    return { error: "Las fechas no son válidas." };
  }
  if (desde > hasta) return { error: "La fecha de inicio es posterior a la final." };
  if (Date.parse(hasta) - Date.parse(desde) > 3 * 366 * 86_400_000) return { error: "Elige un período de hasta 3 años." };

  const supabase = createServiceClient();
  const [resumen, productos, paises] = await Promise.all([
    supabase.rpc("crm_desempeno", { p_dropshipper: dropshipperId, p_desde: desde, p_hasta: hasta }),
    supabase.rpc("crm_productos_vendidos", { p_dropshipper: dropshipperId, p_desde: desde, p_hasta: hasta }),
    supabase.from("paises").select("id, codigo"),
  ]);
  if (resumen.error || productos.error) return { error: "No se pudo cargar el desempeño." };
  const codigo = new Map((paises.data ?? []).map((p) => [p.id as string, p.codigo as string]));
  return {
    paises: (resumen.data ?? []).map((r: Record<string, unknown>) => ({
      codigoPais: codigo.get(r.pais_id as string) ?? "—",
      pedidos: Number(r.pedidos),
      despachados: Number(r.despachados),
      entregados: Number(r.entregados),
      devueltos: Number(r.devueltos),
      cancelados: Number(r.cancelados),
      conNovedad: Number(r.con_novedad),
      ventas: Number(r.ventas),
    })),
    productos: (productos.data ?? []).map((p: Record<string, unknown>) => ({
      producto: String(p.producto),
      sku: (p.sku as string | null) ?? null,
      ids: (p.ids as string | null | undefined) ?? null,
      unidades: Number(p.unidades),
      entregadas: Number(p.entregadas),
    })),
  };
}
