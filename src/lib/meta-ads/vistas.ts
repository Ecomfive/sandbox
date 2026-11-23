// Anuncios Meta: lo que las pantallas reciben ya armado (serializable: cruza de servidor a cliente).

import type { Resultados } from "./metricas";
import type { Estructura, Etapa, Puja } from "./nombre";

export interface CampanaVista {
  id: string;
  cuentaId: string;
  cuentaNombre: string;
  metaId: string;
  nombre: string;
  estado: string;
  activa: boolean;
  etapa: Etapa | null;
  /** Por qué tiene esa etapa (lo que dice el nombre, el producto en Producto o lo corregido a mano). */
  etapaMotivo: string | null;
  estructura: Estructura | null;
  puja: Puja | null;
  producto: string | null;
  /** El ángulo con que se clasifica la campaña: el que domina entre sus videos (60 % o más), «Mezcla de ángulos» si ninguno domina, o el corregido a mano. */
  angulo: string | null;
  /** De qué ángulos está hecha, por el ángulo de cada uno de sus videos (los videos distintos de sus anuncios). */
  angulos: ComposicionAngulo[];
  /** Videos distintos que usa la campaña y cuántos de ellos ya tienen ángulo. */
  videosTotal: number;
  videosConAngulo: number;
  presupuestoDiario: number | null;
  creadaEn: string | null;
  /** Quién la montó: la persona que dice el nombre («ARIANNY») y, si el nombre no la trae, quien la creó según el registro de actividad de Meta. */
  persona: string | null;
  /** Quién tenía la sesión de Meta cuando se creó (el registro de actividad); puede ser distinta de la persona del nombre. */
  personaMeta: string | null;
  /** «ALL PA»: a quién se le muestra y dónde, según el nombre. */
  mercado: string | null;
  /** De dónde sale el ángulo: el nombre, una corrección a mano o lo que vio la IA en sus videos. */
  anguloOrigen: "nombre" | "manual" | "video" | null;
  /** La tanda de videos que lleva, según el nombre («RT V1 AL V5»). */
  videos: string | null;
  /** Resultados del periodo elegido. */
  r: Resultados;
  tope: number;
  topeDefinido: boolean;
  /** Qué etiquetas se corrigieron a mano (la lectura de Meta no las pisa): `producto`, `angulo`, `etapa`. */
  manual: string[];
}

/** Un ángulo dentro de una campaña: cuántos de sus videos lo usan y qué parte de los videos con ángulo es. Los porcentajes de una campaña suman 100. */
export interface ComposicionAngulo {
  angulo: string;
  videos: number;
  pct: number;
  gasto: number;
}

export interface AnuncioVista {
  id: string;
  campanaId: string;
  nombre: string;
  activo: boolean;
  videoId: string | null;
  miniatura: string | null;
  copy: string | null;
  titulo: string | null;
  landing: string | null;
  /** «V3»: el número del video dentro de su tanda, según el nombre del anuncio. */
  numero: string | null;
  /** El ángulo de su video, según el análisis de la IA. */
  angulo: string | null;
  r: Resultados;
}

/** Lo que la IA vio en un video. `sin_archivo`: Meta no dejó bajarlo y se analizó solo el texto y la miniatura (el ángulo es provisional). */
export interface AnalisisVideoVista {
  estado: "analizado" | "sin_archivo" | "error";
  origen: "video" | "texto";
  angulo: string | null;
  /** Una persona corrigió el ángulo: un nuevo análisis no lo pisa. */
  anguloManual: boolean;
  promesa: string | null;
  gancho: string | null;
  /** Qué tipo de gancho es (pregunta, problema o dolor, resultado…), de una lista fija; null si todavía no se clasificó. */
  ganchoTipo: string | null;
  resumen: string | null;
  transcripcion: string | null;
  publico: string | null;
  formato: string | null;
  duracionS: number | null;
  error: string | null;
  analizadoEn: string;
  /** 1 = análisis anterior, sin estructura ni llamado a la acción; 2 = con ellos. */
  version: number;
  /** El llamado a la acción tal como lo dice el video, el segundo en que aparece y de qué tipo es. */
  cta: string | null;
  ctaSegundo: number | null;
  ctaTipo: string | null;
  oferta: string | null;
  recursos: string[];
  /** Cómo se arma el video, parte por parte y con sus segundos. */
  estructura: { parte: string; desde: number | null; hasta: number | null; resumen: string }[];
}

export interface VideoVista {
  /** El id del video en Meta. */
  id: string;
  nombre: string;
  miniatura: string | null;
  producto: string | null;
  angulo: string | null;
  campanas: number;
  anuncios: number;
  /** «V3»: el número del video dentro de su tanda, si el nombre del anuncio lo dice. */
  numero: string | null;
  /** El análisis de la IA, si ya se hizo. */
  analisis: AnalisisVideoVista | null;
  /** Los anuncios que usan este video y a qué campaña pertenece cada uno (últimos 30 días). */
  anunciosDetalle: { id: string; nombre: string; activo: boolean; campanaId: string; campanaNombre: string; etapa: Etapa | null; r: Resultados }[];
  r: Resultados;
  tope: number;
}

export interface Grupo {
  nombre: string;
  campanas: number;
  /** Videos distintos del grupo (solo cuenta cuando el elemento trae su video: el ángulo). */
  videos: number;
  r: Resultados;
  resultado: number;
  confiable: boolean;
  /** Qué tan seguro es lo que dice el grupo: firme (mucho gasto, varias unidades y compras suficientes), probable o poca data. */
  certeza: "firme" | "probable" | "poca";
}

export interface ActividadVista {
  fecha: string;
  actor: string | null;
  tipo: string;
  objeto: string | null;
  detalle: string | null;
}
