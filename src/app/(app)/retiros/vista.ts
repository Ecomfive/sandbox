import {
  agruparFilas,
  aplicarVista as aplicarVistaDe,
  camposAgrupables,
  filtroPideCerrados as filtroPideCerradosDe,
  parsearVista as parsearVistaDe,
  vistaDefecto,
  type OrdenGrupos,
  type Vista,
} from "@/lib/tabla/vista";
import type { Filtro } from "@/lib/tabla/motor";
import { DEF_RETIROS } from "./filtros";
import type { FilaRetiro } from "./tabla-retiros";

export type { Grupo, OrdenGrupos, Vista } from "@/lib/tabla/vista";

/** Campos por los que se puede agrupar la tabla de retiros. */
export const CAMPOS_AGRUPABLES = camposAgrupables(DEF_RETIROS);
export type CampoAgrupable = "estado" | "plataforma" | "destino" | "dropi" | "asignado";

/** Como en ClickUp, los cerrados arrancan ocultos y un botón los muestra. */
export const VISTA_DEFECTO: Vista = vistaDefecto(DEF_RETIROS);

export const parsearVista = (json: string): Vista => parsearVistaDe(DEF_RETIROS, json);
export const filtroPideCerrados = (filtros: Filtro[]) => filtroPideCerradosDe(DEF_RETIROS, filtros);
export const aplicarVista = (filas: FilaRetiro[], filtros: Filtro[], mostrarCerrados: boolean) =>
  aplicarVistaDe(DEF_RETIROS, filas, filtros, mostrarCerrados);
export const agruparRetiros = (filas: FilaRetiro[], campo: CampoAgrupable, orden: OrdenGrupos = "asc") =>
  agruparFilas(DEF_RETIROS, filas, campo, orden);
