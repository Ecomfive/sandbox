// El acceso de una persona a cada módulo: el de su rol y, encima, lo que se le dio o quitó solo a ella. Lógica pura.

import { MODULOS_ACCESO, type Nivel } from "./catalogo";

export interface PermisoRol {
  modulo: string;
  solo_lectura: boolean;
}

export type NivelPropio = "ninguno" | "lectura" | "edicion";

export interface PermisoPropio {
  modulo: string;
  nivel: NivelPropio;
}

export const NIVELES_PROPIOS: readonly NivelPropio[] = ["ninguno", "lectura", "edicion"];

const NIVEL_DE_PROPIO: Record<NivelPropio, Nivel> = { ninguno: "n", lectura: "r", edicion: "w" };
export const propioDeNivel = (n: Nivel): NivelPropio => (n === "n" ? "ninguno" : n === "r" ? "lectura" : "edicion");

/** El nivel de cada módulo que tiene el rol (los que no están, no los ve). */
export function nivelesDeRol(permisos: PermisoRol[]): Record<string, Nivel> {
  const niveles: Record<string, Nivel> = {};
  for (const p of permisos) niveles[p.modulo] = p.solo_lectura ? "r" : "w";
  return niveles;
}

/** El nivel que de verdad tiene la persona: el del rol, salvo donde ella tiene un permiso propio (ese manda, también para quitar). */
export function nivelesEfectivos(permisosDelRol: PermisoRol[], propios: PermisoPropio[]): Record<string, Nivel> {
  const niveles = nivelesDeRol(permisosDelRol);
  for (const p of propios) {
    const nivel = NIVEL_DE_PROPIO[p.nivel];
    if (!nivel) continue;
    if (nivel === "n") delete niveles[p.modulo];
    else niveles[p.modulo] = nivel;
  }
  return niveles;
}

/** La forma que usa el resto de la app: los módulos con acceso y, de ellos, los de solo lectura. */
export function aAccesoPlano(niveles: Record<string, Nivel>): { modulos: string[]; modulosSoloLectura: string[] } {
  const modulos = Object.keys(niveles).filter((m) => niveles[m] !== "n");
  return { modulos, modulosSoloLectura: modulos.filter((m) => niveles[m] === "r") };
}

export interface Cobertura {
  w: number;
  r: number;
  n: number;
  total: number;
}

/** Cuántos módulos de la matriz tiene con edición, con lectura y sin acceso (lo que dibuja la barra de cobertura). */
export function cobertura(niveles: Record<string, Nivel>): Cobertura {
  let w = 0;
  let r = 0;
  for (const m of MODULOS_ACCESO) {
    const n = niveles[m.clave];
    if (n === "w") w++;
    else if (n === "r") r++;
  }
  const total = MODULOS_ACCESO.length;
  return { w, r, n: total - w - r, total };
}

/** En qué se aparta el acceso de la persona del de su rol (para la tabla «Acceso efectivo»). */
export interface Diferencia {
  modulo: string;
  delRol: Nivel;
  efectivo: Nivel;
}

export function diferencias(permisosDelRol: PermisoRol[], efectivos: Record<string, Nivel>): Diferencia[] {
  const delRol = nivelesDeRol(permisosDelRol);
  const claves = new Set([...Object.keys(delRol), ...Object.keys(efectivos)]);
  const lista: Diferencia[] = [];
  for (const modulo of claves) {
    const a = delRol[modulo] ?? "n";
    const b = efectivos[modulo] ?? "n";
    if (a !== b) lista.push({ modulo, delRol: a, efectivo: b });
  }
  const orden = new Map(MODULOS_ACCESO.map((m, i) => [m.clave, i]));
  return lista.sort((x, y) => (orden.get(x.modulo) ?? 999) - (orden.get(y.modulo) ?? 999));
}

/** Administra el sistema: puede modificar Usuarios y roles (la misma regla de «Ver así» y de los manuales de proceso). */
export const esAdministrador = (u: { modulos: readonly string[]; modulosSoloLectura: readonly string[] }): boolean =>
  u.modulos.includes("usuarios") && !u.modulosSoloLectura.includes("usuarios");
