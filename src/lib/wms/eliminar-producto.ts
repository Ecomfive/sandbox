// Eliminar un producto (migración 0125, `wms_eliminar_producto`): la base solo lo borra si nada depende de él y, si algo lo
// bloquea, dice qué tabla y cuántas filas. Aquí se traduce eso a palabras para quien lo intenta. Lógica pura, con su prueba.

/** Lo que significa cada tabla (o `tabla.columna`) que apunta a un producto, dicho como lo ve el equipo: [uno, varios]. */
const NOMBRE_BLOQUEO: Record<string, [string, string]> = {
  wms_movimientos: ["movimiento de inventario", "movimientos de inventario"],
  wms_lotes: ["lote", "lotes"],
  wms_stock: ["registro de stock", "registros de stock"],
  wms_stock_ubicacion: ["registro de stock", "registros de stock"],
  wms_compra_items: ["compra", "compras"],
  wms_compras: ["compra", "compras"],
  dropi_publicaciones: ["publicación de Dropi", "publicaciones de Dropi"],
  wms_productos_test: ["test de Test productos", "tests de Test productos"],
  wms_filtro_productos: ["producto de Filtro de productos", "productos de Filtro de productos"],
  wms_producto_variantes: ["ficha de Shopify", "fichas de Shopify"],
  wms_dropi_productos: ["ficha de Dropi", "fichas de Dropi"],
  dropi_variaciones_vinculo: ["vínculo hecho a mano con una variación de Dropi", "vínculos hechos a mano con variaciones de Dropi"],
  productos: ["producto de pedidos", "productos de pedidos"],
  "skus_maestros.padre_id": ["variante", "variantes"],
  "sku_maestro_componentes.componente_id": ["compuesto que lo usa", "compuestos que lo usan"],
};

/** El nombre de lo que bloquea (`tabla.columna` de la base), en singular y plural; si no se conoce, el nombre de la tabla. */
export function nombreBloqueo(clave: string): [string, string] {
  const conocido = NOMBRE_BLOQUEO[clave] ?? NOMBRE_BLOQUEO[clave.split(".")[0]];
  if (conocido) return conocido;
  const tabla = clave.split(".")[0].replace(/_/g, " ");
  return [tabla, tabla];
}

/**
 * «No se puede eliminar ABC: lo usan 3 compras, 1 publicación de Dropi…»: una frase con lo que lo bloquea (lo que cae en el mismo
 * nombre se suma: el stock y el stock por ubicación son «stock»).
 */
export function mensajeBloqueos(codigo: string, bloqueos: Record<string, number>): string {
  const partes = listaBloqueos(bloqueos);
  if (partes.length === 0) return `No se pudo eliminar ${codigo}.`;
  return `No se puede eliminar ${codigo}: lo usan ${partes.join(", ")}. Quita esos vínculos o pásalo a Inactivo o Descontinuado.`;
}

/**
 * Lo mismo para «Quitar» una variante (migración 0269, `wms_quitar_variante`): sus movimientos de inventario solo la bloquean si no se anulan
 * entre sí (le quedan unidades o se movieron entre bodegas sin cuadrar en cada una).
 */
export function mensajeBloqueosVariante(codigo: string, bloqueos: Record<string, number>): string {
  const { "wms_movimientos.sku_maestro_id": movimientos, ...resto } = bloqueos;
  const partes = listaBloqueos(resto);
  const motivos = [
    ...(partes.length ? [`la usan ${partes.join(", ")}`] : []),
    ...(movimientos > 0 ? ["sus movimientos de inventario no suman cero (todavía tiene unidades o se movieron entre bodegas)"] : []),
  ];
  if (motivos.length === 0) return `No se pudo quitar la variante ${codigo}.`;
  return `No se puede quitar la variante ${codigo}: ${motivos.join(" y ")}. Si ya no se usa, déjala en 0 o pásala a Inactivo.`;
}

/** «3 compras, 1 publicación de Dropi»: lo que bloquea, de más a menos (lo que cae en el mismo nombre se suma). */
function listaBloqueos(bloqueos: Record<string, number>): string[] {
  const suma = new Map<string, { n: number; nombre: [string, string] }>();
  for (const [clave, n] of Object.entries(bloqueos)) {
    if (!(n > 0)) continue;
    const nombre = nombreBloqueo(clave);
    const antes = suma.get(nombre[0]);
    suma.set(nombre[0], { n: (antes?.n ?? 0) + n, nombre });
  }
  return [...suma.values()].sort((a, b) => b.n - a.n).map(({ n, nombre }) => `${n} ${n === 1 ? nombre[0] : nombre[1]}`);
}
