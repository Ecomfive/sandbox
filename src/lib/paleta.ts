// Lógica del buscador con atajo (Ctrl K): qué páginas se pueden buscar, cómo se filtran, cuáles son las
// recientes y cómo se mueve la selección con el teclado. Sin React, para poder probarla.

import { normalizar } from "@/lib/tabla/motor";
import { moduloDeHref, type NavSection, type NavSectionAnidada } from "@/lib/nav-data";
import { PESTANAS_POR_MODULO } from "@/lib/pestanas";

export interface PaginaBuscable {
  etiqueta: string;
  href: string;
  /** Dónde está en el menú ("Proveeduría › Dropi"), para distinguir y para buscar. */
  contexto: string;
}

/** Páginas fijas que no salen de las secciones del menú (van arriba y abajo del menú lateral). */
const PAGINAS_FIJAS: PaginaBuscable[] = [
  { etiqueta: "Dashboard operativo", href: "/", contexto: "Inicio" },
  { etiqueta: "Centro de notificaciones", href: "/notificaciones", contexto: "Inicio" },
  { etiqueta: "Configuración del sistema", href: "/configuracion", contexto: "Sistema" },
];

/**
 * Todas las páginas a las que esta persona puede ir: las del menú (y las subpáginas de cada módulo, como
 * «Cuentas destino»), solo las de los módulos a los que tiene acceso. `permitidos` null = todas.
 */
export function paginasBuscables(
  secciones: NavSectionAnidada[],
  navSections: NavSection[],
  permitidos: string[] | null
): PaginaBuscable[] {
  const puede = (href: string) => !permitidos || permitidos.includes(moduloDeHref(href));
  const paginas: PaginaBuscable[] = [];
  const vistos = new Set<string>();
  const agregar = (pagina: PaginaBuscable, revisarPermiso = true) => {
    if (vistos.has(pagina.href) || (revisarPermiso && !puede(pagina.href))) return;
    vistos.add(pagina.href);
    paginas.push(pagina);
  };

  for (const fija of PAGINAS_FIJAS) agregar(fija);
  for (const seccion of secciones) {
    for (const grupo of seccion.groups) {
      for (const item of grupo.items) {
        if (item.href && !item.pronto) agregar({ etiqueta: item.label, href: item.href, contexto: `${seccion.title} › ${grupo.label}` });
      }
    }
  }
  for (const seccion of navSections) {
    for (const item of seccion.items) {
      if (item.href && !item.pronto) agregar({ etiqueta: item.label, href: item.href, contexto: seccion.title });
    }
  }
  // Subpáginas (las pestañas del módulo): siguen el permiso del módulo al que pertenecen.
  for (const [moduloHref, pestanas] of Object.entries(PESTANAS_POR_MODULO)) {
    const modulo = paginas.find((p) => p.href === moduloHref);
    if (!modulo) continue;
    // El permiso ya se comprobó con el módulo (una subpágina no es un módulo aparte).
    for (const pestana of pestanas.slice(1)) {
      agregar({ etiqueta: pestana.etiqueta, href: pestana.href, contexto: `${modulo.contexto} › ${modulo.etiqueta}` }, false);
    }
  }
  return paginas;
}

/** Páginas que contienen todas las palabras escritas; primero las que empiezan por ellas. */
export function filtrarPaginas(paginas: PaginaBuscable[], texto: string, limite = 6): PaginaBuscable[] {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];
  const puntuadas: { pagina: PaginaBuscable; puntos: number; orden: number }[] = [];
  paginas.forEach((pagina, orden) => {
    const etiqueta = normalizar(pagina.etiqueta);
    const todo = `${etiqueta} ${normalizar(pagina.contexto)}`;
    if (!palabras.every((p) => todo.includes(p))) return;
    const puntos = etiqueta.startsWith(palabras[0]) ? 0 : palabras.every((p) => etiqueta.includes(p)) ? 1 : 2;
    puntuadas.push({ pagina, puntos, orden });
  });
  puntuadas.sort((a, b) => a.puntos - b.puntos || a.orden - b.orden);
  return puntuadas.slice(0, limite).map((p) => p.pagina);
}

/** «#0007», «7» o «0007» -> 7 (el correlativo de un retiro); cualquier otra cosa -> null. */
export function leerBusquedaRetiro(texto: string): number | null {
  const m = /^#?\s*(\d{1,7})$/.exec(texto.trim());
  if (!m) return null;
  const numero = Number(m[1]);
  return numero >= 1 ? numero : null;
}

/** El correlativo como se ve en pantalla: 7 -> «#0007». */
export function etiquetaCorrelativo(numero: number): string {
  return `#${String(numero).padStart(4, "0")}`;
}

export const MAX_RECIENTES = 5;

/** La lista de recientes con esta página al principio, sin repetirla ni pasar del máximo. */
export function recientesActualizados(recientes: string[], href: string, maximo = MAX_RECIENTES): string[] {
  return [href, ...recientes.filter((r) => r !== href)].slice(0, maximo);
}

/** Lo guardado en el navegador como lista de rutas; cualquier cosa rara -> lista vacía. */
export function parsearRecientes(json: string): string[] {
  if (json === "") return [];
  try {
    const datos: unknown = JSON.parse(json);
    return Array.isArray(datos) ? datos.filter((d): d is string => typeof d === "string" && d.startsWith("/")).slice(0, MAX_RECIENTES) : [];
  } catch {
    return [];
  }
}

/** Mueve la selección con las flechas, dando la vuelta. Sin selección (-1), la flecha abajo va al primero y arriba al último. */
export function moverSeleccion(actual: number, delta: 1 | -1, total: number): number {
  if (total <= 0) return -1;
  if (actual < 0) return delta === 1 ? 0 : total - 1;
  return (actual + delta + total) % total;
}
