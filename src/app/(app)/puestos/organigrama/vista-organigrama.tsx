"use client";

import { useMemo, useState } from "react";
import { AvatarPersona } from "@/components/ui/avatar-persona";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import type { FilaPuesto } from "@/lib/puestos/datos";
import { armarArbol, type Nodo } from "@/lib/puestos/organigrama";
import { AREAS_PUESTO } from "@/lib/puestos/puesto";
import { libres } from "../def-puestos";
import { FichaPuesto, type OpcionesFicha } from "../ficha-puesto";

/**
 * El organigrama: el árbol de puestos activos según «Reporta a», con quién ocupa cada uno. Es una lista anidada (se lee
 * igual con un lector de pantalla y en una pantalla angosta, con sangría); cada caja abre la ficha del puesto. Filtrar por
 * área deja los puestos de esa área y los de arriba que hacen falta para verlos en su lugar.
 */
export function VistaOrganigrama({ puestos, opciones, codigoPais, puedeEscribir }: { puestos: FilaPuesto[]; opciones: Omit<OpcionesFicha, "puestos">; codigoPais: string; puedeEscribir: boolean }) {
  const [area, setArea] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const arbol = useMemo(() => podar(armarArbol(puestos), area), [puestos, area]);
  const lista = puestos.map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo }));
  const activos = puestos.filter((p) => p.activo);
  const vacantes = activos.reduce((s, p) => s + libres(p), 0);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Área</span>
          <select value={area} onChange={(e) => setArea(e.target.value)} className={`${fieldClassSm} w-56`}>
            <option value="">Todas las áreas</option>
            {AREAS_PUESTO.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <p className="m-0 flex items-center gap-2 text-sm text-muted-foreground">
          {activos.length} {activos.length === 1 ? "puesto" : "puestos"}
          {vacantes > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-warning" />
              {vacantes} {vacantes === 1 ? "vacante" : "vacantes"}
            </>
          )}
        </p>
      </div>

      {arbol.length === 0 ? (
        <p className="rounded-[10px] border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">{area ? "No hay puestos en esta área." : "Todavía no hay puestos."}</p>
      ) : (
        <div className="overflow-x-auto rounded-[10px] border border-border bg-card p-4">
          <Rama nodos={arbol} raiz abrir={setAbierto} />
        </div>
      )}

      <FichaPuesto puesto={puestos.find((p) => p.id === abierto)} opciones={{ ...opciones, puestos: lista }} codigoPais={codigoPais} puedeEscribir={puedeEscribir} alCerrar={() => setAbierto(null)} />
    </>
  );
}

/** Deja solo las ramas que tienen algún puesto del área (con sus jefes, para que se vea dónde cuelgan). */
function podar(nodos: Nodo<FilaPuesto>[], area: string): Nodo<FilaPuesto>[] {
  if (!area) return nodos;
  return nodos.flatMap((n) => {
    const hijos = podar(n.hijos, area);
    return n.puesto.area === area || hijos.length > 0 ? [{ ...n, hijos }] : [];
  });
}

function Rama({ nodos, raiz, abrir }: { nodos: Nodo<FilaPuesto>[]; raiz?: boolean; abrir: (id: string) => void }) {
  return (
    <ul className={`m-0 flex list-none flex-col gap-2 p-0 ${raiz ? "" : "ml-4 border-l border-border pl-4 sm:ml-6 sm:pl-6"}`}>
      {nodos.map((n) => (
        <li key={n.puesto.id} className="flex flex-col gap-2">
          <Caja puesto={n.puesto} abrir={abrir} />
          {n.hijos.length > 0 && <Rama nodos={n.hijos} abrir={abrir} />}
        </li>
      ))}
    </ul>
  );
}

function Caja({ puesto, abrir }: { puesto: FilaPuesto; abrir: (id: string) => void }) {
  const vacantes = libres(puesto);
  return (
    <button
      type="button"
      onClick={() => abrir(puesto.id)}
      aria-label={`Abrir la ficha del puesto ${puesto.nombre}`}
      className={`flex w-full max-w-md min-w-60 flex-col gap-2 border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-muted ${anilloFoco} !rounded-lg`}
    >
      <span className="flex items-center gap-2">
        {vacantes > 0 && <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-warning" />}
        <span className="truncate text-sm font-semibold">{puesto.nombre}</span>
        <span className="ml-auto shrink-0 text-xs text-muted-foreground">{puesto.area}</span>
      </span>
      <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {puesto.ocupantes.map((o) => (
          <span key={o.id} className="flex items-center gap-1.5 text-sm">
            <AvatarPersona nombre={o.nombre} email={o.email} avatarUrl={o.avatarUrl} tamano="sm" />
            {o.nombre}
          </span>
        ))}
        {vacantes > 0 && <span className="text-sm text-muted-foreground">{vacantes === 1 ? "1 plaza vacante" : `${vacantes} plazas vacantes`}</span>}
      </span>
    </button>
  );
}
