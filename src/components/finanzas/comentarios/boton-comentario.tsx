"use client";

import { useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Tooltip } from "@/components/ui/tooltip";
import type { PaginaComentarios } from "@/lib/finanzas/comentarios";
import { HiloCifra } from "./hilo-cifra";
import { IconoComentario } from "./icono-comentario";

/**
 * El botón de comentarios de una cifra suelta (un indicador del Panel): discreto si no hay hilo, con el número y el punto
 * ámbar si lo hay.
 */
export function BotonComentarioCifra({ pagina, periodo, clave, etiqueta, cantidad }: { pagina: PaginaComentarios; periodo: string; clave: string; etiqueta: string; cantidad: number }) {
  const [abierto, setAbierto] = useState(false);
  const [n, setN] = useState(cantidad);
  const texto = n ? `${n} ${n === 1 ? "comentario" : "comentarios"}` : "Comentar cifra";
  return (
    <>
      <Tooltip texto={texto}>
        <button
          type="button"
          onClick={() => setAbierto(true)}
          aria-label={`${n ? `Ver ${texto}` : "Comentar"}: ${etiqueta}`}
          className={`inline-flex h-6 items-center gap-1 rounded-md px-1 text-[11px] tabular-nums ${n ? "text-foreground" : "text-muted-foreground opacity-60 hover:opacity-100"} hover:bg-muted ${anilloFoco}`}
        >
          <IconoComentario className={`h-3.5 w-3.5 ${n ? "text-warning" : ""}`} />
          {n > 0 && n}
        </button>
      </Tooltip>
      <HiloCifra
        ancla={abierto ? { pagina, periodo, clave } : null}
        etiqueta={etiqueta}
        abierto={abierto}
        alCerrar={() => setAbierto(false)}
        alCambiar={(_, c) => setN(c)}
      />
    </>
  );
}
