"use client";

import { useEffect, useRef, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { DescargarIcon } from "@/lib/nav-icons";

const FORMATOS = [
  { id: "pdf", etiqueta: "PDF", detalle: "Ficha en formato factura" },
  { id: "xlsx", etiqueta: "Excel", detalle: "Hoja de cálculo (.xlsx)" },
  { id: "csv", etiqueta: "CSV", detalle: "Texto separado por comas" },
] as const;

/** Botón "Descargar ficha" que despliega los formatos disponibles para este retiro.
 * Es un desplegable simple (botón + lista de enlaces), no un menú de aplicación: Tab recorre los formatos. */
export function DescargarFicha({ retiroId }: { retiroId: string }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);
  const botonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setAbierto(false);
      if (contenedorRef.current?.contains(document.activeElement)) botonRef.current?.focus();
    }
    document.addEventListener("mousedown", alHacerClicFuera);
    document.addEventListener("keydown", alTeclear);
    return () => {
      document.removeEventListener("mousedown", alHacerClicFuera);
      document.removeEventListener("keydown", alTeclear);
    };
  }, []);

  return (
    <div ref={contenedorRef} className="relative">
      <button
        ref={botonRef}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="formatos-ficha"
        className={`inline-flex items-center gap-1.5 !rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted ${anilloFoco}`}
      >
        <DescargarIcon className="h-4 w-4" />
        Descargar ficha
      </button>
      {abierto && (
        <div
          id="formatos-ficha"
          role="group"
          aria-label="Formatos de descarga"
          className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {FORMATOS.map((formato) => (
            <a
              key={formato.id}
              href={`/api/exportar-retiro/${retiroId}?formato=${formato.id}`}
              download
              onClick={() => setAbierto(false)}
              className={`flex flex-col px-3 py-2 text-sm hover:bg-muted ${anilloFoco}`}
            >
              <span className="font-medium">{formato.etiqueta}</span>
              <span className="text-xs text-muted-foreground">{formato.detalle}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
