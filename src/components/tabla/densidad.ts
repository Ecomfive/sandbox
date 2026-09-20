"use client";

import { useCallback, useSyncExternalStore } from "react";
import { parsearDensidad, type Densidad } from "@/lib/tabla/densidad";
import { almacen } from "./almacen";

/** Densidad de las filas: cada persona conserva la suya, y vale para todas las tablas a la vez. */
export function useDensidad(): [Densidad, (densidad: Densidad) => void] {
  const a = almacen("densidad-filas-v1", "local");
  const guardado = useSyncExternalStore(a.suscribir, a.leer, () => "");
  const cambiar = useCallback((densidad: Densidad) => a.guardar(densidad), [a]);
  return [parsearDensidad(guardado), cambiar];
}
