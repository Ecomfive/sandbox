// Una sola llamada para revisar el acceso en una acción o ruta del servidor: módulo (lectura o escritura), luego país y luego
// tienda. Antes cada acción juntaba las piezas a mano y era fácil olvidar el país o la tienda (plan de seguridad, fase 4 ·
// 18 nov 2026). No lanza por un permiso: devuelve el mismo aviso en español que ya usa el sistema. Las reglas son las de
// siempre (`motivoSinModulo`, `pais-acceso.ts`, `fila-pais.ts`, `acceso-tienda.ts`); aquí solo se ordenan.

import type { SupabaseClient } from "@supabase/supabase-js";
import { getUsuarioActual, motivoSinModulo, type UsuarioActual } from "@/lib/auth";
import { sinAccesoARegistros, sinAccesoAUnidades, sinAccesoTodaLaEmpresa, type TablaConTienda } from "@/lib/finanzas/acceso-tienda";
import { filaDePaisPermitida } from "@/lib/seguridad/fila-pais";
import { puedeVerBodega, puedeVerPaisId, SIN_ACCESO_PAIS } from "@/lib/seguridad/pais-acceso";
import { createServiceClient } from "@/lib/supabase/server";

export interface OpcionesAcceso {
  /** La clave del módulo (la de `permisos_rol`). */
  modulo: string;
  /** true = la acción modifica datos (quien tiene el módulo en solo lectura no pasa). Por defecto, lectura. */
  escritura?: boolean;
  /** Un país que manda el navegador. Si la opción viene (aunque sea null), se revisa: con países limitados, null no pasa. */
  paisId?: string | null;
  /** Una fila con `pais_id` guardado (se lee de la base, nunca del navegador). */
  filaDePais?: { tabla: string; id: string };
  /** Una bodega (por el país de la bodega). Si la opción viene (aunque sea null), se revisa. */
  bodegaId?: string | null;
  /** Tiendas que manda el navegador (null = sin tienda, de toda la empresa: con tiendas limitadas no pasa). */
  unidades?: (string | null)[];
  /** Registros con tienda guardada (se lee la tienda de la base). */
  registros?: { tabla: TablaConTienda; ids: string[] };
  /** La acción es de toda la empresa: solo quien ve todas las tiendas. */
  todaLaEmpresa?: boolean;
}

export type ResultadoAcceso = { usuario: UsuarioActual; error?: undefined } | { error: string; usuario?: undefined };

/** Lo que lee la base. Se pasa aparte para probar el orden con dobles (`exigir-acceso.test.ts`). */
export interface DependenciasAcceso {
  cliente: () => SupabaseClient;
  puedeVerPaisId: typeof puedeVerPaisId;
  filaDePaisPermitida: typeof filaDePaisPermitida;
  puedeVerBodega: typeof puedeVerBodega;
  sinAccesoAUnidades: typeof sinAccesoAUnidades;
  sinAccesoARegistros: typeof sinAccesoARegistros;
  sinAccesoTodaLaEmpresa: typeof sinAccesoTodaLaEmpresa;
}

export const DEPENDENCIAS: DependenciasAcceso = {
  cliente: createServiceClient,
  puedeVerPaisId,
  filaDePaisPermitida,
  puedeVerBodega,
  sinAccesoAUnidades,
  sinAccesoARegistros,
  sinAccesoTodaLaEmpresa,
};

/**
 * Revisa el acceso de `usuario` (el de `getUsuarioActual`; null = sin sesión) en este orden: módulo, país, tienda. Sin
 * países limitados no lee nada del país; sin tiendas limitadas, nada de la tienda.
 */
export async function revisarAcceso(usuario: UsuarioActual | null, opciones: OpcionesAcceso, deps: DependenciasAcceso = DEPENDENCIAS): Promise<ResultadoAcceso> {
  const motivo = motivoSinModulo(usuario, opciones.modulo, opciones.escritura === true);
  if (motivo || !usuario) return { error: motivo ?? "No hay sesión activa." };

  let cliente: SupabaseClient | null = null;
  const base = () => (cliente ??= deps.cliente());

  const paises = usuario.paisesPermitidos;
  if (paises !== null) {
    if ("paisId" in opciones && !(await deps.puedeVerPaisId(base(), paises, opciones.paisId))) return { error: SIN_ACCESO_PAIS };
    const fila = opciones.filaDePais;
    if (fila && !(fila.id && (await deps.filaDePaisPermitida(base(), paises, fila.tabla, fila.id)))) return { error: SIN_ACCESO_PAIS };
    if ("bodegaId" in opciones && !(opciones.bodegaId && (await deps.puedeVerBodega(base(), paises, opciones.bodegaId)))) return { error: SIN_ACCESO_PAIS };
  }

  if (usuario.tiendasPermitidas !== null) {
    if (opciones.todaLaEmpresa) {
      const e = await deps.sinAccesoTodaLaEmpresa();
      if (e) return { error: e };
    }
    if (opciones.unidades) {
      const e = await deps.sinAccesoAUnidades(opciones.unidades);
      if (e) return { error: e };
    }
    if (opciones.registros) {
      const e = await deps.sinAccesoARegistros(base(), opciones.registros.tabla, opciones.registros.ids);
      if (e) return { error: e };
    }
  }

  return { usuario };
}

/**
 * La guardia para toda acción o ruta NUEVA: sesión + módulo + país + tienda en una llamada. Devuelve `{ usuario }` o
 * `{ error }` (nunca lanza por un permiso).
 *
 *   const acceso = await exigirAcceso({ modulo: "bienes-de-uso", escritura: true, registros: { tabla: "fin_bienes_uso", ids: [id] } });
 *   if (acceso.error) return { error: acceso.error };
 *   const { usuario } = acceso;
 */
export async function exigirAcceso(opciones: OpcionesAcceso): Promise<ResultadoAcceso> {
  return revisarAcceso(await getUsuarioActual(), opciones);
}
