"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco, fieldClassSm } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { esCodigoInterno, normalizarCodigoBarras, svgCodigoBarras } from "@/lib/wms/codigo-barras";
import { generarCodigoBarrasInterno, guardarCodigoBarras } from "./actions";

const claseBoton = `rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:pointer-events-none disabled:opacity-40 ${anilloFoco}`;

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Abre una ventana con la etiqueta (nombre, SKU y código de barras) y la manda a imprimir. */
function imprimirEtiqueta(svg: string, nombre: string, sku: string) {
  const ventana = window.open("", "_blank", "width=420,height=320");
  if (!ventana) return;
  ventana.document.write(
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiqueta ${escapar(sku)}</title>` +
      `<style>body{font-family:system-ui,sans-serif;margin:0;padding:12px;text-align:center}p{margin:2px 0;font-size:12px}svg{max-width:100%;height:auto}</style></head>` +
      `<body><p><strong>${escapar(nombre)}</strong></p><p>SKU ${escapar(sku)}</p>${svg}</body></html>`,
  );
  ventana.document.close();
  ventana.focus();
  ventana.print();
}

/**
 * El código de barras de un producto: se ve dibujado (EAN), con su origen (del fabricante o interno), se puede escribir el del
 * fabricante y, si el producto no trae ninguno, **generar uno interno** (EAN-13 con prefijo 20) para manejarlo en la bodega con
 * escáner. Con permiso de escritura se puede cambiar o quitar; la etiqueta se puede imprimir.
 */
export function CodigoBarrasProducto({
  id,
  codigoBarras,
  origen,
  nombre,
  sku,
  puedeEscribir,
}: {
  id: string;
  codigoBarras: string | null;
  origen: string | null;
  nombre: string;
  sku: string;
  puedeEscribir: boolean;
}) {
  const { mostrarToast } = useToast();
  const [pendiente, start] = useTransition();
  const [escrito, setEscrito] = useState<string | null>(null); // null = mostrar el guardado
  const [error, setError] = useState<string | null>(null);
  const valor = escrito ?? codigoBarras ?? "";
  const cambio = normalizarCodigoBarras(valor) !== (codigoBarras ?? "");
  const svg = codigoBarras ? svgCodigoBarras(codigoBarras, { modulo: 2, alto: 56 }) : null;

  function guardar() {
    setError(null);
    start(async () => {
      const r = await guardarCodigoBarras(id, valor);
      if (r.error) setError(r.error);
      else {
        setEscrito(null);
        mostrarToast(valor.trim() === "" ? "Código de barras quitado" : "Código de barras guardado");
      }
    });
  }

  function generar() {
    setError(null);
    start(async () => {
      const r = await generarCodigoBarrasInterno(id);
      if (r.error) setError(r.error);
      else {
        setEscrito(null);
        mostrarToast("Código de barras interno generado");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {codigoBarras ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium tabular-nums">{codigoBarras}</span>
            <Badge tone={origen === "interno" || esCodigoInterno(codigoBarras) ? "info" : "neutral"}>{origen === "interno" ? "Interno" : "Fabricante"}</Badge>
          </div>
          {svg ? (
            // El SVG lo arma `svgCodigoBarras` solo con los números ya validados del código: no lleva texto de ninguna persona.
            <div className="w-fit max-w-full overflow-x-auto rounded-md border border-border bg-white p-2" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <p className="text-xs text-muted-foreground">Este tipo de código se guarda pero no se dibuja aquí.</p>
          )}
          {svg && (
            <button type="button" onClick={() => imprimirEtiqueta(svg, nombre, sku)} className={`${claseBoton} w-fit`}>
              Imprimir etiqueta
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Sin código de barras.</p>
      )}

      {puedeEscribir && (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">Código del fabricante (EAN, UPC o GTIN)</span>
            <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={valor}
                disabled={pendiente}
                autoComplete="off"
                maxLength={20}
                placeholder="Ej: 4006381333931"
                onChange={(e) => setEscrito(e.target.value)}
                className={`${fieldClassSm} min-w-0 flex-1`}
              />
              {cambio && (
                <button type="button" disabled={pendiente} onClick={guardar} className={claseBoton}>
                  {pendiente ? "Guardando…" : valor.trim() === "" ? "Quitar" : "Guardar"}
                </button>
              )}
            </div>
          </label>
          {!codigoBarras && !cambio && (
            <button type="button" disabled={pendiente} onClick={generar} className={`${claseBoton} w-fit`}>
              {pendiente ? "Generando…" : "Generar código interno"}
            </button>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
