"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { anilloFoco } from "@/components/ui/field";
import { ETIQUETA_PLATAFORMA } from "@/lib/wms/stock-plataformas";
import { obtenerInventarioProducto, type InventarioProducto } from "./inventario-producto-actions";

const u = (n: number) => `${n.toLocaleString("es-PA")} u.`;

/**
 * Cuánto hay del producto en el país de la barra (9 nov 2026, pedido de Hernán): el total, cada bodega con lo disponible y lo que viene en camino, y lo de Dropi, Effi y Drop.
 * Los mismos números que la ficha del Inventario; ahí se mueve y se corrige.
 */
export function InventarioProductoBloque({ id, puedeVerInventario }: { id: string; puedeVerInventario: boolean }) {
  const [datos, setDatos] = useState<InventarioProducto | "error" | null>(null);
  useEffect(() => {
    let vigente = true;
    obtenerInventarioProducto(id)
      .then((r) => vigente && setDatos("error" in r ? "error" : r))
      .catch(() => vigente && setDatos("error"));
    return () => {
      vigente = false;
    };
  }, [id]);

  if (datos === null) return <p className="m-0 text-sm text-muted-foreground">Cargando…</p>;
  if (datos === "error") return <p className="m-0 text-sm text-destructive">No se pudo cargar el inventario.</p>;
  const sinNada = datos.total === 0 && datos.bodegas.every((b) => b.enCamino === 0);
  return (
    <div className="flex flex-col gap-2.5">
      <p className="m-0 text-sm">
        <span className="text-2xl font-semibold tabular-nums">{datos.total.toLocaleString("es-PA")}</span> <span className="text-muted-foreground">unidades en {datos.pais}</span>
      </p>
      {!sinNada && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
          {datos.bodegas
            .filter((b) => b.fisico !== 0 || b.enCamino !== 0)
            .map((b) => (
              <li key={b.nombre} className="flex flex-wrap justify-between gap-x-3">
                <span className="min-w-0">
                  {b.nombre}
                  {b.disponible !== b.fisico && <span className="text-muted-foreground"> · {u(b.disponible)} disponibles</span>}
                  {b.enCamino !== 0 && <span className="text-muted-foreground"> · {u(b.enCamino)} en camino</span>}
                </span>
                <span className="tabular-nums">{u(b.fisico)}</span>
              </li>
            ))}
          {datos.plataformas?.lineas.filter((l) => l.unidades !== 0).map((l) => (
            <li key={`${l.plataforma}-${l.id}`} className="flex flex-wrap justify-between gap-x-3">
              <span className="min-w-0">
                {ETIQUETA_PLATAFORMA[l.plataforma]}
                <span className="text-muted-foreground"> · {l.id}</span>
              </span>
              <span className="tabular-nums">{u(l.unidades)}</span>
            </li>
          ))}
        </ul>
      )}
      {sinNada && <p className="m-0 text-xs text-muted-foreground">No hay unidades en las bodegas ni en las plataformas de este país.</p>}
      {datos.plataformas && <p className="m-0 text-xs text-muted-foreground">Lo de Dropi, Effi y Drop es su última lectura.</p>}
      {puedeVerInventario && (
        <Link href={`/inventario?abrir=${id}`} className={`inline-flex w-fit items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent ${anilloFoco}`}>
          Ver en Inventario
        </Link>
      )}
    </div>
  );
}
