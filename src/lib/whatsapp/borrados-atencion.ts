// Lo que se borra en WhatsApp Business (un mensaje «para todos» o un chat entero) y qué parte de eso se le borra a Atención (30 oct 2026, pedido de Jhokser).
// Quien tiene únicamente Atención (`pierdeLoBorrado`, `src/lib/crm/areas.ts`) deja de ver el mensaje eliminado y el chat borrado, como en WhatsApp; Comercial, Dirección y los
// administradores lo siguen viendo intacto con su marca. Lógica pura: la lectura de la base está en `ocultos.ts`.

/** Un chat marcado como borrado en la app (`corte` = cuándo se marcó) sigue a la vista de Atención solo si llegó un mensaje después: es lo que hace WhatsApp. */
export function chatVisibleParaAtencion(ultimoMensajeEn: string | null, corte: string | null): boolean {
  if (!corte) return true;
  if (!ultimoMensajeEn) return false;
  return new Date(ultimoMensajeEn).getTime() > new Date(corte).getTime();
}

/** Un mensaje sigue a la vista de Atención si nadie lo eliminó en WhatsApp y no es de antes de que se borrara el chat. */
export function mensajeVisibleParaAtencion(m: { id: string; momento: string }, eliminados: ReadonlySet<string>, corte: string | null): boolean {
  if (eliminados.has(m.id)) return false;
  if (corte && new Date(m.momento).getTime() <= new Date(corte).getTime()) return false;
  return true;
}
