// Anuncios Meta › la misma prioridad de «Para decidir hoy» en cada lista (25 nov 2026, pedido de Alcides: «que estos cambios de prioridad y relevancia se apliquen en todas las pestañas»). Sale de las sugerencias pendientes: cada campaña,
// video y producto lleva la más urgente que tiene. Lo ya decidido no marca nada. Lógica pura, con prueba.

import { PRIORIDADES, type CifraSugerencia, type Prioridad, type Severidad, type Sugerencia } from "./sugerencias";

/** Lo más urgente que tiene una fila de una lista. */
export interface Pendiente {
  /** La llave de la sugerencia, para poder decidirla («Ya lo hice», «Dejar para después», «No aplica»). */
  clave?: string;
  prioridad: Prioridad;
  titulo: string;
  accion: string;
  cifras?: CifraSugerencia[];
  /** Cuántas cosas (o campañas, en un producto) piden lo mismo. */
  cuantas: number;
}

export const NOMBRE_PRIORIDAD: Record<Prioridad, string> = { apagar: "Apagar", actuar: "Actuar hoy", oportunidad: "Oportunidad", observar: "En observación", historial: "Del historial" };

const SEVERIDAD: Record<Severidad, number> = { alta: 0, media: 1, info: 2 };
const urgencia = (s: Sugerencia) => PRIORIDADES.indexOf(s.prioridad) * 10 + SEVERIDAD[s.severidad];

/** El número por el que se ordena una lista: menor = más urgente. null = no tiene nada pendiente (va al final). */
export const ordenDePrioridad = (p: Pendiente | null | undefined): number | null => (p ? PRIORIDADES.indexOf(p.prioridad) : null);

function agrupar(pares: readonly [string, Sugerencia][]): Map<string, Pendiente> {
  const porId = new Map<string, Sugerencia[]>();
  for (const [id, s] of pares) porId.set(id, [...(porId.get(id) ?? []), s]);
  const salida = new Map<string, Pendiente>();
  for (const [id, lista] of porId) {
    const s = [...lista].sort((a, b) => urgencia(a) - urgencia(b) || b.gasto - a.gasto)[0];
    salida.set(id, { clave: s.clave, prioridad: s.prioridad, titulo: s.titulo, accion: s.accion, cifras: s.cifras, cuantas: lista.filter((x) => x.prioridad === s.prioridad).length });
  }
  return salida;
}

/** Lo pendiente de cada campaña (las sugerencias que hablan de ella, también las de sus anuncios). */
export const pendientesPorCampana = (s: readonly Sugerencia[]): Map<string, Pendiente> => agrupar(s.filter((x) => x.objeto.tipo === "campana").map((x) => [x.objeto.id, x]));

/** Lo pendiente de cada video: lo que se sugiere sobre él y sobre los anuncios que lo usan (apagarlos o rotar su gancho). */
export function pendientesPorVideo(s: readonly Sugerencia[], videos: readonly { id: string; anunciosDetalle: readonly { id: string }[] }[]): Map<string, Pendiente> {
  const videoDe = new Map<string, string>();
  for (const v of videos) for (const a of v.anunciosDetalle) videoDe.set(a.id, v.id);
  const pares: [string, Sugerencia][] = [];
  for (const x of s) {
    if (x.objeto.tipo === "video") {
      pares.push([x.objeto.id, x]);
      continue;
    }
    // Una sugerencia de un anuncio (su llave termina en el id del anuncio).
    if (x.tipo === "anuncio_apagar" || x.tipo === "anuncio_rotar") {
      const video = videoDe.get(x.clave.slice(x.tipo.length + 1));
      if (video) pares.push([video, x]);
      continue;
    }
    // Los anuncios que una tarjeta de campaña manda apagar.
    for (const a of x.anuncios ?? []) {
      const video = a.grupo === "apagar" ? videoDe.get(a.id) : undefined;
      // Sin llave: decidirla desde un video omitiría la tarjeta entera de la campaña.
      if (video) pares.push([video, { ...x, clave: "", prioridad: "actuar", titulo: `${a.nombre}: apagar este anuncio (${a.cifra})`, accion: `Apagar ${a.nombre}: ${a.cifra}.`, cifras: undefined }]);
    }
  }
  return agrupar(pares);
}

/** Lo pendiente de un producto: lo más urgente entre sus campañas, y en cuántas pasa. */
export function pendienteDeProducto(deSusCampanas: readonly (Pendiente | null | undefined)[]): Pendiente | null {
  const lista = deSusCampanas.filter((p): p is Pendiente => !!p).sort((a, b) => PRIORIDADES.indexOf(a.prioridad) - PRIORIDADES.indexOf(b.prioridad));
  const peor = lista[0];
  return peor ? { ...peor, cifras: undefined, cuantas: lista.filter((p) => p.prioridad === peor.prioridad).length } : null;
}
