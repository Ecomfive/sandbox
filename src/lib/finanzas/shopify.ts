// Conexión directa con Shopify (mejora 98): de una orden de la Admin API a una `OrdenVenta`, con la **misma huella**
// `origen_clave` que el importador del Excel (`ventas|<unidad>|<número>`), para que una orden que ya vino por Excel no se
// duplique. Lógica pura; la lectura y el guardado viven en `sincronizar-shopify.ts`. Prueba en `shopify.test.ts`.
//
// Configuración (solo servidor): `SHOPIFY_TIENDAS` = JSON `[{"tienda":"OFERFY","dominio":"x.myshopify.com","token":"…"}]`.

import { huella } from "./libro-excel";
import { normalizar } from "./clasificacion";
import { llaveOrden, unidadDeTienda, type EstadoEntrega, type MetodoPago, type OrdenVenta } from "../ventas/matriz";

export interface TiendaShopify {
  tienda: string;
  dominio: string;
  token: string;
}

/** Las tiendas configuradas (las que no tienen dominio `*.myshopify.com` válido o token se descartan). */
export function leerTiendasShopify(json: string | undefined): TiendaShopify[] {
  if (!json) return [];
  let v: unknown;
  try {
    v = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    if (!x || typeof x !== "object") return [];
    const o = x as Record<string, unknown>;
    const tienda = typeof o.tienda === "string" ? o.tienda.trim().slice(0, 80) : "";
    const dominio = typeof o.dominio === "string" ? o.dominio.trim().toLowerCase() : "";
    const token = typeof o.token === "string" ? o.token.trim() : "";
    return tienda && /^[a-z0-9][a-z0-9-]{0,60}\.myshopify\.com$/.test(dominio) && token ? [{ tienda, dominio, token }] : [];
  });
}

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const txt = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Lo reembolsado de una orden (suma de las transacciones de sus reembolsos). */
export function reembolsado(orden: Record<string, unknown>): number {
  const refunds = Array.isArray(orden.refunds) ? orden.refunds : [];
  let total = 0;
  for (const r of refunds) {
    const trans = r && typeof r === "object" && Array.isArray((r as Record<string, unknown>).transactions) ? ((r as Record<string, unknown>).transactions as unknown[]) : [];
    for (const t of trans) {
      const o = (t ?? {}) as Record<string, unknown>;
      if (o.kind === "refund" && o.status !== "failure" && o.status !== "error") total += num(o.amount);
    }
  }
  return Math.round(total * 100) / 100;
}

/** El estado de entrega que se deduce de Shopify (lo fino —entregada, devuelta— lo sigue poniendo el Excel o el reparto). */
export function estadoDeShopify(o: Record<string, unknown>): EstadoEntrega {
  if (o.cancelled_at) return "cancelada";
  if (o.financial_status === "refunded") return "devuelta";
  if (o.fulfillment_status === "fulfilled") return "en_transito";
  return "pendiente";
}

export function metodoDeShopify(o: Record<string, unknown>): MetodoPago | null {
  const nombres = Array.isArray(o.payment_gateway_names) ? o.payment_gateway_names.map(String).join(" ") : String(o.gateway ?? "");
  const t = normalizar(nombres);
  if (!t) return null;
  if (/CASH ON DELIVERY|CONTRA ENTREGA|COD|EFECTIVO/.test(t)) return "efectivo";
  if (/YAPPY/.test(t)) return "yappy";
  if (/TRANSFER|ACH|BANCO/.test(t)) return "transferencia";
  if (/STRIPE|SHOPIFY PAYMENTS|CARD|TARJETA|PAYPAL|MIPOS/.test(t)) return "tarjeta";
  return "otro";
}

/** Una orden de la Admin API como `OrdenVenta` (la huella de contenido cambia si cambia algo de la orden). */
export function ordenDeShopify(tienda: string, o: Record<string, unknown>): OrdenVenta | null {
  const nombre = txt(o.name, 40);
  const creada = typeof o.created_at === "string" ? o.created_at : null;
  if (!nombre || !creada) return null;
  // La fecha en hora de Panamá (Shopify la manda con su zona).
  const fecha = new Date(creada).toLocaleDateString("en-CA", { timeZone: "America/Panama" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const unidad = unidadDeTienda(tienda);
  const items = Array.isArray(o.line_items) ? o.line_items : [];
  const lineas = items.slice(0, 60).flatMap((x, i) => {
    const l = (x ?? {}) as Record<string, unknown>;
    const producto = txt(l.title, 300);
    if (!producto) return [];
    const cantidad = Math.max(1, Math.min(100_000, num(l.quantity) || 1));
    const clave = normalizar(producto);
    return [{ linea: i + 1, producto, producto_clave: clave, cantidad, sku: txt(l.sku, 80), costo_excel: null, es_servicio: /^(ENVIO\b|ENVIO PRIORITARIO|GARANTIA|PROTECCION|SEGURO DE ENVIO)/.test(clave) }];
  });
  if (!lineas.length) return null;
  const envio = num((o.total_shipping_price_set as { shop_money?: { amount?: unknown } } | undefined)?.shop_money?.amount);
  const total = Math.max(0, Math.round((num(o.total_price) - reembolsado(o)) * 100) / 100);
  const dir = (o.shipping_address ?? o.billing_address ?? {}) as Record<string, unknown>;
  const llave = llaveOrden(unidad, nombre);
  const orden: Omit<OrdenVenta, "huella_contenido"> = {
    tienda: unidad,
    creado_origen: new Date(creada).toISOString(),
    numero: nombre.toUpperCase(),
    fecha,
    periodo: `${fecha.slice(0, 7)}-01`,
    estado_pago: txt(o.financial_status, 30)?.toUpperCase() ?? null,
    estado_entrega: estadoDeShopify(o),
    metodo_pago: metodoDeShopify(o),
    forma_pago_texto: Array.isArray(o.payment_gateway_names) ? (o.payment_gateway_names.map(String).join(", ").slice(0, 80) || null) : null,
    informe_servientrega: null,
    transportista: null,
    guia: null,
    fecha_envio: null,
    fecha_devolucion: null,
    resultado_courier: null,
    subtotal: num(o.subtotal_price),
    envio,
    descuento: num(o.total_discounts),
    total,
    costo_envio: 0,
    facturado: false,
    factura_numero: null,
    mes_gestion: null,
    motivo_cancelacion: txt(o.cancel_reason, 200),
    etiquetas: txt(o.tags, 300),
    lineas,
    cliente: {
      nombre: txt([dir.first_name, dir.last_name].filter((x) => typeof x === "string").join(" "), 200),
      telefono: txt(dir.phone ?? o.phone, 40),
      direccion: txt([dir.address1, dir.address2].filter((x) => typeof x === "string").join(", "), 500),
      corregimiento: txt(dir.city, 200),
      notas: txt(o.note, 500),
    },
    origen_clave: huella(`ventas|${llave}`),
  };
  return { ...orden, huella_contenido: huella(JSON.stringify(orden)), despachada_en: despachoDeShopify(o) };
}

/** Cuándo se preparó en Shopify: el primer «fulfillment» que no se canceló (14 nov 2026); null si no hay. */
export function despachoDeShopify(o: Record<string, unknown>): string | null {
  const fs = Array.isArray(o.fulfillments) ? (o.fulfillments as Record<string, unknown>[]) : [];
  const fechas = fs
    .filter((f) => f && f.status !== "cancelled" && typeof f.created_at === "string")
    .map((f) => Date.parse(String(f.created_at)))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  return fechas.length ? new Date(fechas[0]).toISOString() : null;
}

/** La página siguiente del encabezado `Link` de Shopify (`<…page_info=…>; rel="next"`), o null. */
export function siguientePagina(link: string | null): string | null {
  if (!link) return null;
  for (const parte of link.split(",")) {
    const m = parte.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (m && /^https:\/\/[a-z0-9-]+\.myshopify\.com\//.test(m[1])) return m[1];
  }
  return null;
}
