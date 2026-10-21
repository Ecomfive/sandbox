/** Una persona con acceso a una sección, y con qué nivel (viene de su rol). */
export interface PersonaConAcceso {
  id: string;
  nombre: string | null;
  email: string;
  avatarUrl: string | null;
  rol: string;
  soloLectura: boolean;
}

export interface AccesoSeccion {
  personas: PersonaConAcceso[];
  /** Quien consulta es la persona con este id (para marcarla como "Tú"). */
  yoId: string;
  /** Quien consulta puede cambiar permisos (tiene el módulo Usuarios y roles). */
  puedeAdministrar: boolean;
}

export interface PermisoDeRol {
  rol_id: string;
  solo_lectura: boolean;
  rol: string;
}

export interface PerfilConRol {
  id: string;
  nombre: string | null;
  email: string;
  avatar_url: string | null;
  rol_id: string | null;
  activo: boolean;
}

const nombreVisible = (p: { nombre: string | null; email: string }) => (p.nombre?.trim() || p.email).toLowerCase();

/** Lo propio de una persona sobre el módulo (Usuarios y roles › Permisos propios): manda sobre lo que da su rol. */
export interface PermisoPropioDeModulo {
  perfil_id: string;
  nivel: "ninguno" | "lectura" | "edicion";
}

/**
 * Quién puede entrar a un módulo: las personas activas cuyo rol tiene ese módulo, o a quienes se les dio aparte, y no las que
 * tienen un permiso propio de «sin acceso». Se ordenan por rol y, dentro de cada rol, por nombre; así la lista se lee agrupada y
 * no cambia de una carga a otra.
 */
export function armarPersonasConAcceso(
  perfiles: PerfilConRol[],
  permisos: PermisoDeRol[],
  propios: PermisoPropioDeModulo[] = [],
  nombresDeRol: Map<string, string> = new Map(),
): PersonaConAcceso[] {
  const porRol = new Map(permisos.map((p) => [p.rol_id, p]));
  const propioDe = new Map(propios.map((p) => [p.perfil_id, p]));
  const lista: PersonaConAcceso[] = [];
  for (const p of perfiles) {
    if (!p.activo) continue;
    const propio = propioDe.get(p.id);
    const delRol = p.rol_id !== null ? porRol.get(p.rol_id) : undefined;
    const rol = delRol?.rol ?? (p.rol_id ? (nombresDeRol.get(p.rol_id) ?? "Sin rol") : "Sin rol");
    if (propio) {
      if (propio.nivel === "ninguno") continue;
      lista.push({ id: p.id, nombre: p.nombre, email: p.email, avatarUrl: p.avatar_url, rol, soloLectura: propio.nivel === "lectura" });
    } else if (delRol) {
      lista.push({ id: p.id, nombre: p.nombre, email: p.email, avatarUrl: p.avatar_url, rol: delRol.rol, soloLectura: delRol.solo_lectura });
    }
  }
  return lista.sort((a, b) => a.rol.localeCompare(b.rol, "es") || nombreVisible(a).localeCompare(nombreVisible(b), "es"));
}
