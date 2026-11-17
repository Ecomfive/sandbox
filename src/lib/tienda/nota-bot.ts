// La nota que el bot de iComfly deja al crear un pedido en Shopify (16 nov 2026, pedido de Hernán): «Pedido #89311 - Venta por bot - WhatsApp +50764641958». Despacho imprime las notas de los pedidos
// confirmados para armar los tickets de los paquetes y esa línea los entorpece; hoy la quita un asesor a mano. Aquí, sin base ni red, cómo se reconoce y cómo queda la nota sin ella. Con prueba.

// Una línea es solo del bot si es exactamente así: «Pedido #<número> - Venta por bot - WhatsApp <teléfono>» (guiones normales o largos, mayúsculas da igual). Cualquier otro texto no se toca.
const LINEA_DEL_BOT = /^\s*pedido\s+#?\d+\s*[-–—]\s*venta por bot\s*[-–—]\s*whatsapp\s*\+?[\d\s().-]*$/i;

// Cuando el cliente deja un comentario al pedir, el bot lo pega en la misma línea, detrás del teléfono: «Pedido #56960 - Venta por bot - WhatsApp +50769345035, Sábado 31/10 la entrega» (17 nov 2026: 12 de 123
// pedidos de las tiendas). Ahí solo se quita el encabezado del bot y se conserva el comentario, que a Despacho le sirve. El teléfono va pegado (sin espacios) para no llevarse números del comentario.
const PREFIJO_DEL_BOT = /^\s*pedido\s+#?\d+\s*[-–—]\s*venta por bot\s*[-–—]\s*whatsapp\s*\+?\d{7,15}(?=$|[\s,;:.\-–—])[\s,;:.\-–—]*/i;

/**
 * Si la nota trae la línea del bot y cómo queda sin ella. Una línea que es solo la del bot se quita entera; si trae un comentario del cliente detrás del teléfono, se quita el encabezado y el comentario se
 * conserva. Si la nota tiene más líneas (algo que escribió una persona), esas se conservan; si solo estaba la del bot, la nota queda vacía. Una nota que no es del bot sale igual (`coincide: false`).
 */
export function quitarNotaDelBot(nota: unknown): { coincide: boolean; notaNueva: string } {
  const original = typeof nota === "string" ? nota : "";
  let coincide = false;
  const restantes: string[] = [];
  for (const l of original.split(/\r?\n/)) {
    if (LINEA_DEL_BOT.test(l)) {
      coincide = true;
      continue;
    }
    const m = PREFIJO_DEL_BOT.exec(l);
    if (m) {
      coincide = true;
      const resto = l.slice(m[0].length).trim();
      if (resto) restantes.push(resto);
      continue;
    }
    restantes.push(l);
  }
  return coincide ? { coincide: true, notaNueva: restantes.join("\n").trim() } : { coincide: false, notaNueva: original };
}
