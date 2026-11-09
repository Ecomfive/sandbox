"use client";

import { useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { DescargarIcon } from "@/lib/nav-icons";
import { plantillas, plantillasDe } from "@/lib/importar/plantillas";
import type { ModuloImportable } from "@/lib/importar/reconocer";

const clase = `inline-flex min-h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-sm font-medium hover:bg-muted disabled:opacity-40 ${anilloFoco}`;

/**
 * Descarga la plantilla de Excel de un importador (o de todos): las hojas y columnas exactas que espera, con una fila de
 * ejemplo. El archivo se arma en el navegador.
 */
export function BotonPlantilla({ modulo }: { modulo?: ModuloImportable }) {
  const { mostrarToast } = useToast();
  const [ocupado, setOcupado] = useState(false);
  const lista = modulo ? plantillasDe(modulo) : plantillas();

  async function bajar(clave: string) {
    const p = lista.find((x) => x.clave === clave);
    if (!p) return;
    setOcupado(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      for (const h of p.hojas) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(h.filas), h.nombre.slice(0, 31));
      XLSX.writeFile(wb, p.archivo);
    } catch {
      mostrarToast("No se pudo armar la plantilla.", "destructive");
    } finally {
      setOcupado(false);
    }
  }

  if (lista.length === 1)
    return (
      <button type="button" className={clase} disabled={ocupado} onClick={() => bajar(lista[0].clave)}>
        <DescargarIcon className="h-4 w-4" />
        Plantilla de Excel
      </button>
    );
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      <span className="flex items-center gap-1.5 font-medium">
        <DescargarIcon className="h-4 w-4" />
        Plantilla de Excel
      </span>
      <select
        className={`min-h-8 rounded-md border border-border-control bg-card px-2 text-sm ${anilloFoco}`}
        value=""
        disabled={ocupado}
        onChange={(e) => e.target.value && bajar(e.target.value)}
      >
        <option value="">Elegir…</option>
        {lista.map((p) => (
          <option key={p.clave} value={p.clave}>
            {p.etiqueta}
          </option>
        ))}
      </select>
    </label>
  );
}
