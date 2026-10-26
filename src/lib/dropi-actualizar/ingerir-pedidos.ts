// Los pedidos de Dropi de un país (lectura del proveedor) a la base: primero en bruto en `staging_ordenes_dropi`, luego normalizados
// en `productos`/`ordenes` por lotes, y los pedidos del CRM (`crm_sincronizar_ordenes`, migración 0065). Lo usan
// scripts/dropi-ingerir-ordenes.ts (tareas programadas) y «Actualizar Dropi» (26 oct 2026), que lo corre en el servidor.
//
// Cada pedido de Dropi puede traer varios productos (`orderdetails`), pero `ordenes` guarda uno por fila: se usa el primero y se
// avisa si aparece uno con más. Un producto de Dropi sin `sku` usa el id de Dropi del producto como identificador estable. La
// lista interna `productos` es la de los pedidos (para enlazarlos), no Producto ni Gestión de IDs Dropi.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface PedidoDropi {
  id: number;
  status: string;
  total_order: number;
  created_at: string;
  orderdetails: { product: { id: number; sku: string | null; name: string } }[];
}

function* enLotes<T>(items: T[], tamano: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += tamano) yield items.slice(i, i + tamano);
}

/** Guarda los pedidos de un país (`PA`, `CR`) y devuelve los números de la carga. `log` recibe los avisos. */
export async function ingerirPedidos(supabase: SupabaseClient, codigoPais: string, ordenes: PedidoDropi[], log: (texto: string) => void = () => {}) {
  const { data: paisRow } = await supabase.from("paises").select("id").eq("codigo", codigoPais.toUpperCase()).single();
  const { data: plataformaRow } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();
  if (!paisRow || !plataformaRow) throw new Error("Falta el país o la plataforma Dropi. Corre las migraciones.");
  const { data: cuentaRow } = await supabase
    .from("cuentas_extraccion")
    .select("id")
    .eq("pais_id", paisRow.id)
    .eq("plataforma_id", plataformaRow.id)
    .eq("tipo", "proveedor")
    .single();
  if (!cuentaRow) throw new Error("Falta la cuenta de extracción Dropi proveedor. Corre las migraciones.");
  const paisId = paisRow.id as string;
  const plataformaId = plataformaRow.id as string;

  for (const lote of enLotes(ordenes, 500)) {
    const { error } = await supabase.from("staging_ordenes_dropi").insert(lote.map((o) => ({ cuenta_extraccion_id: cuentaRow.id, payload: o })));
    if (error) throw new Error(`Error guardando staging: ${error.message}`);
  }

  // Por páginas: Supabase devuelve 1.000 filas como máximo, y con más productos los demás parecían nuevos (y chocaba al crearlos).
  const productosExistentes: { id: string; sku: string }[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await supabase.from("productos").select("id, sku").eq("pais_id", paisId).eq("plataforma_id", plataformaId).order("id").range(desde, desde + 999);
    if (error) throw new Error(`Error leyendo productos: ${error.message}`);
    productosExistentes.push(...((data ?? []) as { id: string; sku: string }[]));
    if ((data ?? []).length < 1000) break;
  }
  const skuAId = new Map(productosExistentes.map((p) => [p.sku, p.id]));
  const skuANombreNuevo = new Map<string, string>();
  let multiProducto = 0;
  let sinProducto = 0;
  const conSku = ordenes.map((orden) => {
    if (orden.orderdetails.length > 1) multiProducto++;
    const detalle = orden.orderdetails[0];
    if (!detalle) {
      sinProducto++;
      return { orden, sku: null as string | null };
    }
    const sku = detalle.product.sku ?? `dropi-${detalle.product.id}`;
    if (!skuAId.has(sku) && !skuANombreNuevo.has(sku)) skuANombreNuevo.set(sku, detalle.product.name || sku);
    return { orden, sku };
  });
  if (skuANombreNuevo.size > 0) {
    const nuevos = Array.from(skuANombreNuevo, ([sku, nombre]) => ({ pais_id: paisId, plataforma_id: plataformaId, sku, nombre }));
    for (const lote of enLotes(nuevos, 500)) {
      const { data: creados, error } = await supabase.from("productos").insert(lote).select("id, sku");
      if (error) throw new Error(`Error creando productos: ${error.message}`);
      for (const c of creados ?? []) skuAId.set(c.sku as string, c.id as string);
    }
  }

  // La paginación de Dropi no es atómica: la misma orden puede aparecer en dos páginas. Una fila por referencia.
  const filasPorReferencia = new Map<string, Record<string, unknown>>();
  for (const { orden, sku } of conSku) {
    if (sku === null) continue;
    filasPorReferencia.set(String(orden.id), {
      pais_id: paisId,
      plataforma_id: plataformaId,
      producto_id: skuAId.get(sku),
      referencia_externa: String(orden.id),
      cantidad: orden.orderdetails.length,
      monto: orden.total_order,
      estado: orden.status,
      fecha: orden.created_at.slice(0, 10),
      fecha_hora: orden.created_at,
    });
  }
  const repetidas = conSku.filter((o) => o.sku !== null).length - filasPorReferencia.size;
  const filas = Array.from(filasPorReferencia.values());
  for (const lote of enLotes(filas, 500)) {
    const { error } = await supabase.from("ordenes").upsert(lote, { onConflict: "plataforma_id,referencia_externa" });
    if (error) throw new Error(`Error guardando ordenes: ${error.message}`);
  }

  // Pedidos por dropshipper del CRM (migración 0065). Si todavía no se corrió, solo avisa.
  const { data: crm, error: errorCrm } = await supabase.rpc("crm_sincronizar_ordenes");
  if (errorCrm) log(`No se actualizaron los pedidos del CRM (${errorCrm.message}).`);
  // De cada pedido queda en bruto solo la copia más reciente (migración 0133; sin ella, solo avisa).
  const { data: borradas, error: errorLimpiar } = await supabase.rpc("dropi_staging_ordenes_limpiar");
  if (errorLimpiar) log(`No se limpiaron las copias viejas de los pedidos (${errorLimpiar.message}).`);
  if (repetidas > 0) log(`${repetidas} pedidos aparecían repetidos entre páginas (misma orden, una fila).`);
  if (multiProducto > 0) log(`${multiProducto} pedidos traían más de un producto; se guardó el primero.`);
  if (sinProducto > 0) log(`${sinProducto} pedidos no traían ningún producto y se omitieron.`);
  return {
    leidos: ordenes.length,
    normalizados: filas.length,
    productosNuevos: skuANombreNuevo.size,
    crm: errorCrm ? null : Number(crm ?? 0),
    copiasBorradas: errorLimpiar ? null : Number(borradas ?? 0),
  };
}
