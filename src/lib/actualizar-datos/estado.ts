// «Actualizar datos» (19 nov 2026, pedido de Hernán; prototipo https://claude.ai/artifact/1ZUNXf8dTbszZpskenPs6X): una sola entrada con todo lo que el
// sistema trae de otras plataformas (Dropi, Drop, Dunamixfy, Effi, Shopify, la Matriz, SISCORE, Monday, QuickBooks, Meta, Tu Winner y los Excel). Aquí
// solo las reglas, sin base ni React: el estado de cada fuente y cómo se dice cuándo fue la última vez.

export type EstadoFuente = "aldia" | "atrasada" | "error" | "nunca" | "corriendo";

export type GrupoFuente = "plataformas" | "tiendas" | "entregas" | "finanzas" | "marketing" | "archivos";

export const GRUPOS_FUENTE: { id: GrupoFuente; titulo: string; subtitulo: string }[] = [
  { id: "plataformas", titulo: "Plataformas", subtitulo: "Dropi, Drop (proveedor y dropshipper), Dunamixfy y Effi" },
  { id: "tiendas", titulo: "Tiendas", subtitulo: "Shopify y la Matriz de administración" },
  { id: "entregas", titulo: "Entregas", subtitulo: "Servientrega y Monday" },
  { id: "finanzas", titulo: "Finanzas", subtitulo: "Dropi, retiros y QuickBooks" },
  { id: "marketing", titulo: "Marketing e investigación", subtitulo: "Meta y Tu Winner" },
  { id: "archivos", titulo: "Archivos", subtitulo: "Los Excel que se suben a mano" },
];

/**
 * Lo que se abre en una ventana encima del panel (19 nov 2026, pedido de Hernán: «la idea era actualizarlos desde ahí, no que me mande a la página»): la
 * actualización de Dropi, Drop o Dunamixfy de esa cuenta (`sitio`; null = elegir), la lectura de Servientrega o de Tu Winner, o el cargador de un Excel.
 */
export type VentanaFuente =
  | { tipo: "dropi"; sitio: "pa" | "cr" | "mx" | "drop" | "duna" | null }
  | { tipo: "siscore" }
  | { tipo: "tuwinner" }
  | { tipo: "competencia-drop" }
  | { tipo: "excel"; modulo: string }
  | { tipo: "conteo" };

/** Lo que se hace con el botón de la fila: correr la lectura desde aquí, abrirla en una ventana aquí mismo, o subir la Matriz aquí mismo. */
export type AccionFuente =
  | { tipo: "correr"; clave: "effi" | "shopify-productos" | "shopify-pedidos" | "shopify-ventas" | "monday" | "quickbooks" | "dropi-finanzas" | "meta"; texto: string; tiendas?: { id: string; nombre: string }[] }
  | { tipo: "matriz"; texto: string }
  | { tipo: "ventana"; ventana: VentanaFuente; titulo: string; texto: string }
  | { tipo: "enlace"; href: string; texto: string };

export interface Fuente {
  clave: string;
  grupo: GrupoFuente;
  nombre: string;
  que: string;
  estado: EstadoFuente;
  /** Cuándo terminó la última lectura buena (o la última, si falló), ISO. */
  fecha: string | null;
  /** Quién la hizo («Automática» si fue la tarea programada); null si no se sabe. */
  quien: string | null;
  /** El error de la última vez, si falló. */
  error: string | null;
  /** Si se actualiza sola: «Sola, todos los días 4:40 a. m.»; null = solo a mano. */
  automatica: string | null;
  /** Lo que hace falta para actualizarla («Con la extensión y la sesión de Dropi»). */
  requisito: string | null;
  /** Su pantalla de siempre, donde también está el botón. */
  donde: { texto: string; href: string };
  /** null = la persona la ve pero no puede actualizarla. */
  accion: AccionFuente | null;
}

const HORA = 3_600_000;

/**
 * El estado de una fuente: «corriendo» si hay una lectura en marcha; «error» si la última falló; «nunca» sin ninguna; «atrasada» si la última buena
 * tiene más de `plazoHoras` (null = nunca se atrasa, como un conteo de inventario); si no, «al día».
 */
export function estadoFuente(u: { fecha: string | null; error?: boolean; corriendo?: boolean }, plazoHoras: number | null, ahora = Date.now()): EstadoFuente {
  if (u.corriendo) return "corriendo";
  if (u.error) return "error";
  if (!u.fecha) return "nunca";
  const t = Date.parse(u.fecha);
  if (!Number.isFinite(t)) return "nunca";
  if (plazoHoras !== null && ahora - t > plazoHoras * HORA) return "atrasada";
  return "aldia";
}

/** La más nueva de varias fechas ISO (null si ninguna). */
export function masNueva(...fechas: (string | null | undefined)[]): string | null {
  let mejor: string | null = null;
  for (const f of fechas) if (f && Number.isFinite(Date.parse(f)) && (!mejor || Date.parse(f) > Date.parse(mejor))) mejor = f;
  return mejor;
}

const ZONA = "America/Panama";
const dia = (t: number) => new Date(t).toLocaleDateString("en-CA", { timeZone: ZONA });
const hora = (t: number) => new Date(t).toLocaleTimeString("es-PA", { hour: "numeric", minute: "2-digit", timeZone: ZONA });

/** «Hoy 8:12 a. m.», «Ayer 4:40 p. m.», «Hace 3 días» (hasta una semana) o «12 nov». */
export function cuandoFue(fecha: string | null, ahora = Date.now()): string {
  if (!fecha) return "Sin registro todavía";
  const t = Date.parse(fecha);
  if (!Number.isFinite(t)) return "Sin registro todavía";
  const hoy = dia(ahora);
  const ayer = dia(ahora - 24 * HORA);
  const d = dia(t);
  if (d === hoy) return `Hoy ${hora(t)}`;
  if (d === ayer) return `Ayer ${hora(t)}`;
  const dias = Math.round((Date.parse(`${hoy}T12:00:00Z`) - Date.parse(`${d}T12:00:00Z`)) / (24 * HORA));
  if (dias > 0 && dias <= 7) return `Hace ${dias} días`;
  return new Date(t).toLocaleDateString("es-PA", { day: "numeric", month: "short", timeZone: ZONA }).replace(".", "");
}

/**
 * Las cuentas de las tarjetas de arriba. Una fuente sin ningún registro («nunca») no cuenta como atrasada: muchos datos se cargaron antes de que
 * existiera el registro (los Excel de Finanzas, por ejemplo), así que no se sabe; sale en gris en su fila.
 */
export function contarFuentes(fuentes: Pick<Fuente, "estado" | "automatica">[]) {
  return {
    total: fuentes.length,
    aldia: fuentes.filter((f) => f.estado === "aldia" || f.estado === "corriendo").length,
    atrasadas: fuentes.filter((f) => f.estado === "atrasada").length,
    fallaron: fuentes.filter((f) => f.estado === "error").length,
    automaticas: fuentes.filter((f) => f.automatica !== null).length,
  };
}

export type FiltroFuentes = "todas" | "aldia" | "atrasadas" | "fallaron" | "automaticas";

export function pasaFiltro(f: Pick<Fuente, "estado" | "automatica">, filtro: FiltroFuentes): boolean {
  if (filtro === "aldia") return f.estado === "aldia" || f.estado === "corriendo";
  if (filtro === "atrasadas") return f.estado === "atrasada";
  if (filtro === "fallaron") return f.estado === "error";
  if (filtro === "automaticas") return f.automatica !== null;
  return true;
}
