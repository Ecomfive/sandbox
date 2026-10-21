// Lo afinado dentro de un módulo: qué pestañas, acciones, campos y datos ve una persona. Se guarda solo lo que se aparta del acceso
// completo (por rol y, sobre eso, por persona) y aquí se junta en un resultado listo para consultar. Lógica pura.

import type { CatalogoModulo } from "./catalogo";

export type TipoAfinado = "pestana" | "accion" | "campo" | "alcance";
export type NivelCampo = "editar" | "ver" | "oculto";

/** Una fila guardada (de `permisos_afinados` o de `permisos_persona_afinados`). */
export interface FilaAfinada {
  modulo: string;
  tipo: TipoAfinado;
  clave: string;
  valor: string;
}

/** Lo que se aparta del acceso completo en un módulo, ya resuelto. Vacío = ve y puede todo lo que su nivel permite. */
export interface Afinado {
  pestanasOcultas: string[];
  accionesBloqueadas: string[];
  /** Solo los campos que no están en su nivel normal: `oculto`, o `ver` en uno que se podría editar. */
  campos: Record<string, "ver" | "oculto">;
  /** `todas` = sin límite; si no, la opción elegida del catálogo. */
  alcance: string;
}

export const AFINADO_COMPLETO: Afinado = { pestanasOcultas: [], accionesBloqueadas: [], campos: {}, alcance: "todas" };

const VALORES: Record<TipoAfinado, readonly string[]> = {
  pestana: ["oculta", "visible"],
  accion: ["bloqueada", "permitida"],
  campo: ["oculto", "ver", "editar"],
  alcance: [],
};

/** Los valores que se pueden guardar para cada tipo (el alcance depende del catálogo del módulo). */
export function valorValido(catalogo: CatalogoModulo, tipo: TipoAfinado, clave: string, valor: string): boolean {
  switch (tipo) {
    case "pestana":
      return catalogo.pestanas.some((p) => p.clave === clave) && VALORES.pestana.includes(valor);
    case "accion":
      return catalogo.acciones.some((a) => a.clave === clave) && VALORES.accion.includes(valor);
    case "campo": {
      const campo = catalogo.grupos.flatMap((g) => g.campos).find((c) => c.clave === clave);
      if (!campo || !VALORES.campo.includes(valor)) return false;
      if (valor === "oculto" && !campo.ocultable) return false;
      if (valor === "editar" && !campo.editable) return false;
      return true;
    }
    case "alcance":
      return clave === "alcance" && !!catalogo.alcance?.opciones.some((o) => o.valor === valor);
  }
}

/**
 * Junta lo afinado de un módulo. Las filas van en el orden en que mandan (primero las del rol, después las de la persona): una
 * posterior sobre la misma clave reemplaza a la anterior, y puede soltar lo que el rol restringía («visible», «permitida»,
 * «editar», «todas»). Lo que no existe en el catálogo o trae un valor imposible se ignora.
 */
export function resolverAfinado(catalogo: CatalogoModulo | undefined, filas: FilaAfinada[]): Afinado {
  if (!catalogo) return { ...AFINADO_COMPLETO };
  const pestanas = new Map<string, boolean>();
  const acciones = new Map<string, boolean>();
  const campos = new Map<string, NivelCampo>();
  let alcance = "todas";
  for (const f of filas) {
    if (f.modulo !== catalogo.modulo || !valorValido(catalogo, f.tipo, f.clave, f.valor)) continue;
    if (f.tipo === "pestana") pestanas.set(f.clave, f.valor === "oculta");
    else if (f.tipo === "accion") acciones.set(f.clave, f.valor === "bloqueada");
    else if (f.tipo === "campo") campos.set(f.clave, f.valor as NivelCampo);
    else alcance = f.valor;
  }
  const camposAfinados: Afinado["campos"] = {};
  for (const [clave, nivel] of campos) {
    const def = catalogo.grupos.flatMap((g) => g.campos).find((c) => c.clave === clave)!;
    if (nivel === "oculto") camposAfinados[clave] = "oculto";
    // Un dato calculado ya es de solo ver: no cuenta como apartarse.
    else if (nivel === "ver" && def.editable) camposAfinados[clave] = "ver";
  }
  return {
    pestanasOcultas: [...pestanas].filter(([, oculta]) => oculta).map(([clave]) => clave),
    accionesBloqueadas: [...acciones].filter(([, bloqueada]) => bloqueada).map(([clave]) => clave),
    campos: camposAfinados,
    alcance: alcance === (catalogo.alcance?.opciones[0]?.valor ?? "todas") ? "todas" : alcance,
  };
}

/** Cuántos ajustes tiene un módulo (lo que se ve como «5 ajustes»). */
export function contarAjustes(a: Afinado | undefined): number {
  if (!a) return 0;
  return a.pestanasOcultas.length + a.accionesBloqueadas.length + Object.keys(a.campos).length + (a.alcance !== "todas" ? 1 : 0);
}

export const pestanaVisible = (a: Afinado | undefined, clave: string): boolean => !a || !a.pestanasOcultas.includes(clave);
export const accionPermitida = (a: Afinado | undefined, clave: string): boolean => !a || !a.accionesBloqueadas.includes(clave);

/** Cómo ve una persona un campo: editable (si el dato se puede editar y no se limitó), solo ver u oculto. */
export function nivelDeCampo(a: Afinado | undefined, clave: string, editable = true): NivelCampo {
  const aparte = a?.campos[clave];
  if (aparte) return aparte;
  return editable ? "editar" : "ver";
}

export const campoVisible = (a: Afinado | undefined, clave: string): boolean => nivelDeCampo(a, clave) !== "oculto";
export const alcanceDe = (a: Afinado | undefined): string => a?.alcance ?? "todas";

/** Las filas que se guardarían para un rol o una persona a partir de un resultado ya resuelto (para copiar los ajustes de un rol). */
export function filasDeAfinado(modulo: string, a: Afinado): FilaAfinada[] {
  return [
    ...a.pestanasOcultas.map((clave): FilaAfinada => ({ modulo, tipo: "pestana", clave, valor: "oculta" })),
    ...a.accionesBloqueadas.map((clave): FilaAfinada => ({ modulo, tipo: "accion", clave, valor: "bloqueada" })),
    ...Object.entries(a.campos).map(([clave, valor]): FilaAfinada => ({ modulo, tipo: "campo", clave, valor })),
    ...(a.alcance !== "todas" ? [{ modulo, tipo: "alcance" as const, clave: "alcance", valor: a.alcance }] : []),
  ];
}

/** El valor que se guarda cuando no se aparta de nada: lo que se ve y se puede por defecto. */
export function valorPorDefecto(catalogo: CatalogoModulo, tipo: TipoAfinado, clave: string): string {
  switch (tipo) {
    case "pestana":
      return "visible";
    case "accion":
      return "permitida";
    case "alcance":
      return catalogo.alcance?.opciones[0]?.valor ?? "todas";
    case "campo":
      return catalogo.grupos.flatMap((g) => g.campos).find((c) => c.clave === clave)?.editable === false ? "ver" : "editar";
  }
}

/** El valor que tiene hoy una clave, a partir de un resultado ya resuelto (para saber si un cambio de verdad cambia algo). */
export function valorDe(catalogo: CatalogoModulo, a: Afinado, tipo: TipoAfinado, clave: string): string {
  switch (tipo) {
    case "pestana":
      return a.pestanasOcultas.includes(clave) ? "oculta" : "visible";
    case "accion":
      return a.accionesBloqueadas.includes(clave) ? "bloqueada" : "permitida";
    case "alcance":
      return a.alcance;
    case "campo":
      return a.campos[clave] ?? valorPorDefecto(catalogo, "campo", clave);
  }
}

/** La clave con la que la pantalla de afinar guarda cada elemento: `tipo:clave`. */
export const claveAfinado = (tipo: TipoAfinado, clave: string): string => `${tipo}:${clave}`;
