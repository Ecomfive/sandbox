"use server";

import { requireModulo } from "@/lib/auth";
import { getPaisActual } from "@/lib/pais";
import { createServiceClient } from "@/lib/supabase/server";
import { tiendasDeLaPersona } from "@/lib/tienda/acceso";
import { cargarVariantes, periodoElegido } from "@/lib/tienda/datos";
import { pedidosDeTiendas } from "@/lib/tienda/datos-finanzas";
import { contar, extremos, origenEntregas, porProducto, type Conteo, type Extremos, type FilaProducto, type FuenteEntrega, type LineaDetalle } from "@/lib/tienda/detalle-tienda";
import { entregasDeOrdenes, guiasDeOrdenes } from "@/lib/tienda/entregas-monday";
import { nombreComparable } from "@/lib/tienda/ordenes-finanzas";

export interface DetalleTienda {
  tienda: string;
  desde: string;
  hasta: string;
  total: Conteo;
  /** De dónde sale cada entregado. */
  origen: Record<FuenteEntrega, number>;
  productos: FilaProducto[];
  extremos: Extremos;
}

/**
 * El detalle de una tienda para el tablero de «Todas las tiendas» (18 nov 2026, pedido de Hernán): entregados (y quién lo registra), confirmados y lo mismo
 * por producto, del periodo elegido. Se pide al hacer clic en la tarjeta (leer las líneas de miles de pedidos en cada carga haría lenta la página).
 * Solo lee, y solo tiendas que la persona puede ver.
 */
export async function obtenerDetalleTienda(tiendaId: string, sp: { periodo?: string; desde?: string; hasta?: string }): Promise<DetalleTienda | { error: string }> {
  await requireModulo("tienda-pedidos");
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  const { tienda } = await tiendasDeLaPersona(supabase, pais.id, String(tiendaId ?? ""));
  if (!tienda || tienda.id !== tiendaId) return { error: "No tienes acceso a esa tienda (o es de otro país)." };
  const eleccion = periodoElegido({ periodo: sp?.periodo, desde: sp?.desde, hasta: sp?.hasta });
  const { pedidos, lineasFinanzas, fuente, periodo } = await pedidosDeTiendas(supabase, [tienda], pais.codigo, eleccion);

  const lineas: LineaDetalle[] = [];
  // Las órdenes del sistema (las que actualizan Monday y Servientrega): cada línea ya trae su producto nuestro, si está vinculada.
  for (const l of lineasFinanzas) {
    if (l.esServicio) continue;
    lineas.push({ pedidoId: l.pedidoId, clave: l.skuId ?? `t:${nombreComparable(l.titulo)}`, nombre: l.titulo, vinculado: !!l.skuId, cantidad: l.cantidad });
  }
  // Las que llegan directo de Shopify: la variante dice el producto (lo que no sale de bodega no se cuenta).
  const deShopify = pedidos.filter((p) => !fuente.unidadDe.has(p.tiendaId));
  if (deShopify.length) {
    const variantes = await cargarVariantes(supabase, [tienda.id]);
    const vinculo = new Map(variantes.map((v) => [v.shopifyVarianteId, v.noFisico ? ("no_fisico" as const) : v.skuMaestroId]));
    for (let i = 0; i < deShopify.length; i += 200) {
      const { data } = await supabase
        .from("tienda_pedido_lineas")
        .select("pedido_id, shopify_variante_id, titulo, cantidad")
        .in(
          "pedido_id",
          deShopify.slice(i, i + 200).map((p) => p.id),
        );
      for (const l of data ?? []) {
        const v = l.shopify_variante_id === null ? null : (vinculo.get(Number(l.shopify_variante_id)) ?? null);
        if (v === "no_fisico") continue;
        lineas.push({ pedidoId: l.pedido_id, clave: v ?? `t:${nombreComparable(String(l.titulo ?? ""))}`, nombre: String(l.titulo ?? "Sin nombre"), vinculado: !!v, cantidad: Number(l.cantidad) || 0 });
      }
    }
  }

  // El nombre de nuestro producto para los vinculados (no el de Shopify, que cambia entre tiendas y promociones).
  const skuIds = [...new Set(lineas.filter((l) => l.vinculado).map((l) => l.clave))];
  const nombreDe = new Map<string, string>();
  for (let i = 0; i < skuIds.length; i += 200) {
    const { data } = await supabase.from("skus_maestros").select("id, nombre").in("id", skuIds.slice(i, i + 200));
    for (const s of data ?? []) nombreDe.set(String(s.id), String(s.nombre));
  }
  for (const l of lineas) if (l.vinculado) l.nombre = nombreDe.get(l.clave) ?? l.nombre;

  const entregados = pedidos.filter((p) => p.estado === "entregado").map((p) => p.id);
  const [monday, guias] = entregados.length ? await Promise.all([entregasDeOrdenes(supabase, entregados), guiasDeOrdenes(supabase, entregados)]) : [new Map(), new Map()];
  const grupo = (m: Map<string, { grupo: string }>) => new Map([...m].map(([k, v]) => [k, v.grupo]));
  const productos = porProducto(pedidos, lineas);
  return {
    tienda: tienda.nombre,
    desde: periodo.desde,
    hasta: periodo.hasta,
    total: contar(pedidos.map((p) => p.estado)),
    origen: origenEntregas(entregados, grupo(monday), grupo(guias)),
    productos,
    extremos: extremos(productos),
  };
}
