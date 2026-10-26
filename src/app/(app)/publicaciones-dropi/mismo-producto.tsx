"use client";

/* eslint-disable @next/next/no-img-element -- foto de Storage o de Dropi */
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { TIPOS, numeroPublicacion, opcion } from "@/lib/publicaciones/publicacion";
import type { FilaPublicacion } from "./def-publicaciones";

/**
 * Las demás publicaciones del mismo producto (el mismo SKU vinculado), públicas y privadas (pedido de Alcides, 25 oct 2026): las activas
 * primero y las públicas antes que las privadas. Cada una dice su ID de Dropi, su tipo, a quién está privatizada, su stock y si está
 * archivada; pulsarla abre su ficha.
 */
export function PublicacionesDelProducto({ otras, alAbrir }: { otras: FilaPublicacion[]; alAbrir: (id: string) => void }) {
  if (!otras.length) return <p className="m-0 text-sm text-muted-foreground">No hay otras publicaciones de este producto.</p>;
  const orden = [...otras].sort((a, b) => Number(a.archivada) - Number(b.archivada) || Number(a.tipoDropi === "privado") - Number(b.tipoDropi === "privado") || (a.numero ?? 0) - (b.numero ?? 0));
  return (
    <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
      {orden.map((o) => {
        const tipo = opcion(TIPOS, o.tipoDropi);
        const stock = o.stockProveedor ?? o.ventas?.stock ?? null;
        return (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => alAbrir(o.id)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted ${anilloFoco} ${o.archivada ? "opacity-60" : ""}`}
            >
              {o.fotoUrl ? (
                <img src={o.fotoUrl} alt="" className="h-10 w-10 shrink-0 rounded-md border border-border object-cover" />
              ) : (
                <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-md border border-dashed border-border-control" />
              )}
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{o.nombre}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {numeroPublicacion(o.numero)}
                  {o.dropiId ? ` · ID ${o.dropiId}` : " · sin ID de Dropi"}
                  {o.tipoDropi === "privado" && (o.privatizadoA || o.privatizadoEmail) ? ` · ${o.privatizadoA || o.privatizadoEmail}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                {tipo ? <Badge color={tipo.color}>{tipo.etiqueta}</Badge> : <span className="text-xs text-muted-foreground">Sin tipo</span>}
                <span className="text-xs text-muted-foreground tabular-nums">{o.archivada ? "Archivada" : stock === null ? "Sin datos de stock" : `${stock.toLocaleString("es-PA")} u.`}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
