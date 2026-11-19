// Anuncios Meta › qué videos le toca ver a la IA. Lógica pura, con prueba: de los anuncios con video, lo que ya se analizó y lo gastado de cada anuncio sale la lista de pendientes, de más a menos gasto.
// Un video es pendiente si nunca se analizó, si el intento falló, si se analizó solo con el texto (Meta no dio el archivo) o si su análisis es de una versión anterior. Cuenta todo el historial leído, no solo
// los últimos 30 días (18 nov 2026: al traer un año de historial quedaban cientos de videos viejos que nadie analizaba).

export interface VideoPendiente {
  videoId: string;
  cuentaId: string;
  gasto: number;
  producto: string | null;
  copy: string | null;
  titulo: string | null;
  miniatura: string | null;
}

export interface AnuncioConVideo {
  id: string;
  cuenta_id: string;
  campana_id: string;
  video_id: string;
  miniatura: string | null;
  copy: string | null;
  titulo: string | null;
}

export interface AnalisisGuardado {
  video_id: string;
  estado: string;
  analizado_en: string;
  version?: number | null;
}

const MIN = 60_000;
const DIA = 24 * 60 * MIN;
/** Cuánto se espera para repetir un intento según cómo quedó. En automático: un fallo o una versión vieja, un día; «solo con el texto», tres (Meta suele no dar nunca el archivo de un video borrado). */
export const ESPERA_AUTOMATICA = { error: DIA, sin_archivo: 3 * DIA, version_vieja: DIA };
/** Cuando una persona pulsa el botón no se repite lo que se acaba de intentar (así una tanda que falla no tapa a los que siguen). */
export const ESPERA_MANUAL_MS = 3 * MIN;

export function elegirPendientes(o: {
  anuncios: AnuncioConVideo[];
  gastoPorAnuncio: Map<string, number>;
  analisis: Map<string, AnalisisGuardado>;
  productoDe: Map<string, string | null>;
  ahora: number;
  manual: boolean;
  version: number;
  max: number;
}): { pendientes: VideoPendiente[]; total: number } {
  const porVideo = new Map<string, VideoPendiente & { mejor: number }>();
  for (const a of o.anuncios) {
    const g = o.gastoPorAnuncio.get(a.id) ?? 0;
    const previo = porVideo.get(a.video_id);
    if (!previo) {
      porVideo.set(a.video_id, { videoId: a.video_id, cuentaId: a.cuenta_id, gasto: g, producto: o.productoDe.get(a.campana_id) ?? null, copy: a.copy, titulo: a.titulo, miniatura: a.miniatura, mejor: g });
      continue;
    }
    previo.gasto += g;
    if (g > previo.mejor) Object.assign(previo, { mejor: g, copy: a.copy ?? previo.copy, titulo: a.titulo ?? previo.titulo, producto: o.productoDe.get(a.campana_id) ?? previo.producto });
    if (!previo.miniatura && a.miniatura) previo.miniatura = a.miniatura;
  }
  const todos = [...porVideo.values()]
    .filter((v) => v.gasto > 0)
    .filter((v) => {
      const h = o.analisis.get(v.videoId);
      if (!h) return true;
      const versionVieja = h.estado === "analizado" && (h.version ?? 1) < o.version;
      if (h.estado === "analizado" && !versionVieja) return false;
      const espera = o.manual ? ESPERA_MANUAL_MS : h.estado === "sin_archivo" ? ESPERA_AUTOMATICA.sin_archivo : versionVieja ? ESPERA_AUTOMATICA.version_vieja : ESPERA_AUTOMATICA.error;
      return o.ahora - new Date(h.analizado_en).getTime() > espera;
    })
    .sort((a, b) => b.gasto - a.gasto);
  return { pendientes: todos.slice(0, o.max).map(({ mejor: _mejor, ...v }) => (void _mejor, v)), total: todos.length };
}
