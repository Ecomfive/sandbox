"use client";

// El costo del producto en su ficha (Inventario y Producto), de la hoja de Costos de producto. Solo se ve: se edita en
// la hoja (Finanzas › Costos de producto), que es la única fuente.

import Link from "next/link";
import { useEffect, useState } from "react";
import { fechaCorta } from "@/lib/af4/fecha";
import { dinero, entero } from "@/lib/af4/formato";
import { claseCifra } from "@/components/af4/estilos-af4";
import { usePuedeAbrir } from "@/components/modulos-contexto";
import { obtenerCostoProducto, type CostoDeProducto } from "@/lib/finanzas/costo-producto-actions";
import { GastoIcon } from "@/lib/nav-icons";

const usd = (v: number) => dinero(v, "USD", { decimales: 2, decimalesMax: 4 });
const FUENTE = { componentes: "suma de sus componentes", principal: "del producto principal" } as const;

export function CostoProductoBloque({ skuId }: { skuId: string }) {
  const [datos, setDatos] = useState<CostoDeProducto | "error" | null>(null);
  const puedeAbrir = usePuedeAbrir("costos-mercancia");
  useEffect(() => {
    let vivo = true;
    obtenerCostoProducto(skuId)
      .then((r) => vivo && setDatos("error" in r ? "error" : r))
      .catch(() => vivo && setDatos("error"));
    return () => {
      vivo = false;
    };
  }, [skuId]);

  if (datos === null) return <p className="text-sm text-muted-foreground">Cargando el costo…</p>;
  if (datos === "error") return <p className="text-sm text-muted-foreground">No se pudo leer el costo.</p>;
  if (!datos.aplica) return <p className="text-sm text-muted-foreground">El costo se lleva solo para Panamá (en la barra está {datos.pais}).</p>;

  return (
    <div className="flex flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="flex items-center gap-2">
          <GastoIcon aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
          {datos.vigente === null ? (
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-destructive" />
              Sin costo en la hoja
            </span>
          ) : (
            <span>
              <span className={`text-base font-semibold ${claseCifra}`}>{usd(datos.vigente)}</span> por unidad
              {datos.fuente && datos.fuente !== "propio" && <span className="text-muted-foreground"> · {FUENTE[datos.fuente]}</span>}
            </span>
          )}
        </span>
        {puedeAbrir && (
          <Link href="/costos-mercancia" className="text-xs text-primario underline-offset-2 hover:underline">
            Ver en Costos de producto
          </Link>
        )}
      </div>
      {datos.compras.length > 0 && (
        <ul className="divide-y divide-border rounded-md border border-border">
          {datos.compras.slice(0, 6).map((c, i) => (
            <li key={`${c.codigo}-${i}`} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs ${claseCifra}`}>
              <span>
                {c.codigo || "—"} · {c.llegada ? fechaCorta(c.llegada) : "sin fecha"} · {entero(c.cantidad)} u.
              </span>
              <span className="font-medium">
                {usd(c.costoTotal)}
                {c.manual && <span className="font-normal text-muted-foreground"> (final manual)</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">Se edita solo en la hoja de Costos de producto. Cada venta toma el costo de la última compra que llegó antes del pedido.</p>
    </div>
  );
}
