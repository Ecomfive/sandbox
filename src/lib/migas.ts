import type { NavSection } from "./nav-data";

export interface Miga {
  etiqueta: string;
  /** Sin href = ubicación que no es una página (el área) o la página actual. */
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
  "/": "Hoy",
  "/notificaciones": "Centro de notificaciones",
  "/configuracion": "Configuración del sistema",
  "/conciliaciones": "Conciliación banco vs. plataforma",
  "/sin-acceso": "Sin acceso",
};

/** Las secciones del Centro de ayuda (`/ayuda`), en el orden en que se buscan. */
const SUBPAGINAS_AYUDA: [string, string][] = [
  ["/ayuda/glosario", "Glosario"],
  ["/ayuda/guias", "Guías"],
  ["/ayuda/universidad", "Universidad"],
  ["/ayuda/manuales", "Manuales de proceso"],
];

/** Subpáginas fijas de un módulo (no dinámicas): cuelgan de su módulo y llevan este nombre. */
const SUBPAGINAS: Record<string, string> = {
  "/retiros/cuentas": "Cuentas destino",
  "/usuarios/auditoria": "Historial de auditoría",
  "/extractos/patrones": "Diccionario de patrones bancarios",
  "/compras/dashboard": "Dashboard",
  "/compras/informe": "Informe",
  "/compras/lista": "Compras",
  "/compras/tiempos": "Tiempos y fallas",
  "/compras/envios": "Envíos",
  "/crm-dropshippers/directorio": "Dropshippers",
  "/crm-dropshippers/casos": "Casos",
  "/inventario/pistoleo": "Pistoleo",
  "/inventario/vencimientos": "Vencimientos",
  "/crm-dropshippers/vinculos": "Vínculos",
  "/productos-test/productos": "Productos",
};

interface ModuloDeNav {
  href: string;
  label: string;
  seccion: string;
}

function modulosDeNav(areas: NavSection[]): ModuloDeNav[] {
  const lista: ModuloDeNav[] = [];
  for (const area of areas) {
    for (const item of area.items) {
      if (item.href) lista.push({ href: item.href, label: item.label, seccion: area.title });
    }
  }
  return lista;
}

function rutaDeModulo(modulo: ModuloDeNav, conEnlace: boolean): Miga[] {
  return [{ etiqueta: modulo.seccion }, { etiqueta: modulo.label, ...(conEnlace ? { href: modulo.href } : {}) }];
}

/**
 * Migas de pan de la ruta actual a partir del menú: Área › Módulo (› subpágina).
 * `etiquetaDetalle` es el nombre de un registro concreto (p. ej. "Retiro #0009") que pone la propia
 * página de detalle; sin él la última miga dice "Detalle".
 */
export function construirMigas(
  pathname: string,
  areas: NavSection[],
  etiquetaDetalle?: string | null
): Migas {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  // El Centro de ayuda no es un módulo del menú ni lleva permiso: lo abre cualquiera (lo que muestra sale de sus módulos).
  if (ruta === "/ayuda" || ruta.startsWith("/ayuda/")) {
    const sub = SUBPAGINAS_AYUDA.find(([prefijo]) => ruta === prefijo || ruta.startsWith(`${prefijo}/`));
    const migas: Miga[] = ruta === "/ayuda" ? [{ etiqueta: "Centro de ayuda" }] : [{ etiqueta: "Centro de ayuda", href: "/ayuda" }];
    if (sub) migas.push(ruta === sub[0] ? { etiqueta: sub[1] } : { etiqueta: sub[1], href: sub[0] }, ...(ruta === sub[0] ? [] : [{ etiqueta: etiquetaDetalle ?? "Detalle" }]));
    return { migas, favoritoHref: null, moduloHref: "/ayuda", moduloEtiqueta: "Centro de ayuda" };
  }

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

  const modulos = modulosDeNav(areas);

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
