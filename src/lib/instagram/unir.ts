/**
 * Unir dos capturas que son el mismo contenido pero llegaron por caminos distintos: un anuncio reenviado desde un chat llega solo como
 * archivo (sin enlace) y el mismo anuncio compartido después con «Compartir en…» llega con enlace, pero el identificador de Meta de
 * cada camino es distinto y no se pueden reconocer por él. Aquí se sugiere con qué captura unirla (por el tiempo entre una y otra y por
 * lo que cada una aporta) y se decide si dos capturas se pueden unir. La fusión en sí es `fusionar` (`fusion.ts`).
 */
import { codigoDeContenido } from "./plataformas";

/** Lo mínimo de una captura para sugerir una unión. */
export interface CapturaParaUnir {
  id: string;
  numero: number;
  recibidoEn: string;
  remitenteId: string;
  enlace: string | null;
  tieneArchivo: boolean;
}

export interface SugerenciaUnion {
  id: string;
  numero: number;
  /** Minutos entre las dos llegadas (siempre positivo). */
  minutos: number;
  /** ¿Es la misma persona de Instagram? Solo se sabe entre dos mensajes directos. */
  mismaPersona: boolean;
  /** Lo que la otra captura aporta (o recibe): el enlace, el archivo. */
  aporta: ("enlace" | "archivo")[];
}

/** Más de esto entre una llegada y la otra, ya no se sugiere (se puede unir a mano igual). */
export const MINUTOS_MAXIMOS_SUGERENCIA = 120;

/** ¿Las dos capturas son de contenidos distintos? Sí si las dos tienen enlace y su código de publicación no es el mismo. */
export function sonDeContenidosDistintos(a: { enlace: string | null }, b: { enlace: string | null }): boolean {
  const x = codigoDeContenido(a.enlace);
  const y = codigoDeContenido(b.enlace);
  return !!x && !!y && x !== y;
}

/** Lo que ganaría la una con la otra: el enlace o el archivo que le falta y la otra tiene (en cualquiera de los dos sentidos). */
function loQueAportan(a: CapturaParaUnir, b: CapturaParaUnir): ("enlace" | "archivo")[] {
  const salida: ("enlace" | "archivo")[] = [];
  if ((!a.enlace && b.enlace) || (a.enlace && !b.enlace)) salida.push("enlace");
  if ((!a.tieneArchivo && b.tieneArchivo) || (a.tieneArchivo && !b.tieneArchivo)) salida.push("archivo");
  return salida;
}

/**
 * Las capturas con las que tiene sentido unir esta, de la más cercana en el tiempo a la más lejana: llegaron con menos de
 * `MINUTOS_MAXIMOS_SUGERENCIA` de diferencia, no son de contenidos distintos y una aporta algo que le falta a la otra (el enlace o el
 * archivo). Si las dos son del mismo mensaje directo de la misma persona, va primero.
 */
export function sugerirUniones(base: CapturaParaUnir, otras: CapturaParaUnir[], maximo = 5): SugerenciaUnion[] {
  const salida: SugerenciaUnion[] = [];
  for (const o of otras) {
    if (o.id === base.id || sonDeContenidosDistintos(base, o)) continue;
    const minutos = Math.abs(Date.parse(o.recibidoEn) - Date.parse(base.recibidoEn)) / 60_000;
    if (!Number.isFinite(minutos) || minutos > MINUTOS_MAXIMOS_SUGERENCIA) continue;
    const aporta = loQueAportan(base, o);
    if (aporta.length === 0) continue;
    salida.push({ id: o.id, numero: o.numero, minutos: Math.round(minutos), mismaPersona: !!base.remitenteId && base.remitenteId === o.remitenteId, aporta });
  }
  return salida.sort((a, b) => Number(b.mismaPersona) - Number(a.mismaPersona) || a.minutos - b.minutos).slice(0, maximo);
}

/** «3 min de diferencia», «1 h 20 min de diferencia» (sin decir si fue antes o después). */
export function textoMinutos(minutos: number): string {
  if (minutos < 1) return "al mismo tiempo";
  if (minutos < 60) return `${minutos} min de diferencia`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${h} h${m ? ` ${m} min` : ""} de diferencia`;
}

/** Cuántos minutos como máximo para avisar en la lista que una captura «se puede unir» con otra (más estricto que la sugerencia de la ficha). */
export const MINUTOS_PARA_AVISAR = 30;

/**
 * La captura que casi seguro es la misma que esta, para avisarlo en la lista: esta llegó solo como archivo (sin enlace) y hay otra con
 * enlace de hace menos de `MINUTOS_PARA_AVISAR`. Null si no hay una clara o si la mejor no es la única (no se adivina entre varias).
 */
export function unionProbable(base: CapturaParaUnir, otras: CapturaParaUnir[]): SugerenciaUnion | null {
  if (base.enlace || !base.tieneArchivo) return null;
  const cercanas = sugerirUniones(base, otras, 10).filter((s) => s.minutos <= MINUTOS_PARA_AVISAR && s.aporta.includes("enlace"));
  return cercanas.length === 1 ? cercanas[0] : null;
}
