"use client";

import { useEffect, useRef, useState } from "react";
import { DescargarIcon } from "@/lib/nav-icons";

const FORMATOS = [
  { id: "pdf", etiqueta: "PDF", detalle: "Ficha en formato factura" },
  { id: "xlsx", etiqueta: "Excel", detalle: "Hoja de cálculo (.xlsx)" },
  { id: "csv", etiqueta: "CSV", detalle: "Texto separado por comas" },
] as const;

/** Botón "Descargar ficha" que despliega los formatos disponibles para este retiro. */
export function DescargarFicha({ retiroId }: { retiroId: string }) {
  const [abierto, setAbierto] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function alHacerClicFuera(e: MouseEvent) {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) setAbierto(false);
    }
    function alTeclear(e: KeyboardEvent) {
      if (e.key === "Escape") setAbierto(false);
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
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
      >
        <DescargarIcon className="h-4 w-4" />
        Descargar ficha
      </button>
      {abierto && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-60 rounded-lg border border-border bg-card p-1 shadow-lg">
          {FORMATOS.map((formato) => (
            <a
              key={formato.id}
              role="menuitem"
              href={`/api/exportar-retiro/${retiroId}?formato=${formato.id}`}
              download
              onClick={() => setAbierto(false)}
              className="flex flex-col rounded-md px-3 py-2 text-sm hover:bg-muted"
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
