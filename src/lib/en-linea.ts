// Quién está en línea (18 nov 2026): lo comparten la barra de arriba (cliente) y `quienesEnLinea` (servidor).

/** Admin y CEO (por el nombre del rol, la misma regla del aviso de pedidos nuevos): los únicos que ven quién está en línea en la barra de arriba. */
export const veEnLinea = (rolNombre: string | null | undefined): boolean => ["admin", "ceo"].includes((rolNombre ?? "").trim().toLowerCase());

export interface PersonaEnLinea {
  id: string;
  nombre: string;
  avatarUrl: string | null;
  /** La página donde estuvo en los últimos minutos (si estaba usando el sistema). */
  pagina: string | null;
}
