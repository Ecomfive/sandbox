"use client";

import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { DescargarIcon } from "@/lib/nav-icons";
import { filasACsv, nombreArchivoCsv } from "@/lib/tabla/csv";
import type { DefTabla } from "@/lib/tabla/motor";

/**
 * «Descargar»: baja como CSV las filas que se ven ahora (con los filtros y en el orden de la pantalla). El
 * archivo se arma en el navegador con la definición de la tabla, sin pedirle nada al servidor. Lleva una
 * marca al principio (BOM) para que Excel lea bien los acentos.
 */
export function BotonDescargar<F>({
  def,
  filas,
  nombreFilas,
  ayuda = "Descargar filas visibles",
}: {
  def: DefTabla<F>;
  filas: F[];
  nombreFilas: string;
  /** Lo que dice el tooltip; cambia si lo que baja no son las filas visibles (p. ej. las seleccionadas). */
  ayuda?: string;
}) {
  const { mostrarToast } = useToast();
  const vacio = filas.length === 0;

  function descargar() {
    if (vacio) return;
    const contenido = "﻿" + filasACsv(def, filas);
    const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = nombreArchivoCsv(def.clave, new Date());
    document.body.appendChild(enlace);
    enlace.click();
    enlace.remove();
    URL.revokeObjectURL(url);
    mostrarToast(`Descargadas ${filas.length} ${filas.length === 1 ? "fila" : "filas"} (${nombreFilas})`);
  }

  return (
    <Tooltip texto={vacio ? "No hay filas para descargar" : ayuda}>
      <button
        type="button"
        onClick={descargar}
        aria-disabled={vacio || undefined}
        aria-label={vacio ? "Descargar, no hay filas" : `Descargar ${filas.length} ${filas.length === 1 ? "fila" : "filas"} en CSV`}
        className={`flex min-h-8 items-center gap-1.5 !rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted ${anilloFoco} ${
          vacio ? "cursor-not-allowed opacity-60" : ""
        }`}
      >
        <DescargarIcon className="h-4 w-4" />
        Descargar
      </button>
    </Tooltip>
  );
}
