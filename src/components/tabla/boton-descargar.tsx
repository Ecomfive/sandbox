"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { ChevronRightIcon, DescargarIcon } from "@/lib/nav-icons";
import { filasACsv, nombreArchivoCsv } from "@/lib/tabla/csv";
import { usePuedeDescargarPdf } from "./descarga-pdf-contexto";
import type { DefTabla } from "@/lib/tabla/motor";

/** Una descarga que arma el servidor con más datos de los que la tabla tiene cargados (todo un período, todo el historial). */
export interface DescargaCompleta {
  href: string;
  /** Lo que dice la opción: «Todo el período». */
  etiqueta: string;
  /** Detalle en gris: «1 790 órdenes». */
  detalle?: string;
}

const OPCION =
  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-foreground focus-visible:outline-none";

/**
 * «Descargar»: menú con las filas que se ven ahora (con los filtros y en el orden de la pantalla) como **Excel (.xlsx)** —con números, fechas y
 * texto en su sitio, títulos fijos con filtro y columnas a su ancho (9 nov 2026: el CSV con comas se abría en una sola columna en un Excel en
 * español)— o como CSV. El archivo se arma en el navegador con la definición de la tabla, sin pedirle nada al servidor; el CSV lleva una
 * marca al principio (BOM) para que Excel lea bien los acentos.
 *
 * Si la tabla solo tiene cargada una parte de los datos (500 órdenes de 1 790; los últimos extractos) y el
 * servidor sabe armar el total, la página pasa `completa` y el botón ofrece las dos cosas en un menú pequeño:
 * «Lo que se ve» y la descarga completa. Es un solo botón: no hay un segundo enlace «Descargar CSV» al lado.
 *
 * Quien está en `PUEDEN_DESCARGAR_PDF` (8 nov 2026, solo Alcides) ve además «Lo que se ve en PDF»: las mismas filas en una hoja para enviar
 * (`filasAPdf`, `src/lib/tabla/pdf.ts`, que se carga al pulsar).
 */
export function BotonDescargar<F>({
  def,
  filas,
  nombreFilas,
  ayuda = "Descargar filas visibles",
  completa,
}: {
  def: DefTabla<F>;
  filas: F[];
  nombreFilas: string;
  /** Lo que dice el tooltip; cambia si lo que baja no son las filas visibles (p. ej. las seleccionadas). */
  ayuda?: string;
  completa?: DescargaCompleta;
}) {
  const { mostrarToast } = useToast();
  const puedePdf = usePuedeDescargarPdf();
  const [armandoPdf, setArmandoPdf] = useState(false);
  const [armandoExcel, setArmandoExcel] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const vacio = filas.length === 0;
  const cantidad = `${filas.length} ${filas.length === 1 ? "fila" : "filas"}`;

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
    mostrarToast(`Descargadas ${cantidad} (${nombreFilas})`);
  }

  // Excel (.xlsx): las mismas filas y columnas que el CSV, pero con números, fechas y texto en su sitio, títulos fijos con filtro y columnas a su ancho.
  async function descargarExcel() {
    if (vacio || armandoExcel) return;
    setArmandoExcel(true);
    try {
      const { tablaAXlsx, nombreArchivoXlsx } = await import("@/lib/tabla/xlsx");
      const titulo = document.title.replace(/\s*·\s*Ecomfive\s*$/, "") || nombreFilas;
      const bytes = await tablaAXlsx(def, filas, titulo);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreArchivoXlsx(def.clave, new Date());
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      mostrarToast(`Descargadas ${cantidad} en Excel (${nombreFilas})`);
    } catch {
      mostrarToast("No se pudo armar el Excel. Inténtalo de nuevo.", "destructive");
    } finally {
      setArmandoExcel(false);
    }
  }

  async function descargarPdf() {
    if (vacio || armandoPdf) return;
    setArmandoPdf(true);
    try {
      const { filasAPdf, nombreArchivoPdf } = await import("@/lib/tabla/pdf");
      const titulo = document.title.replace(/\s*·\s*Ecomfive\s*$/, "") || nombreFilas;
      const bytes = await filasAPdf(def, filas, titulo, new Date(), def.pdfFoto ? fotoParaPdf : undefined);
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombreArchivoPdf(def.clave, new Date());
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      mostrarToast(`Descargadas ${cantidad} en PDF (${nombreFilas})`);
    } catch {
      mostrarToast("No se pudo armar el PDF. Inténtalo de nuevo.", "destructive");
    } finally {
      setArmandoPdf(false);
    }
  }

  // Menú abierto: el foco pasa a la primera opción; Escape o pulsar fuera lo cierran.
  useEffect(() => {
    if (!abierto) return;
    raiz.current?.querySelector<HTMLElement>("[data-opcion]")?.focus();
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setAbierto(false);
      boton.current?.focus();
    }
    function alPulsar(e: PointerEvent) {
      if (!raiz.current?.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener("keydown", alTeclear);
    document.addEventListener("pointerdown", alPulsar);
    return () => {
      document.removeEventListener("keydown", alTeclear);
      document.removeEventListener("pointerdown", alPulsar);
    };
  }, [abierto]);

  return (
    <div
      ref={raiz}
      className="relative"
      onBlur={(e) => {
        // El foco salió del botón y del menú (Tab hacia fuera): se cierra.
        if (abierto && !raiz.current?.contains(e.relatedTarget as Node | null)) setAbierto(false);
      }}
    >
      <Tooltip texto="Elegir qué descargar">
        <button
          ref={boton}
          type="button"
          onClick={() => setAbierto((a) => !a)}
          aria-expanded={abierto}
          aria-label="Descargar, elegir qué bajar"
          className={`flex min-h-8 items-center gap-1.5 !rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted ${anilloFoco}`}
        >
          <DescargarIcon className="h-4 w-4" />
          <span className="sr-only">Descargar</span>
          <ChevronRightIcon className={`h-3 w-3 transition-transform motion-reduce:transition-none ${abierto ? "-rotate-90" : "rotate-90"}`} />
        </button>
      </Tooltip>
      {abierto && (
        <div
          role="group"
          aria-label="Qué descargar"
          className="absolute top-full right-0 z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-card p-1.5 shadow-lg"
        >
          <button
            type="button"
            data-opcion=""
            disabled={vacio || armandoExcel}
            onClick={async () => {
              await descargarExcel();
              setAbierto(false);
              boton.current?.focus();
            }}
            className={`${OPCION} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span>{armandoExcel ? "Armando el Excel…" : "Lo que se ve en Excel"}</span>
            <span className="text-xs text-muted-foreground tabular-nums">{vacio ? "sin filas" : cantidad}</span>
          </button>
          <button
            type="button"
            data-opcion=""
            disabled={vacio}
            onClick={() => {
              descargar();
              setAbierto(false);
              boton.current?.focus();
            }}
            className={`${OPCION} disabled:cursor-not-allowed disabled:opacity-50`}
          >
            <span>Lo que se ve en CSV</span>
            <span className="text-xs text-muted-foreground tabular-nums">{vacio ? "sin filas" : cantidad}</span>
          </button>
          {puedePdf && (
            <button
              type="button"
              data-opcion=""
              disabled={vacio || armandoPdf}
              onClick={async () => {
                await descargarPdf();
                setAbierto(false);
                boton.current?.focus();
              }}
              className={`${OPCION} disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <span>{armandoPdf ? "Armando el PDF…" : "Lo que se ve en PDF"}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{vacio ? "sin filas" : cantidad}</span>
            </button>
          )}
          {completa && (
            <a href={completa.href} download data-opcion="" onClick={() => setAbierto(false)} className={OPCION}>
              <span>{completa.etiqueta}</span>
              {completa.detalle && <span className="text-xs text-muted-foreground tabular-nums">{completa.detalle}</span>}
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Lado mayor de la foto en el PDF, en píxeles: el doble de lo que ocupa, para que se vea nítida al imprimir. */
const LADO_FOTO_PDF = 160;

/**
 * Trae una foto para el PDF y la achica a un JPEG (pdf-lib solo pone JPEG o PNG, y así el PDF pesa poco aunque la foto sea WEBP o grande). Si la red de
 * fotos de Dropi no deja leerla desde el navegador, la pide a través del sistema (`/api/publicaciones-dropi/foto`). null si no se pudo.
 */
async function fotoParaPdf(url: string): Promise<Uint8Array | null> {
  const traer = async (u: string) => {
    const r = await fetch(u, { credentials: u.startsWith("/") ? "same-origin" : "omit" });
    return r.ok ? r.blob() : null;
  };
  let blob: Blob | null = null;
  try {
    blob = await traer(url);
  } catch {
    blob = null;
  }
  if (!blob && /^https:\/\/[^/]*cloudfront\.net\//.test(url)) {
    try {
      blob = await traer(`/api/publicaciones-dropi/foto?u=${encodeURIComponent(url)}`);
    } catch {
      blob = null;
    }
  }
  if (!blob) return null;
  try {
    const bmp = await createImageBitmap(blob);
    const k = Math.min(1, LADO_FOTO_PDF / Math.max(bmp.width, bmp.height));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.max(1, Math.round(bmp.width * k));
    lienzo.height = Math.max(1, Math.round(bmp.height * k));
    const ctx = lienzo.getContext("2d");
    if (!ctx) return null;
    // Fondo blanco: una PNG transparente no queda negra en JPEG.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, lienzo.width, lienzo.height);
    ctx.drawImage(bmp, 0, 0, lienzo.width, lienzo.height);
    bmp.close();
    const jpeg = await new Promise<Blob | null>((ok) => lienzo.toBlob(ok, "image/jpeg", 0.85));
    return jpeg ? new Uint8Array(await jpeg.arrayBuffer()) : null;
  } catch {
    return null;
  }
}
