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
  /** Quién la creó según el registro de actividad de Meta; null si no se pudo saber. */
  persona: string | null;
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
