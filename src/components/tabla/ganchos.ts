"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { parsearFiltros, type DefTabla, type Filtro } from "@/lib/tabla/motor";
import { parsearVista, vistaDefecto, type Vista } from "@/lib/tabla/vista";
import { almacen } from "./almacen";

/** Filtros de la tabla: se guardan en la sesión, para que sobrevivan a entrar a un registro y volver. */
export function useFiltros<F>(def: DefTabla<F>): [Filtro[], (filtros: Filtro[]) => void] {
  const a = almacen(`${def.clave}-filtros-v1`, "sesion");
  const json = useSyncExternalStore(a.suscribir, a.leer, () => "");
  const filtros = useMemo(() => parsearFiltros(def, json), [def, json]);
  const cambiar = useCallback((nuevos: Filtro[]) => a.guardar(JSON.stringify(nuevos)), [a]);
  return [filtros, cambiar];
}

/** Vista de la tabla (agrupar, orden de los grupos, cerrados): cada persona conserva la suya. */
export function useVista<F>(def: DefTabla<F>): [Vista, (cambio: Partial<Vista>) => void] {
  const a = almacen(`${def.clave}-vista-v1`, "local");
  const json = useSyncExternalStore(a.suscribir, a.leer, () => "");
  const vista = useMemo(() => (json === "" ? vistaDefecto(def) : parsearVista(def, json)), [def, json]);
  const cambiar = useCallback(
    (cambio: Partial<Vista>) => a.guardar(JSON.stringify({ ...parsearVista(def, a.leer()), ...cambio })),
    [def, a]
  );
  return [vista, cambiar];
}

export interface ColumnaDef {
  id: string;
  label: string;
  /** Si se puede ocultar (la columna clave, como el número, no). */
  ocultable: boolean;
}

export interface EstadoColumnas {
  orden: string[];
  ocultas: Set<string>;
}

/** Orden y visibilidad de columnas: se guarda por persona y descarta columnas que ya no existen. */
export function useColumnas(
  clave: string,
  columnas: ColumnaDef[]
): [EstadoColumnas, (cambio: { orden?: string[]; ocultas?: string[] }) => void] {
  const a = almacen(`${clave}-columnas-v1`, "local");
  const json = useSyncExternalStore(a.suscribir, a.leer, () => "");

  const estado = useMemo<EstadoColumnas>(() => {
    const ids = columnas.map((c) => c.id);
    let orden = ids;
    let ocultas: string[] = [];
    if (json !== "") {
      try {
        const datos = JSON.parse(json) as { orden?: unknown[]; ocultas?: unknown[] };
        const esId = (v: unknown): v is string => typeof v === "string" && ids.includes(v);
        const guardado = (datos.orden ?? []).filter(esId);
        orden = [...guardado, ...ids.filter((id) => !guardado.includes(id))];
        const noOcultables = new Set(columnas.filter((c) => !c.ocultable).map((c) => c.id));
        ocultas = (datos.ocultas ?? []).filter(esId).filter((id) => !noOcultables.has(id));
      } catch {
        // Datos guardados dañados: se usa el orden por defecto.
      }
    }
    return { orden, ocultas: new Set(ocultas) };
  }, [json, columnas]);

  const cambiar = useCallback(
    (cambio: { orden?: string[]; ocultas?: string[] }) =>
      a.guardar(
        JSON.stringify({
          orden: cambio.orden ?? estado.orden,
          ocultas: cambio.ocultas ?? [...estado.ocultas],
        })
      ),
    [a, estado]
  );
  return [estado, cambiar];
}
