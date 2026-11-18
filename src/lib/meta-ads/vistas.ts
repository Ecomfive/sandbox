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
  estructura: Estructura | null;
  puja: Puja | null;
  producto: string | null;
  angulo: string | null;
  presupuestoDiario: number | null;
  creadaEn: string | null;
  /** Quién la montó: la persona que dice el nombre («ARIANNY») y, si el nombre no la trae, quien la creó según el registro de actividad de Meta. */
  persona: string | null;
  /** Quién tenía la sesión de Meta cuando se creó (el registro de actividad); puede ser distinta de la persona del nombre. */
  personaMeta: string | null;
  /** «ALL PA»: a quién se le muestra y dónde, según el nombre. */
  mercado: string | null;
  /** La tanda de videos que lleva, según el nombre («RT V1 AL V5»). */
  videos: string | null;
  /** Resultados del periodo elegido. */
  r: Resultados;
  tope: number;
  topeDefinido: boolean;
  /** Qué etiquetas se corrigieron a mano (la lectura de Meta no las pisa): `producto`, `angulo`, `etapa`. */
  manual: string[];
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
  r: Resultados;
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
  /** Los anuncios que usan este video y a qué campaña pertenece cada uno (últimos 30 días). */
  anunciosDetalle: { id: string; nombre: string; activo: boolean; campanaId: string; campanaNombre: string; etapa: Etapa | null; r: Resultados }[];
  r: Resultados;
  tope: number;
}

export interface Grupo {
  nombre: string;
  campanas: number;
  r: Resultados;
  resultado: number;
  confiable: boolean;
}

export interface ActividadVista {
  fecha: string;
  actor: string | null;
  tipo: string;
  objeto: string | null;
  detalle: string | null;
}
