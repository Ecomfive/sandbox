"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { anilloFoco } from "@/components/ui/field";
import type { ArchivoVisible } from "@/lib/monday/comprobantes";

/**
 * Comprobantes y adjuntos que se ven en el sistema (16 nov 2026, pedido de Hernán: «que el botón Ver no me mande a Monday»): miniaturas y, al tocar
 * una, el archivo en grande aquí mismo, con anterior / siguiente y descargar. Los PDF se abren dentro; lo que el navegador no muestra (HEIC) se descarga.
 * La ventana se dibuja directo en <body> (18 nov 2026, pedido de Hernán): dentro del panel del pedido, que es fijo al bajar, la cabecera de la tabla
 * de Despacho ciudad le pasaba por encima.
 */
export function VisorArchivos({ archivos, titulo, compacto = false }: { archivos: ArchivoVisible[]; titulo: string; compacto?: boolean }) {
  const [abierto, setAbierto] = useState<number | null>(null);
  if (!archivos.length) return null;
  const actual = abierto === null ? null : archivos[abierto];
  const mover = (d: number) => setAbierto((i) => (i === null ? null : (i + d + archivos.length) % archivos.length));
  const lado = compacto ? "h-9 w-9" : "h-20 w-16";

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        {archivos.map((a, i) => (
          <button
            key={a.url}
            type="button"
            onClick={() => setAbierto(i)}
            aria-label={`Ver ${titulo.toLowerCase()} ${i + 1}`}
            className={`${lado} flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted ${anilloFoco}`}
          >
            {a.clase === "imagen" ? (
              // eslint-disable-next-line @next/next/no-img-element -- enlace firmado o temporal, no pasa por el optimizador de imágenes
              <img src={a.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[10px] font-semibold text-muted-foreground uppercase">{a.clase === "pdf" ? "PDF" : "Archivo"}</span>
            )}
          </button>
        ))}
        {compacto && (
          <button type="button" onClick={() => setAbierto(0)} className={`rounded px-1.5 py-1 text-xs font-semibold text-primario hover:bg-primario-suave ${anilloFoco}`}>
            Ver
          </button>
        )}
      </div>
      {actual && abierto !== null && createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${titulo} ${abierto + 1} de ${archivos.length}`}
          onKeyDown={(e) => {
            if (e.key === "Escape") setAbierto(null);
            if (e.key === "ArrowRight") mover(1);
            if (e.key === "ArrowLeft") mover(-1);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
        >
          <button type="button" aria-label="Cerrar" onClick={() => setAbierto(null)} className="absolute inset-0 cursor-default bg-transparent" />
          <div className="relative flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-card shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <b className="text-[15px]">
                {titulo} {abierto + 1} de {archivos.length}
              </b>
              <div className="flex gap-1.5">
                {archivos.length > 1 && (
                  <>
                    <button type="button" onClick={() => mover(-1)} aria-label="Anterior" className={`min-h-9 rounded-md border border-border px-3 text-sm ${anilloFoco}`}>
                      ‹
                    </button>
                    <button type="button" onClick={() => mover(1)} aria-label="Siguiente" className={`min-h-9 rounded-md border border-border px-3 text-sm ${anilloFoco}`}>
                      ›
                    </button>
                  </>
                )}
                <a href={actual.url} download={actual.nombre} target="_blank" rel="noreferrer" className={`inline-flex min-h-9 items-center rounded-md border border-border px-3 text-sm ${anilloFoco}`}>
                  Descargar
                </a>
                <button type="button" autoFocus onClick={() => setAbierto(null)} className={`boton-neon min-h-9 rounded-md px-3 text-sm font-medium text-white ${anilloFoco}`}>
                  Cerrar
                </button>
              </div>
            </div>
            <div className="flex min-h-[50vh] items-center justify-center overflow-auto bg-muted p-4">
              {actual.clase === "imagen" ? (
                // eslint-disable-next-line @next/next/no-img-element -- enlace firmado o temporal
                <img src={actual.url} alt={`${titulo} ${abierto + 1}`} className="max-h-[75vh] max-w-full rounded-lg object-contain" />
              ) : actual.clase === "pdf" ? (
                <iframe src={actual.url} title={`${titulo} ${abierto + 1}`} className="h-[75vh] w-full rounded-lg bg-white" />
              ) : (
                <p className="m-0 text-sm text-muted-foreground">Este archivo no se puede mostrar aquí (por ejemplo, una foto HEIC del iPhone): usa «Descargar».</p>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
