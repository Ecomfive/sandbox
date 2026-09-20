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

/**
 * Quién puede entrar a un módulo: las personas activas cuyo rol tiene ese módulo. Se ordenan por
 * rol y, dentro de cada rol, por nombre; así la lista se lee agrupada y no cambia de una carga a otra.
 */
export function armarPersonasConAcceso(perfiles: PerfilConRol[], permisos: PermisoDeRol[]): PersonaConAcceso[] {
  const porRol = new Map(permisos.map((p) => [p.rol_id, p]));
  return perfiles
    .filter((p) => p.activo && p.rol_id !== null && porRol.has(p.rol_id))
    .map((p) => {
      const permiso = porRol.get(p.rol_id!)!;
      return {
        id: p.id,
        nombre: p.nombre,
        email: p.email,
        avatarUrl: p.avatar_url,
        rol: permiso.rol,
        soloLectura: permiso.solo_lectura,
      };
    })
    .sort((a, b) => a.rol.localeCompare(b.rol, "es") || nombreVisible(a).localeCompare(nombreVisible(b), "es"));
}
