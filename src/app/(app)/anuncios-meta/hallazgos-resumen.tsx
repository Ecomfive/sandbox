"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Hallazgo } from "@/lib/meta-ads/historico";
import { hallazgosDestacadosMeta } from "./actions";
import { TarjetaMeta } from "./graficas";

const PUNTO = { alerta: "bg-destructive", bueno: "bg-success", info: "bg-muted-foreground" } as const;

/**
 * Lo que más pide atención según todo el historial (Resumen): se carga después de abrir la pantalla, porque leer el historial tarda unos segundos la primera vez. El detalle completo está en «Hallazgos».
 */
export function HallazgosResumen({ cuentaId }: { cuentaId: string | null }) {
  const [datos, setDatos] = useState<{ hallazgos: Hallazgo[]; total: number; atender: number } | null>(null);
  useEffect(() => {
    let vivo = true;
    hallazgosDestacadosMeta(cuentaId)
      .then((d) => vivo && setDatos(d))
      .catch(() => vivo && setDatos({ hallazgos: [], total: 0, atender: 0 }));
    return () => {
      vivo = false;
    };
  }, [cuentaId]);
  // Sin historial suficiente no se muestra nada (la pestaña «Hallazgos» lo explica).
  if (datos && datos.hallazgos.length === 0) return null;
  return (
    <TarjetaMeta
      titulo="Lo que dicen los datos del historial"
      id="hallazgos-resumen"
      derecha={
        <Link href="/anuncios-meta/hallazgos" className="text-xs font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground">
          Ver todos los hallazgos{datos ? ` (${datos.total})` : ""}
        </Link>
      }
    >
      {!datos ? (
        <p className="m-0 text-sm text-muted-foreground" role="status">Leyendo el historial…</p>
      ) : (
        <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
          {datos.hallazgos.map((h) => (
            <li key={h.id} className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${PUNTO[h.tono]}`} />
              <div className="min-w-0">
                <p className="m-0 text-sm font-medium">{h.titulo}</p>
                <p className="m-0 mt-0.5 line-clamp-2 text-xs text-muted-foreground">{h.motivo ?? h.detalle}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </TarjetaMeta>
  );
}
