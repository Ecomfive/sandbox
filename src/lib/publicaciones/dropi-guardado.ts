// Cambiar el nombre de un producto en Dropi desde el sistema (pedido de Hernán, 22 oct 2026). Dropi no tiene una API de proveedor:
// su pantalla «Actualizar producto» guarda con `PUT api/products/<id>` mandando el producto COMPLETO, y lo que no vaya se puede
// perder. Por eso el cuerpo se arma igual que el de la pantalla a partir de lo que devuelve `GET api/products/<id>` (comprobado el
// 22 oct 2026 atrapando el guardado de la pantalla, sin enviarlo, con el 8179 y el 7587): mismos 29 campos y en el mismo orden,
// precios y medidas como números, y en `warehouselected` las bodegas del producto y después las del proveedor. Solo se cambian el
// nombre y el nombre de la guía de envío. Un producto con variaciones no se toca (su pantalla manda atributos que aquí no se arman).
// Sin base ni red, con prueba.

/** Lo que Dropi admite en «Nombre del producto» y en «Nombre del producto en la guía de envío». */
export const MAX_NOMBRE_DROPI = 40;
/** El mínimo de caracteres que Dropi pide en la descripción de un producto. */
export const MIN_DESCRIPCION_DROPI = 200;

/** El usuario (`sub`) y el vencimiento (`exp`) de una sesión de Dropi (un JWT), sin validar la firma. `null` si no lo parece. */
export function leerTokenDropi(token: string): { usuarioId: number; venceEn: Date } | null {
  const partes = typeof token === "string" ? token.split(".") : [];
  if (partes.length !== 3) return null;
  try {
    const p = JSON.parse(Buffer.from(partes[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { sub?: unknown; exp?: unknown };
    const usuarioId = Number(p.sub);
    const exp = Number(p.exp);
    if (!Number.isInteger(usuarioId) || usuarioId <= 0 || !Number.isFinite(exp)) return null;
    return { usuarioId, venceEn: new Date(exp * 1000) };
  } catch {
    return null;
  }
}

type Obj = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined || v === "" ? v : Number(v));

/**
 * El cuerpo del `PUT api/products/<id>` de Dropi para cambiar el nombre (y el de la guía de envío) de un producto: lo mismo que
 * manda la pantalla de Dropi con el producto tal como está, salvo esos dos campos. `producto` = `objects` del GET del producto;
 * `bodegasProveedor` = las bodegas del usuario (`GET api/users/<id>` › `objects.warehouses`). Error si el producto tiene variaciones.
 */
export function armarGuardadoProducto(
  producto: Obj,
  bodegasProveedor: Obj[],
  /** Lo que se cambia: el nombre (y el de la guía), el precio, el precio sugerido y la descripción. `null` o sin poner = se deja como está. */
  cambio: { nombre: string | null; nombreGuia: string | null; precio?: number | null; precioSugerido?: number | null; descripcion?: string | null },
): { cuerpo: Obj } | { error: string } {
  if (producto.type !== "SIMPLE") return { error: "Tiene variaciones: cámbialo a mano en Dropi." };
  if (cambio.nombre !== null && (!cambio.nombre.trim() || cambio.nombre.length > MAX_NOMBRE_DROPI)) return { error: `El nombre debe tener de 1 a ${MAX_NOMBRE_DROPI} caracteres.` };
  const precio = cambio.precio ?? null;
  const sugerido = cambio.precioSugerido ?? null;
  if ((precio !== null && !(precio > 0)) || (sugerido !== null && !(sugerido > 0))) return { error: "El precio debe ser mayor que cero." };
  const precioFinal = precio ?? Number(producto.sale_price);
  let sugeridoFinal = sugerido ?? Number(producto.suggested_price);
  // Dropi no deja un sugerido menor que el precio: si se sube el precio por encima del sugerido (y no se pidió otro sugerido), el
  // sugerido sube con la misma proporción que tenía sobre el precio anterior (igual al precio si eran iguales).
  let sugeridoAjustado: number | null = null;
  if (precio !== null && sugerido === null && sugeridoFinal > 0 && sugeridoFinal < precioFinal) {
    const anterior = Number(producto.sale_price);
    const proporcion = anterior > 0 ? Math.max(1, sugeridoFinal / anterior) : 1;
    sugeridoAjustado = Math.round(precioFinal * proporcion * 100) / 100;
    sugeridoFinal = sugeridoAjustado;
  }
  if ((precio !== null || sugerido !== null) && sugeridoFinal > 0 && sugeridoFinal < precioFinal) return { error: `El precio sugerido ($${sugeridoFinal.toFixed(2)}) quedaría menor que el precio ($${precioFinal.toFixed(2)}).` };
  if (cambio.nombreGuia !== null && cambio.nombreGuia.length > MAX_NOMBRE_DROPI) return { error: `El nombre de la guía admite ${MAX_NOMBRE_DROPI} caracteres.` };
  // Dropi pide una descripción de 200 caracteres como mínimo (se cuenta el texto, sin etiquetas).
  const descripcion = cambio.descripcion ?? null;
  if (descripcion !== null && descripcion.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().length < MIN_DESCRIPCION_DROPI) return { error: `La descripción necesita al menos ${MIN_DESCRIPCION_DROPI} caracteres.` };
  const bodegas: Obj[] = (Array.isArray(producto.warehouse_product) ? (producto.warehouse_product as Obj[]) : []).map((w) => {
    const b = (w.warehouse ?? {}) as Obj;
    return { warehouse_id: w.warehouse_id, fullName: `${b.name ?? ""}(${b.address ?? ""})`, stock: w.stock, city: b.city, warehouse_white_brand: !!b.warehouse_white_brand };
  });
  for (const b of bodegasProveedor) {
    if (!bodegas.some((x) => x.warehouse_id === b.id)) bodegas.push({ fullName: `${b.name}(${b.address})`, warehouse_id: b.id, warehouse_white_brand: !!b.warehouse_white_brand });
  }
  return {
    cuerpo: {
      id: producto.id,
      name: cambio.nombre ?? producto.name,
      description: descripcion ?? producto.description,
      dropi_app_description: producto.dropi_app_description,
      type: producto.type,
      sale_price: precio ?? num(producto.sale_price),
      suggested_price: sugerido ?? sugeridoAjustado ?? num(producto.suggested_price),
      user_id: producto.user_id,
      privated_product: producto.privated_product,
      active: producto.active,
      sku: producto.sku,
      weight: num(producto.weight),
      length: num(producto.length),
      width: num(producto.width),
      height: num(producto.height),
      attribute: [],
      variations: producto.variations,
      categories: producto.categories,
      add_stock_in_return: producto.add_stock_in_return,
      private_product_inventories: producto.private_product_inventories,
      user_profit_percentage_product: producto.user_profit_percentage_product,
      is_warehouse_white_brand: producto.is_warehouse_white_brand,
      warehouselected: bodegas,
      warehouse_previus: null,
      controlChangesPhotos: [],
      name_in_guide: cambio.nombreGuia ?? producto.name_in_guide ?? "",
      shipping_method: producto.shipping_method,
      bar_code: producto.bar_code,
      dropi_product_supplier_increment_fixed: producto.dropi_product_supplier_increment_fixed,
    },
  };
}

/** Si Dropi ya muestra el cambio (después de guardarlo se vuelve a leer el producto): `null` si sí, o qué no coincide. */
export function faltaEnDropi(producto: Obj, cambio: { nombre: string; nombreGuia: string | null }): string | null {
  if (producto.name !== cambio.nombre) return `Dropi sigue mostrando el nombre «${String(producto.name ?? "")}».`;
  if (cambio.nombreGuia !== null && producto.name_in_guide !== cambio.nombreGuia) return `Dropi sigue mostrando en la guía «${String(producto.name_in_guide ?? "")}».`;
  return null;
}
