// La nota que el bot de iComfly deja al crear un pedido en Shopify (16 nov 2026, pedido de Hernán): «Pedido #89311 - Venta por bot - WhatsApp +50764641958». Despacho imprime las notas de los pedidos
// confirmados para armar los tickets de los paquetes y esa línea los entorpece; hoy la quita un asesor a mano. Aquí, sin base ni red, cómo se reconoce y cómo queda la nota sin ella. Con prueba.

// Una línea es del bot solo si es exactamente así: «Pedido #<número> - Venta por bot - WhatsApp <teléfono>» (guiones normales o largos, mayúsculas da igual). Cualquier otro texto no se toca.
const LINEA_DEL_BOT = /^\s*pedido\s+#?\d+\s*[-–—]\s*venta por bot\s*[-–—]\s*whatsapp\s*\+?[\d\s().-]*$/i;

/**
 * Si la nota trae la línea del bot y cómo queda sin ella. Si la nota tiene más líneas (algo que escribió una persona), esas se conservan; si solo estaba la del bot, la nota queda vacía.
 * Una nota que no es del bot sale igual (`coincide: false`).
 */
export function quitarNotaDelBot(nota: unknown): { coincide: boolean; notaNueva: string } {
  const original = typeof nota === "string" ? nota : "";
  const lineas = original.split(/\r?\n/);
  const restantes = lineas.filter((l) => !LINEA_DEL_BOT.test(l));
  if (restantes.length === lineas.length) return { coincide: false, notaNueva: original };
  return { coincide: true, notaNueva: restantes.join("\n").trim() };
}
