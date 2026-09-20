"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { DefTabla } from "@/lib/tabla/motor";
import { parsearVistasGuardadas, type VistaGuardada } from "@/lib/tabla/vistas";
import { almacen } from "./almacen";

/** Las vistas con nombre de una tabla: cada persona guarda las suyas en su navegador. */
export function useVistasGuardadas<F>(def: DefTabla<F>): [VistaGuardada[], (vistas: VistaGuardada[]) => void] {
  const a = almacen(`${def.clave}-vistas-guardadas-v1`, "local");
  const json = useSyncExternalStore(a.suscribir, a.leer, () => "");
  const vistas = useMemo(() => parsearVistasGuardadas(def, json), [def, json]);
  const guardar = useCallback((nuevas: VistaGuardada[]) => a.guardar(JSON.stringify(nuevas)), [a]);
  return [vistas, guardar];
}
