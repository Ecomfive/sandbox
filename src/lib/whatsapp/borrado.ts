// Borrar un chat o un mensaje de WhatsApp (2 nov 2026, pedido de Jhokser: sin autorización, como en WhatsApp Business). Antes se pedía con un motivo y lo autorizaba
// la persona por encima (28 oct 2026); ahora cualquiera que pueda escribir en el chat lo borra y queda anotado quién. Lo que hay que decidir sin tocar la base
// (src/lib/whatsapp/borrado.test.ts): cómo se dicen en pantalla un mensaje o un chat borrado. A quién se le quita lo borrado está en `borrados-atencion.ts`.

/** Un mensaje en una línea y corto, para mostrarlo en la lista de borrados o en la confirmación. */
export function vistaPreviaTexto(texto: string | null | undefined, max = 120): string {
  const t = (texto ?? "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Lo que dice un mensaje borrado a quien sí puede verlo. `por` es quien lo borró desde el sistema (null: lo eliminó su autor en WhatsApp, o el equipo desde la app
 * del celular, y Meta no dice quién). `nuestro` es un mensaje que mandamos nosotros.
 */
export function textoDeMensajeBorrado(por: string | null, nuestro: boolean): string {
  if (por) return `Lo borró ${por} desde el sistema. Aquí se conserva.`;
  return nuestro ? "Se eliminó desde la app de WhatsApp Business (Meta no dice quién). Aquí se conserva." : "Lo eliminó en WhatsApp quien lo mandó. Aquí se conserva.";
}

/** La etiqueta corta de un chat borrado (en la lista y arriba del chat). */
export const etiquetaDeChatBorrado = (desdeSistema: boolean, por: string | null): string => (desdeSistema ? (por ? `Borrado por ${por}` : "Borrado") : "Borrado en la app");
