// Vistas de una tabla: el conjunto de filtros, agrupación, cerrados y columnas que la persona armó. Se
// guardan con nombre (en su navegador) y se pueden pasar a otra persona en un enlace. Sin React, para poder
// probarlas.

import { filtroActivo, parsearFiltros, type DefTabla, type Filtro } from "./motor";
import { parsearVista, vistaDefecto, type Vista } from "./vista";

export interface ColumnasVista {
  orden: string[];
  ocultas: string[];
}

/** Lo que define una vista. `columnas` es null en las tablas sin menú de columnas (listas de tarjetas). */
export interface EstadoTabla {
  filtros: Filtro[];
  vista: Vista;
  columnas: ColumnasVista | null;
}

export interface VistaGuardada extends EstadoTabla {
  id: string;
  nombre: string;
}

export const MAX_VISTAS = 20;
export const MAX_NOMBRE = 40;
/** Un enlace más largo que esto se ignora (no es de aquí, o está cortado). */
const MAX_CODIGO = 6000;

const esTextos = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

function leerColumnas(v: unknown): ColumnasVista | null {
  if (typeof v !== "object" || v === null) return null;
  const { orden, ocultas } = v as { orden?: unknown; ocultas?: unknown };
  return esTextos(orden) && esTextos(ocultas) ? { orden, ocultas } : null;
}

/** El estado con lo que no cuenta ya quitado (filtros vacíos) y todo con la forma que esta tabla espera. */
export function normalizarEstado<F>(def: DefTabla<F>, estado: EstadoTabla): EstadoTabla {
  return {
    filtros: parsearFiltros(def, JSON.stringify(estado.filtros.filter(filtroActivo))),
    vista: parsearVista(def, JSON.stringify(estado.vista)),
    columnas: estado.columnas ? leerColumnas(estado.columnas) : null,
  };
}

/** Texto que es igual para dos estados iguales, sin importar el orden de los filtros ni de sus valores. */
export function firmaEstado(estado: EstadoTabla): string {
  const filtros = [...estado.filtros]
    .filter(filtroActivo)
    .map((f) => (f.valor.tipo === "seleccion" ? { ...f, valor: { ...f.valor, valores: [...f.valor.valores].sort() } } : f))
    .sort((a, b) => a.campo.localeCompare(b.campo));
  const columnas = estado.columnas
    ? { orden: estado.columnas.orden, ocultas: [...estado.columnas.ocultas].sort() }
    : null;
  return JSON.stringify({ filtros, vista: estado.vista, columnas });
}

export function mismoEstado(a: EstadoTabla, b: EstadoTabla): boolean {
  return firmaEstado(a) === firmaEstado(b);
}

/** La vista con la que arranca la tabla: sin filtros, su vista por defecto y las columnas como vienen. */
export function estadoPorDefecto<F>(def: DefTabla<F>, idsColumnas: string[] | null): EstadoTabla {
  return {
    filtros: [],
    vista: vistaDefecto(def),
    columnas: idsColumnas ? { orden: idsColumnas, ocultas: [] } : null,
  };
}

/** Lee las vistas guardadas descartando lo que no tenga la forma esperada. */
export function parsearVistasGuardadas<F>(def: DefTabla<F>, json: string): VistaGuardada[] {
  if (json === "") return [];
  let datos: unknown;
  try {
    datos = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(datos)) return [];
  const vistas: VistaGuardada[] = [];
  for (const item of datos) {
    if (typeof item !== "object" || item === null) continue;
    const { id, nombre, filtros, vista, columnas } = item as Record<string, unknown>;
    if (typeof id !== "string" || id === "" || typeof nombre !== "string" || nombre.trim() === "") continue;
    const estado = normalizarEstado(def, {
      filtros: Array.isArray(filtros) ? (filtros as Filtro[]) : [],
      vista: (typeof vista === "object" && vista !== null ? vista : vistaDefecto(def)) as Vista,
      columnas: leerColumnas(columnas),
    });
    vistas.push({ id, nombre: nombre.trim().slice(0, MAX_NOMBRE), ...estado });
    if (vistas.length === MAX_VISTAS) break;
  }
  return vistas;
}

export type ResultadoGuardar = "creada" | "reemplazada" | "sin-nombre" | "limite";

const clave = (nombre: string) => nombre.trim().toLowerCase();

/** Guarda la vista con ese nombre; si ya hay una con el mismo nombre (sin importar mayúsculas) la reemplaza. */
export function guardarVista(
  lista: VistaGuardada[],
  nombre: string,
  estado: EstadoTabla,
  idNuevo: string
): { lista: VistaGuardada[]; resultado: ResultadoGuardar } {
  const limpio = nombre.trim().replace(/\s+/g, " ").slice(0, MAX_NOMBRE);
  if (limpio === "") return { lista, resultado: "sin-nombre" };
  const existente = lista.find((v) => clave(v.nombre) === clave(limpio));
  if (existente) {
    return {
      lista: lista.map((v) => (v.id === existente.id ? { ...v, nombre: limpio, ...estado } : v)),
      resultado: "reemplazada",
    };
  }
  if (lista.length >= MAX_VISTAS) return { lista, resultado: "limite" };
  return { lista: [...lista, { id: idNuevo, nombre: limpio, ...estado }], resultado: "creada" };
}

export function eliminarVista(lista: VistaGuardada[], id: string): VistaGuardada[] {
  return lista.filter((v) => v.id !== id);
}

/** Cuál de las vistas guardadas es la que se ve ahora (la primera que coincide), o undefined. */
export function vistaActiva(lista: VistaGuardada[], actual: EstadoTabla): VistaGuardada | undefined {
  const firma = firmaEstado(actual);
  return lista.find((v) => firmaEstado(v) === firma);
}

// ---- Enlace a una vista ----

function aBase64Url(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(codigo: string): string {
  const base64 = codigo.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binario, (c) => c.charCodeAt(0)));
}

/** El estado como texto corto para poner en un enlace. */
export function codificarEstado(estado: EstadoTabla): string {
  return aBase64Url(JSON.stringify({ f: estado.filtros.filter(filtroActivo), v: estado.vista, c: estado.columnas }));
}

/** Lo contrario; null si el texto no es de una vista de esta tabla (dañado, cortado o de otra cosa). */
export function decodificarEstado<F>(def: DefTabla<F>, codigo: string): EstadoTabla | null {
  if (codigo === "" || codigo.length > MAX_CODIGO) return null;
  try {
    const datos: unknown = JSON.parse(deBase64Url(codigo));
    if (typeof datos !== "object" || datos === null) return null;
    const { f, v, c } = datos as { f?: unknown; v?: unknown; c?: unknown };
    if (!Array.isArray(f) || typeof v !== "object" || v === null) return null;
    return normalizarEstado(def, { filtros: f as Filtro[], vista: v as Vista, columnas: leerColumnas(c) });
  } catch {
    return null;
  }
}

/** El nombre del parámetro del enlace para esta tabla (una página puede tener varias tablas). */
export const parametroVista = (claveTabla: string) => `vista-${claveTabla}`;

/** El enlace a la página actual con esta vista, conservando los demás parámetros. */
export function enlaceDeVista(url: string, claveTabla: string, estado: EstadoTabla): string {
  const destino = new URL(url);
  destino.hash = "";
  destino.searchParams.set(parametroVista(claveTabla), codificarEstado(estado));
  return destino.toString();
}
