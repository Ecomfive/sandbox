// La nota de la novedad vigente de un retiro, sacada de su historial. Sin React, para poder probarla.

/** Lo mínimo que hace falta de un evento del historial (`EventoRetiro`, `retiros/actividad.ts`). */
export interface EventoParaNovedad {
  evento: string;
  creadoEn: string;
}

const PREFIJO_NOVEDAD = "Novedad:";

/**
 * La nota de la novedad que tiene ahora el retiro, o null si no hay una registrada. Recorre el historial del más
 * reciente al más viejo (así llega `obtenerActividadRetiro`) y se queda con el primer evento que dice algo de la
 * novedad:
 *  - «Novedad: …» (la que se agrega con el botón «Novedad», o la que deja una conciliación con diferencia): esa es la
 *    nota, sin el prefijo;
 *  - «Novedad resuelta…»: la novedad de antes ya se resolvió, no hay nota vigente;
 *  - «Retiro modificado … → Novedad»: se puso el estado a mano, sin nota, y una novedad vieja no la explica.
 * Si no aparece ninguno, no hay nota.
 */
export function novedadVigente(eventosRecientesPrimero: EventoParaNovedad[]): { nota: string; creadoEn: string } | null {
  for (const e of eventosRecientesPrimero) {
    const texto = e.evento.trim();
    if (texto.startsWith("Novedad resuelta")) return null;
    if (texto.startsWith(PREFIJO_NOVEDAD)) {
      const nota = texto.slice(PREFIJO_NOVEDAD.length).trim();
      return nota ? { nota, creadoEn: e.creadoEn } : null;
    }
    if (texto.startsWith("Retiro modificado") && /→\s*Novedad\s*$/.test(texto)) return null;
  }
  return null;
}
