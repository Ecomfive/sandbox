import type { NavSection, NavSectionAnidada } from "./nav-data";

export interface Miga {
  etiqueta: string;
  /** Sin href = ubicación que no es una página (sección, plataforma) o la página actual. */
  href?: string;
}

export interface Migas {
  migas: Miga[];
  /** Página del menú que se puede marcar como favorita desde las migas (solo la página actual si es un módulo). */
  favoritoHref: string | null;
  /** Módulo (y su nombre) al que pertenece la página: de él salen los permisos que muestra "Accesos". */
  moduloHref: string | null;
  moduloEtiqueta: string | null;
}

const SIN_MIGAS: Migas = { migas: [], favoritoHref: null, moduloHref: null, moduloEtiqueta: null };

/** Páginas que no están en el menú lateral pero tienen su propio título. */
const TITULOS_APARTE: Record<string, string> = {
  "/": "Dashboard operativo",
  "/notificaciones": "Centro de notificaciones",
  "/configuracion": "Configuración del sistema",
  "/conciliaciones": "Conciliación banco vs. plataforma",
  "/sin-acceso": "Sin acceso",
};

/** Subpáginas fijas de un módulo (no dinámicas): cuelgan de su módulo y llevan este nombre. */
const SUBPAGINAS: Record<string, string> = {
  "/retiros/cuentas": "Cuentas destino",
  "/usuarios/auditoria": "Historial de auditoría",
  "/extractos/patrones": "Diccionario de patrones bancarios",
};

interface ModuloDeNav {
  href: string;
  label: string;
  seccion: string;
  grupo: string | null;
}

function modulosDeNav(seccionesPlataforma: NavSectionAnidada[], navSections: NavSection[]): ModuloDeNav[] {
  const lista: ModuloDeNav[] = [];
  for (const seccion of seccionesPlataforma) {
    for (const grupo of seccion.groups) {
      for (const item of grupo.items) {
        if (item.href) lista.push({ href: item.href, label: item.label, seccion: seccion.title, grupo: grupo.label });
      }
    }
  }
  for (const seccion of navSections) {
    for (const item of seccion.items ?? []) {
      if (item.href) lista.push({ href: item.href, label: item.label, seccion: seccion.title, grupo: null });
    }
    for (const grupo of seccion.groups ?? []) {
      for (const item of grupo.items) {
        if (item.href) lista.push({ href: item.href, label: item.label, seccion: seccion.title, grupo: grupo.label });
      }
    }
  }
  return lista;
}

function rutaDeModulo(modulo: ModuloDeNav, conEnlace: boolean): Miga[] {
  return [
    { etiqueta: modulo.seccion },
    ...(modulo.grupo ? [{ etiqueta: modulo.grupo }] : []),
    { etiqueta: modulo.label, ...(conEnlace ? { href: modulo.href } : {}) },
  ];
}

/**
 * Migas de pan de la ruta actual a partir del menú: Sección › Plataforma › Módulo (› subpágina).
 * `etiquetaDetalle` es el nombre de un registro concreto (p. ej. "Retiro #0009") que pone la propia
 * página de detalle; sin él la última miga dice "Detalle".
 */
export function construirMigas(
  pathname: string,
  seccionesPlataforma: NavSectionAnidada[],
  navSections: NavSection[],
  etiquetaDetalle?: string | null
): Migas {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  const titulo = TITULOS_APARTE[ruta];
  if (titulo) {
    // "Sin acceso" no es un módulo: no hay permisos que mostrar.
    const esModulo = ruta !== "/sin-acceso";
    return {
      migas: [{ etiqueta: titulo }],
      favoritoHref: null,
      moduloHref: esModulo ? ruta : null,
      moduloEtiqueta: esModulo ? titulo : null,
    };
  }

  const modulos = modulosDeNav(seccionesPlataforma, navSections);

  const exacto = modulos.find((m) => m.href === ruta);
  if (exacto) {
    return {
      migas: rutaDeModulo(exacto, false),
      favoritoHref: exacto.href,
      moduloHref: exacto.href,
      moduloEtiqueta: exacto.label,
    };
  }

  // Ruta más larga primero, para que un módulo con prefijo común no se lleve la subpágina de otro.
  const padre = modulos
    .filter((m) => ruta.startsWith(`${m.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (padre) {
    const etiqueta = SUBPAGINAS[ruta] ?? etiquetaDetalle ?? "Detalle";
    return {
      migas: [...rutaDeModulo(padre, true), { etiqueta }],
      favoritoHref: null,
      moduloHref: padre.href,
      moduloEtiqueta: padre.label,
    };
  }

  return SIN_MIGAS;
}
