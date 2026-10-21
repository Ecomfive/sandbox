"use client";

import { useEffect, useState } from "react";
import type { EnCaminoPais } from "@/lib/compras/en-camino";
import { obtenerEnCaminoProducto } from "./en-camino-actions";

const entero = (n: number) => n.toLocaleString("es-PA");

/**
 * Lo que viene en camino de un producto, solo unidades por país (sin el detalle de cada compra): las órdenes que ya salieron y
 * todavía no llegan, la misma regla de «En tránsito» de Compras. Se pide al abrir la ficha.
 */
export function EnCaminoProducto({ id }: { id: string }) {
  const [datos, setDatos] = useState<EnCaminoPais[] | "error" | null>(null);

  useEffect(() => {
    let vigente = true;
    obtenerEnCaminoProducto(id)
      .then((r) => vigente && setDatos("enCamino" in r ? r.enCamino : "error"))
      .catch(() => vigente && setDatos("error"));
    return () => {
      vigente = false;
    };
  }, [id]);

  if (datos === null) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (datos === "error")
    return (
      <p role="alert" className="text-sm text-destructive">
        No se pudo cargar lo que viene en camino.
      </p>
    );
  if (datos.length === 0) return <p className="text-sm text-muted-foreground">Nada en camino.</p>;
  const total = datos.reduce((t, d) => t + d.unidades, 0);
  return (
    <dl className="m-0 flex flex-col divide-y divide-border text-sm">
      {datos.map((d) => (
        <div key={d.pais} className="flex items-baseline justify-between gap-3 py-1.5">
          <dt>{d.pais === "—" ? "Sin país" : d.pais}</dt>
          <dd className="m-0 font-semibold tabular-nums">{entero(d.unidades)} u.</dd>
        </div>
      ))}
      {datos.length > 1 && (
        <div className="flex items-baseline justify-between gap-3 py-1.5 text-muted-foreground">
          <dt>Total</dt>
          <dd className="m-0 tabular-nums">{entero(total)} u.</dd>
        </div>
      )}
    </dl>
  );
}
