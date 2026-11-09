/**
 * Equipo › Tareas › «Mis tareas por módulo» (9 nov 2026, pedido de Hernán: «un repositorio de tareas donde vea las que tengo en cada módulo por separado,
 * para cada rol, según el acceso que tengo»). Junta las tareas abiertas de la persona que viven en cada módulo (el tablero del equipo, Gestión de IDs Dropi
 * —las escritas a mano y las recomendaciones aceptadas— y el CRM de dropshippers) y las agrupa por el módulo de donde son. Lógica pura, con prueba.
 */

export type OrigenTarea = "equipo" | "dropi" | "recomendacion" | "crm";

export interface TareaDeModulo {
  origen: OrigenTarea;
  id: string;
  titulo: string;
  /** Sobre qué es: la publicación, el cliente, o «Tablero del equipo». */
  detalle: string | null;
  /** El país, cuando el módulo trabaja por país (Gestión de IDs Dropi). */
  pais: string | null;
  /** Para cuándo (AAAA-MM-DD) o null. */
  plazo: string | null;
  /** El estado como lo dice su módulo («En curso», «Por hacer»…). */
  estado: string;
  /** La clave del módulo de donde es (la de los permisos: «publicaciones-dropi», «crm-dropshippers», «tareas»…). */
  modulo: string;
  /** Dónde se abre. */
  href: string;
}

export interface GrupoModulo {
  modulo: string;
  etiqueta: string;
  tareas: TareaDeModulo[];
  atrasadas: number;
  paraHoy: number;
}

export type Cuando = "atrasada" | "hoy" | "manana" | "despues" | "sin_fecha";

/** Cuándo vence, contra el día de hoy (AAAA-MM-DD). */
export function cuando(plazo: string | null, hoy: string): Cuando {
  if (!plazo) return "sin_fecha";
  const p = plazo.slice(0, 10);
  if (p < hoy) return "atrasada";
  if (p === hoy) return "hoy";
  const manana = new Date(Date.parse(`${hoy}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return p === manana ? "manana" : "despues";
}

const ORDEN_CUANDO: Record<Cuando, number> = { atrasada: 0, hoy: 1, manana: 2, despues: 3, sin_fecha: 4 };

/** El módulo del tablero del equipo: ahí cae una tarea del tablero sin módulo, o de un módulo al que la persona no tiene acceso. */
export const MODULO_EQUIPO = "tareas";

/**
 * Agrupa por módulo. Una tarea solo sale en un módulo al que la persona tiene acceso; una del tablero del equipo que nombra un módulo sin acceso queda en el
 * del equipo. Dentro de cada módulo, primero las atrasadas, después por fecha y al final las sin fecha. Los módulos con algo atrasado van primero; después,
 * por nombre.
 */
export function agruparPorModulo(
  tareas: readonly TareaDeModulo[],
  opciones: { modulosConAcceso: readonly string[]; etiquetas: Readonly<Record<string, string>>; hoy: string },
): GrupoModulo[] {
  const acceso = new Set(opciones.modulosConAcceso);
  const grupos = new Map<string, TareaDeModulo[]>();
  for (const t of tareas) {
    const modulo = acceso.has(t.modulo) ? t.modulo : t.origen === "equipo" ? MODULO_EQUIPO : null;
    if (!modulo) continue;
    grupos.set(modulo, [...(grupos.get(modulo) ?? []), t]);
  }
  const etiqueta = (m: string) => (m === MODULO_EQUIPO ? "Tablero del equipo" : (opciones.etiquetas[m] ?? m));
  return [...grupos]
    .map(([modulo, lista]) => {
      const ordenadas = [...lista].sort(
        (a, b) => ORDEN_CUANDO[cuando(a.plazo, opciones.hoy)] - ORDEN_CUANDO[cuando(b.plazo, opciones.hoy)] || (a.plazo ?? "").localeCompare(b.plazo ?? "") || a.titulo.localeCompare(b.titulo, "es"),
      );
      return {
        modulo,
        etiqueta: etiqueta(modulo),
        tareas: ordenadas,
        atrasadas: ordenadas.filter((t) => cuando(t.plazo, opciones.hoy) === "atrasada").length,
        paraHoy: ordenadas.filter((t) => cuando(t.plazo, opciones.hoy) === "hoy").length,
      };
    })
    .sort((a, b) => Number(b.atrasadas > 0) - Number(a.atrasadas > 0) || a.etiqueta.localeCompare(b.etiqueta, "es"));
}
