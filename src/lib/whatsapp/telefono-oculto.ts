// El número de WhatsApp de un dropshipper no se muestra en ninguna pantalla (pedido de Jhokser, 28 oct 2026, etapa 1): solo se ve con «Mostrar número» y,
// por ahora, solo un administrador puede mostrarlo. Esta es la regla en un solo lugar: la pantalla decide si dibuja el botón con `puedeVerTelefonos` y el
// servidor la vuelve a comprobar antes de entregar el número.

/** Puede mostrar el número real: quien administra el sistema (puede modificar Usuarios y roles). */
export const puedeVerTelefonos = (u: { modulos: readonly string[]; modulosSoloLectura: readonly string[] }): boolean =>
  u.modulos.includes("usuarios") && !u.modulosSoloLectura.includes("usuarios");

/** Cómo se llama un chat que no tiene nombre (ni en el CRM ni en el perfil de WhatsApp): nunca su número, solo algo corto para distinguirlo. */
export function nombreSinNumero(id: string): string {
  const cola = id.replace(/[^0-9a-f]/gi, "").slice(-4).toUpperCase();
  return cola ? `Contacto ${cola}` : "Contacto";
}
