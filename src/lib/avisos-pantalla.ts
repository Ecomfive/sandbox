// Avisos personales en pantalla (17 nov 2026, pedido de Hernán): algunos avisos «Para ti» (los de `notificaciones_usuario`) salen además como una tarjeta que aparece en cualquier página,
// como el aviso de «Nuevo pedido», con lo principal y un botón que lleva a donde se gestiona. Lógica pura, con prueba.

/**
 * Qué tipos de aviso salen en pantalla. Solo los que alguien tiene que atender (no todos: las menciones, las tareas o los avisos de WhatsApp quedarían en un aviso constante). Para sumar uno,
 * agrega su tipo aquí.
 *  - `llegada`: Llegada a Puerto (para Logística) y En Bodega (para quien paga) de Compras.
 *  - `remision`: remisiones, novedades de plataforma y correcciones de Inventario.
 */
export const TIPOS_CON_AVISO_EN_PANTALLA: readonly string[] = ["llegada", "remision"];

export const esAvisoDePantalla = (tipo: string): boolean => TIPOS_CON_AVISO_EN_PANTALLA.includes(tipo);

/** Al abrir el sistema se muestran los avisos de este tipo sin leer de las últimas 24 horas (los más viejos quedan solo en «Avisos»). */
export const HORAS_AVISOS_SIN_LEER = 24;

/** Cuántas tarjetas a la vez (el resto espera a que se cierre alguna; todos siguen en «Avisos»). */
export const MAX_TARJETAS = 3;

/** Una dirección interna segura para el botón de la tarjeta: solo rutas del propio sistema («/compras/…»), nunca un enlace a otro sitio. */
export const rutaInterna = (href: string): string => (href.startsWith("/") && !href.startsWith("//") && !href.includes("\\") ? href : "/notificaciones");

export interface AvisoEnPantalla {
  id: string;
  tipo: string;
  titulo: string;
  texto: string | null;
  href: string;
  creadoEn: string;
}

/** De la lista que llegó, lo que todavía no se mostró en esta sesión, de los más viejos a los más nuevos. */
export function sinMostrar(lista: AvisoEnPantalla[], vistos: ReadonlySet<string>): AvisoEnPantalla[] {
  return lista.filter((a) => !vistos.has(a.id)).sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}
