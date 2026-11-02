"use client";

import { useState } from "react";
import { useToast } from "@/components/ui/toast";
import type { ColumnaExcel, ImagenExcel } from "@/lib/proveedor/excel";
import type { FilaExcel } from "@/lib/proveedor/excel-portal";
import { useIdioma } from "./idioma-contexto";
import { botonNormal } from "./piezas-proveedor";
import { useSeleccion } from "./seleccion";

/**
 * «Descargar Excel» de una pestaña del portal (28 oct 2026): baja un .xlsx con las filas que se ven (las que dejan el buscador y el país) o,
 * si la persona marcó algunas, solo esas. El archivo se arma aquí, en el navegador, y la pieza que lo arma se carga al pulsar.
 * `clave` da el nombre del archivo y de la hoja. Las fotos de la pestaña van como miniaturas (29 oct 2026): se traen aquí y se achican.
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
      const bytes = await filasAXlsx(titulo, columnas, aBajar.map((f) => f.celdas), miniatura);
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
        {ocupado ? t.excelPreparando : marcadas.length ? t.descargarSeleccion(marcadas.length) : t.descargarExcel}
      </button>
    </span>
  );
}

/** Lado mayor de la miniatura en píxeles: el doble de lo que ocupa en el Excel, para que se vea nítida. */
const LADO_MINIATURA = 128;

/**
 * Trae una foto y la achica a una miniatura JPEG (Excel solo admite PNG, JPEG o GIF, y así el archivo pesa poco aunque la foto original
 * sea WEBP o muy grande). null si no se pudo traer o leer: esa celda queda sin foto.
 */
async function miniatura(url: string): Promise<ImagenExcel | null> {
  try {
    const r = await fetch(url, { credentials: "omit" });
    if (!r.ok) return null;
    const bmp = await createImageBitmap(await r.blob());
    const k = Math.min(1, LADO_MINIATURA / Math.max(bmp.width, bmp.height));
    const ancho = Math.max(1, Math.round(bmp.width * k));
    const alto = Math.max(1, Math.round(bmp.height * k));
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;
    // Fondo blanco: las PNG transparentes no quedan negras en JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(bmp, 0, 0, ancho, alto);
    bmp.close();
    return { base64: lienzo.toDataURL("image/jpeg", 0.85), extension: "jpeg", ancho, alto };
  } catch {
    return null;
  }
}
