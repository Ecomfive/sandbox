"use client";

import { formatearFecha } from "@/lib/formato";
import { numeroProducto, type FilaProducto } from "./def-producto";
import { MapaComponentes } from "./mapa-componentes";

/**
 * Lo que sale al pasar el cursor sobre un producto en la lista: si es **compuesto**, el mapa de sus componentes (como en su
 * ficha); si es **simple** (o tiene variantes), su foto grande y cómo se ha comprado (en cuántas órdenes, cuántas unidades y la
 * última orden).
 */
export function VistaRapidaProducto({ producto }: { producto: FilaProducto }) {
  if (producto.tipo === "combo") {
    return producto.listaComponentes.length ? (
      <MapaComponentes compacto componentes={producto.listaComponentes} nombre={producto.nombre} titulo={`${producto.codigo} · cómo se arma`} />
    ) : (
      <p className="m-0 text-sm text-muted-foreground">Compuesto sin componentes.</p>
    );
  }
  const { ordenes, ultima } = producto.compras;
  return (
    <div className="flex flex-col gap-2.5">
      {producto.foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={producto.foto} alt="" className="max-h-60 w-full rounded-md bg-muted object-contain" />
      ) : (
        <div className="flex h-32 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">Sin foto</div>
      )}
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">{producto.nombre}</span>
        <span className="text-xs text-muted-foreground">
          {numeroProducto(producto.numero)} · {producto.codigo}
        </span>
      </div>
      <dl className="m-0 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Comprado en</dt>
          <dd className="m-0 font-semibold tabular-nums">
            {ordenes} {ordenes === 1 ? "orden" : "órdenes"}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Unidades</dt>
          <dd className="m-0 font-semibold tabular-nums">{producto.unidadesCompradas.toLocaleString("es-PA")}</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Última compra</dt>
          <dd className="m-0 font-semibold">{ultima ? `${ultima.oc} · ${formatearFecha(ultima.fecha)}` : "Todavía no se ha comprado"}</dd>
        </div>
      </dl>
    </div>
  );
}
