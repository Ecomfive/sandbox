"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import type { ColumnaExcel } from "@/lib/proveedor/excel";
import type { FilaExcel } from "@/lib/proveedor/excel-portal";
import { useIdioma } from "./idioma-contexto";
import { botonNormal } from "./piezas-proveedor";
import { useSeleccion } from "./seleccion";

/**
 * «Descargar Excel» de una pestaña del portal (28 oct 2026): baja un .xlsx con las filas que se ven (las que dejan el buscador y el país) o,
 * si la persona marcó algunas, solo esas. El archivo se arma aquí, en el navegador, y la pieza que lo arma se carga al pulsar.
 * `clave` da el nombre del archivo y de la hoja.
 */
export function BotonExcel({ clave, titulo, columnas, filas }: { clave: string; titulo: string; columnas: ColumnaExcel[]; filas: FilaExcel[] }) {
  const { t } = useIdioma();
  const { mostrarToast } = useToast();
  const sel = useSeleccion();
  const [ocupado, setOcupado] = useState(false);
  const marcadas = sel ? filas.filter((f) => sel.ids.has(f.id)) : [];
  const aBajar = marcadas.length ? marcadas : filas;

  async function descargar() {
    if (!aBajar.length || ocupado) return;
    setOcupado(true);
    try {
      const { filasAXlsx, nombreArchivoExcel } = await import("@/lib/proveedor/excel");
      const bytes = filasAXlsx(titulo, columnas, aBajar.map((f) => f.celdas));
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreArchivoExcel(clave, new Date());
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      URL.revokeObjectURL(url);
      mostrarToast(t.excelListo(aBajar.length));
    } catch {
      mostrarToast(t.excelError, "destructive");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {marcadas.length > 0 && (
        <button type="button" className={`${botonNormal} border-transparent bg-transparent text-muted-foreground hover:text-foreground`} onClick={() => sel?.limpiar()}>
          {t.quitarSeleccion}
        </button>
      )}
      <button type="button" className={botonNormal} disabled={!aBajar.length || ocupado} onClick={descargar}>
        {marcadas.length ? t.descargarSeleccion(marcadas.length) : t.descargarExcel}
      </button>
    </span>
  );
}
