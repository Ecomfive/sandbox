// Avisos personales en pantalla (17 nov 2026, pedido de Hernán): algunos avisos «Para ti» (los de `notificaciones_usuario`) salen además como una tarjeta que aparece en cualquier página,
// como el aviso de «Nuevo pedido», con lo principal y un botón que lleva a donde se gestiona. Lógica pura, con prueba.

/**
 * Qué tipos de aviso salen en pantalla. Solo los que alguien tiene que atender (no todos: las menciones, las tareas o los avisos de WhatsApp quedarían en un aviso constante). Para sumar uno,
 * agrega su tipo aquí.
 *  - `llegada`: Llegada a Puerto (para Logística) y En Bodega (para quien paga) de Compras.
 *  - `remision`: remisiones, novedades de plataforma y correcciones de Inventario.
 *  - `adelanto`: un pedido confirmado de una zona de pago por adelantado (Confirmación con IA).
 *  - `seguridad`: login frenado por muchas claves equivocadas, cuenta nueva o alguien más con la edición de Usuarios y roles (para quien
 *    administra Usuarios y roles; seguridad · 19 nov 2026).
 */
export const TIPOS_CON_AVISO_EN_PANTALLA: readonly string[] = ["llegada", "remision", "adelanto", "seguridad"];

export const esAvisoDePantalla = (tipo: string): boolean => TIPOS_CON_AVISO_EN_PANTALLA.includes(tipo);

/** Al abrir el sistema se muestran los avisos de este tipo sin leer de las últimas 24 horas (los más viejos quedan solo en «Avisos»). */
export const HORAS_AVISOS_SIN_LEER = 24;

/** Cuántas tarjetas a la vez (el resto espera a que se cierre alguna; todos siguen en «Avisos»). */
export const MAX_TARJETAS = 3;

/** Una dirección interna segura para el botón de la tarjeta: solo rutas del propio sistema («/compras/…»), nunca un enlace a otro sitio. */
export const rutaInterna = (href: string): string => (href.startsWith("/") && !href.startsWith("//") && !href.includes("\\") ? href : "/notificaciones");

export interface AvisoEnPantalla {
  id: string;
  /** Si la tarjeta junta varios avisos, los ids de todos (para marcarlos leídos juntos). */
  ids?: string[];
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

/** ¿Es el aviso «Llega a puerto» (uno por cambio de etapa de Compras)? Se reconoce por su título, como en `esAvisoDePuerto`. */
const esDePuerto = (a: Pick<AvisoEnPantalla, "titulo">) => a.titulo.startsWith("Llega a puerto");

/**
 * Varios avisos «Llega a puerto» que caen juntos salen en **una sola tarjeta** (24 nov 2026, pedido de Logística: una tarjeta por producto llenaba la pantalla): «Llegan a puerto: N avisos nuevos», que
 * lleva a la lista completa y se marca leída entera. Con uno solo, queda como estaba; los demás avisos no se tocan.
 */
export function juntarAvisosDePuerto(lista: AvisoEnPantalla[]): AvisoEnPantalla[] {
  const puerto = lista.filter(esDePuerto);
  if (puerto.length < 2) return lista;
  const junta: AvisoEnPantalla = {
    id: puerto[0].id,
    ids: puerto.map((a) => a.id),
    tipo: puerto[0].tipo,
    titulo: `Llegan a puerto: ${puerto.length} avisos nuevos`,
    texto: "Abre la lista completa, ordenada, con producto, unidades y cajas; ahí la puedes descargar en PDF.",
    href: puerto[0].href,
    creadoEn: puerto[puerto.length - 1].creadoEn,
  };
  const primero = lista.findIndex(esDePuerto);
  return [...lista.slice(0, primero).filter((a) => !esDePuerto(a)), junta, ...lista.slice(primero).filter((a) => !esDePuerto(a))];
}
