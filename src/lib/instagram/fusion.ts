import { datosQueFaltan } from "./repetidas";

/**
 * Una captura por contenido: si lo mismo se comparte varias veces (o una vez como archivo y otra como enlace), las llegadas se
 * **fusionan** en la primera, que se completa con lo que traiga la otra y guarda un registro de cada envío (`metricas.envios`). Así hay
 * una sola ficha con todos los datos y quién lo compartió y cuándo, y un reintento de Meta del mismo mensaje no la duplica.
 */
export interface Envio {
  mensaje_id: string;
  remitente_id: string;
  remitente_usuario: string | null;
  remitente_nombre: string | null;
  recibido_en: string;
  tipo: string;
}

export interface FilaFusionable {
  mensaje_id: string;
  recibido_en: string;
  remitente_id: string;
  remitente_usuario: string | null;
  remitente_nombre: string | null;
  tipo: string;
  enlace: string | null;
  titulo: string | null;
  media_id: string | null;
  texto_mensaje: string | null;
  video_ruta: string | null;
  video_bytes: number | null;
  video_error: string | null;
  autor_usuario: string | null;
  metricas: Record<string, unknown> | null;
  pagina_destino: string | null;
  notas: string | null;
  estado: string;
}

const MAX_ENVIOS = 50;

const texto = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Los envíos ya fusionados en una captura, leídos de `metricas.envios` (lo que no tenga la forma esperada se ignora). */
export function enviosDe(metricas: Record<string, unknown> | null | undefined): Envio[] {
  const lista = metricas?.envios;
  if (!Array.isArray(lista)) return [];
  const salida: Envio[] = [];
  for (const e of lista) {
    if (typeof e !== "object" || e === null) continue;
    const o = e as Record<string, unknown>;
    const mensaje = texto(o.mensaje_id);
    const remitente = texto(o.remitente_id);
    const cuando = texto(o.recibido_en);
    if (!mensaje || !remitente || !cuando) continue;
    salida.push({ mensaje_id: mensaje, remitente_id: remitente, remitente_usuario: texto(o.remitente_usuario), remitente_nombre: texto(o.remitente_nombre), recibido_en: cuando, tipo: texto(o.tipo) ?? "otro" });
  }
  return salida;
}

/** El envío que representa la propia llegada de una captura. */
export const envioDe = (f: Pick<FilaFusionable, "mensaje_id" | "remitente_id" | "remitente_usuario" | "remitente_nombre" | "recibido_en" | "tipo">): Envio => ({
  mensaje_id: f.mensaje_id,
  remitente_id: f.remitente_id,
  remitente_usuario: f.remitente_usuario,
  remitente_nombre: f.remitente_nombre,
  recibido_en: f.recibido_en,
  tipo: f.tipo,
});

/** Todos los envíos de una captura (el suyo y los fusionados), del más viejo al más nuevo y sin repetir mensaje. */
export function todosLosEnvios(f: FilaFusionable): Envio[] {
  const vistos = new Set<string>();
  return [envioDe(f), ...enviosDe(f.metricas)]
    .filter((e) => (vistos.has(e.mensaje_id) ? false : (vistos.add(e.mensaje_id), true)))
    .sort((a, b) => a.recibido_en.localeCompare(b.recibido_en));
}

/** Une dos textos sin repetir lo que ya está. */
export function unirTextos(a: string | null, b: string | null, max = 4000): string | null {
  if (!b) return a;
  if (!a) return b.slice(0, max);
  if (a.includes(b)) return a;
  return `${a}\n${b}`.slice(0, max);
}

/**
 * Lo que hay que cambiar en la captura principal para absorber a otra del mismo contenido: solo se completa lo que le falta (enlace,
 * título, cuenta, página de destino, archivo, cifras), se unen los textos y las notas, se suman los envíos y, si la principal aún está
 * «nuevo» y la otra ya tenía una decisión, se toma esa. Nada de lo que la principal ya tenía se pisa. `archivoSobrante` es la ruta del
 * archivo de la absorbida cuando la principal ya tenía el suyo (para borrarlo del almacenamiento y no dejarlo huérfano).
 */
export function fusionar(principal: FilaFusionable, absorbida: FilaFusionable): { cambios: Record<string, unknown>; archivoSobrante: string | null } {
  const cambios: Record<string, unknown> = {};
  let archivoSobrante: string | null = null;

  if (!principal.enlace && absorbida.enlace) cambios.enlace = absorbida.enlace;
  if (!principal.titulo && absorbida.titulo) cambios.titulo = absorbida.titulo;
  if (!principal.media_id && absorbida.media_id) cambios.media_id = absorbida.media_id;
  if (!principal.pagina_destino && absorbida.pagina_destino) cambios.pagina_destino = absorbida.pagina_destino;
  if (!principal.autor_usuario && absorbida.autor_usuario) cambios.autor_usuario = absorbida.autor_usuario;
  const textoUnido = unirTextos(principal.texto_mensaje, absorbida.texto_mensaje);
  if (textoUnido !== principal.texto_mensaje) cambios.texto_mensaje = textoUnido;
  const notasUnidas = unirTextos(principal.notas, absorbida.notas);
  if (notasUnidas !== principal.notas) cambios.notas = notasUnidas;
  if (principal.estado === "nuevo" && absorbida.estado !== "nuevo") cambios.estado = absorbida.estado;

  if (!principal.video_ruta && absorbida.video_ruta) {
    cambios.video_ruta = absorbida.video_ruta;
    cambios.video_bytes = absorbida.video_bytes;
    cambios.video_error = null;
  } else if (principal.video_ruta && absorbida.video_ruta && principal.video_ruta !== absorbida.video_ruta) {
    archivoSobrante = absorbida.video_ruta;
  }

  // Las cifras y el nombre de la página: solo lo que falta; y los envíos y las notas unidas se suman.
  const copiadas = datosQueFaltan({ enlace: principal.enlace, autor_usuario: principal.autor_usuario, metricas: principal.metricas }, { enlace: absorbida.enlace, autor_usuario: absorbida.autor_usuario, metricas: absorbida.metricas });
  const metricas: Record<string, unknown> = { ...((copiadas?.metricas as Record<string, unknown> | undefined) ?? principal.metricas ?? {}) };
  const envios = [...enviosDe(principal.metricas), ...enviosDe(absorbida.metricas), envioDe(absorbida)];
  const vistos = new Set<string>();
  metricas.envios = envios.filter((e) => (vistos.has(e.mensaje_id) ? false : (vistos.add(e.mensaje_id), true))).slice(-MAX_ENVIOS);
  const unidas = [...new Set([...(Array.isArray(principal.metricas?.notas_unidas) ? (principal.metricas?.notas_unidas as string[]) : []), ...(Array.isArray(absorbida.metricas?.notas_unidas) ? (absorbida.metricas?.notas_unidas as string[]) : [])])];
  if (unidas.length > 0) metricas.notas_unidas = unidas.slice(-20);
  cambios.metricas = metricas;

  return { cambios, archivoSobrante };
}
