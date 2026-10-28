"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useIdioma } from "./idioma-contexto";

// Las filas que la persona marcó en la pestaña del portal para bajarlas en Excel (28 oct 2026). Una sola selección para todo el portal: al
// cambiar de pestaña se limpia. Sin proveedor (otra pantalla que use la tabla) no hay casillas y el botón baja todo lo que se ve.

interface Seleccion {
  ids: ReadonlySet<string>;
  alternar: (id: string) => void;
  marcar: (ids: string[], marcada: boolean) => void;
  limpiar: () => void;
}

const SeleccionCtx = createContext<Seleccion | null>(null);

export function SeleccionProveedor({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const alternar = useCallback((id: string) => setIds((a) => (a.has(id) ? new Set([...a].filter((x) => x !== id)) : new Set(a).add(id))), []);
  const marcar = useCallback(
    (nuevos: string[], marcada: boolean) => setIds((a) => (marcada ? new Set([...a, ...nuevos]) : new Set([...a].filter((x) => !nuevos.includes(x))))),
    [],
  );
  const limpiar = useCallback(() => setIds((a) => (a.size ? new Set() : a)), []);
  const valor = useMemo(() => ({ ids, alternar, marcar, limpiar }), [ids, alternar, marcar, limpiar]);
  return <SeleccionCtx.Provider value={valor}>{children}</SeleccionCtx.Provider>;
}

export const useSeleccion = () => useContext(SeleccionCtx);

const claseCasilla = `h-4 w-4 cursor-pointer align-middle accent-primario ${anilloFoco}`;

/** La casilla de una fila (no se dibuja sin selección). */
export function CasillaFila({ id, nombre }: { id: string; nombre: string }) {
  const sel = useSeleccion();
  const { t } = useIdioma();
  if (!sel) return null;
  return <input type="checkbox" className={claseCasilla} checked={sel.ids.has(id)} onChange={() => sel.alternar(id)} aria-label={t.seleccionarFila(nombre)} />;
}

/** La casilla del encabezado: marca o desmarca todas las filas que se ven (`ids`); se ve a medias si solo hay algunas. */
export function CasillaTodas({ ids }: { ids: string[] }) {
  const sel = useSeleccion();
  const { t } = useIdioma();
  const ref = useRef<HTMLInputElement>(null);
  const marcadas = sel ? ids.filter((id) => sel.ids.has(id)).length : 0;
  const todas = ids.length > 0 && marcadas === ids.length;
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = marcadas > 0 && !todas;
  }, [marcadas, todas]);
  if (!sel) return null;
  return <input ref={ref} type="checkbox" className={claseCasilla} checked={todas} onChange={() => sel.marcar(ids, !todas)} aria-label={t.seleccionarTodas} />;
}

/** La celda de la casilla (encabezado `th` o fila `td`), angosta. Sin selección no dibuja nada, así la tabla queda como estaba. */
export function ColumnaCasilla({ encabezado, ids, id, nombre }: { encabezado?: boolean; ids?: string[]; id?: string; nombre?: string }) {
  const sel = useSeleccion();
  if (!sel) return null;
  return encabezado ? (
    <th scope="col" className="w-9 border-b border-border px-3 py-2.5 text-left align-middle">
      <CasillaTodas ids={ids ?? []} />
    </th>
  ) : (
    <td className="w-9 px-3 py-2 align-middle">
      <CasillaFila id={id ?? ""} nombre={nombre ?? ""} />
    </td>
  );
}
