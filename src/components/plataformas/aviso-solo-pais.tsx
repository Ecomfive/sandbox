"use client";

import { useTransition } from "react";
import { Bandera } from "@/components/paises/bandera";
import { anilloFoco } from "@/components/ui/field";
import { PAISES_NAV } from "@/lib/nav-data";
import { PAIS_DE_DROP, plataformaDe, type PlataformaId } from "@/lib/plataformas";
import { setPaisActual } from "@/lib/pais-actions";

/**
 * El aviso de una plataforma que no existe en el país de la barra (hoy, Drop, que es solo de Costa Rica; 3 nov 2026): dice en qué país está y ofrece pasar a él con un botón
 * (no cambia el país por su cuenta). `paisPermitido` es `false` si la persona no puede ver ese país: entonces solo se avisa.
 */
export function AvisoSoloPais({ plataforma, paisPermitido = true }: { plataforma: PlataformaId; paisPermitido?: boolean }) {
  const [pendiente, empezar] = useTransition();
  const nombre = plataformaDe(plataforma).nombre;
  const pais = PAISES_NAV.find((p) => p.codigo === PAIS_DE_DROP)?.nombre ?? PAIS_DE_DROP;
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-6">
      <p className="m-0 flex items-center gap-2 text-sm">
        <Bandera codigo={PAIS_DE_DROP} />
        <span>
          {nombre} solo existe en <b className="font-semibold">{pais}</b>.
        </span>
      </p>
      {paisPermitido && (
        <button
          type="button"
          disabled={pendiente}
          onClick={() => empezar(() => setPaisActual(PAIS_DE_DROP))}
          className={`inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`}
        >
          {pendiente ? "Cambiando…" : `Ir a ${pais}`}
        </button>
      )}
    </div>
  );
}
