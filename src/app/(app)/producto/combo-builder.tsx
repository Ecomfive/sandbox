"use client";

import { useState } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";

/**
 * Los componentes de un producto compuesto: cada uno se busca **igual que al agregar un producto a una orden de compra**
 * (mientras se escribe el SKU, el nombre o el N.º salen las sugerencias con su foto en miniatura, SKU, nombre y N.º; se elige
 * con el ratón o con flechas y Enter) y lleva su cantidad. Viaja en el formulario como `componente_id` + `cantidad` por fila.
 * Un producto ya elegido en otra fila no se vuelve a ofrecer. Debajo, el **mapa** de lo que lleva: cada componente conectado al
 * producto nuevo, con su cantidad.
 */
export function ComboBuilder({ opciones, nombreProducto }: { opciones: OpcionSkuMaestro[]; nombreProducto: string }) {
  const [filas, setFilas] = useState<{ clave: number; id: string | null; cantidad: string }[]>([{ clave: 0, id: null, cantidad: "1" }]);
  const elegidos = new Set(filas.map((f) => f.id).filter(Boolean));
  const cambiar = (clave: number, cambios: Partial<{ id: string | null; cantidad: string }>) => setFilas((fs) => fs.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)));
  const porId = new Map(opciones.map((o) => [o.id, o]));
  const armado = filas.flatMap((f) => (f.id && porId.has(f.id) ? [{ producto: porId.get(f.id)!, cantidad: Math.max(0, Math.floor(Number(f.cantidad) || 0)) }] : []));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {/* De punta a punta: el producto ocupa todo el ancho y la cantidad va al lado, en columnas alineadas. */}
        <div aria-hidden="true" className="grid grid-cols-[minmax(0,1fr)_6rem_3.5rem] gap-2 text-xs font-medium text-muted-foreground">
          <span>Producto</span>
          <span>Cantidad</span>
          <span />
        </div>
        {filas.map((fila, i) => (
          <div key={fila.clave} className="grid grid-cols-[minmax(0,1fr)_6rem_3.5rem] items-center gap-2">
            <input type="hidden" name="componente_id" value={fila.id ?? ""} />
            {/* Cada fila ofrece los productos que no se eligieron en otra (y el suyo). */}
            <ProveedorSkusMaestros opciones={opciones.filter((o) => o.id === fila.id || !elegidos.has(o.id))}>
              <CampoSkuMaestro
                valor={fila.id}
                alCambiar={(sku) => cambiar(fila.clave, { id: sku?.id ?? null })}
                etiquetaAria={`Producto del componente ${i + 1}`}
                placeholder="Busca por SKU, nombre o N.º"
                claseContenedor="w-full min-w-0"
              />
            </ProveedorSkusMaestros>
            <input
              type="number"
              name="cantidad"
              aria-label={`Cantidad del componente ${i + 1}`}
              min={1}
              value={fila.cantidad}
              onChange={(e) => cambiar(fila.clave, { cantidad: e.target.value })}
              className={`${fieldClass} w-full tabular-nums`}
              required
            />
            {filas.length > 1 ? (
              <button
                type="button"
                onClick={() => setFilas((fs) => fs.filter((f) => f.clave !== fila.clave))}
                aria-label={`Quitar el componente ${i + 1}`}
                className={`rounded text-xs text-muted-foreground hover:text-foreground ${anilloFoco}`}
              >
                Quitar
              </button>
            ) : (
              <span />
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setFilas((fs) => [...fs, { clave: Date.now(), id: null, cantidad: "1" }])}
          className={`self-start rounded text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground ${anilloFoco}`}
        >
          + Agregar componente
        </button>
      </div>
      {armado.length > 0 && <MapaComponentes componentes={armado} nombre={nombreProducto} />}
    </div>
  );
}

/**
 * El mapa del compuesto: a la izquierda cada componente (foto, nombre, SKU y cuántas lleva), unidos por líneas al producto
 * nuevo de la derecha, que dice cuántas piezas suma en total.
 */
function MapaComponentes({ componentes, nombre }: { componentes: { producto: OpcionSkuMaestro; cantidad: number }[]; nombre: string }) {
  const piezas = componentes.reduce((s, c) => s + c.cantidad, 0);
  return (
    <figure className="m-0 flex flex-col gap-2 rounded-xl border border-dashed border-border bg-muted/40 p-3">
      <figcaption className="text-xs font-medium text-muted-foreground">Cómo se arma</figcaption>
      <div className="overflow-x-auto">
        <div className="flex w-full min-w-[32rem] items-center">
          <ul className="relative m-0 flex min-w-0 flex-1 list-none flex-col gap-2 p-0 pr-7">
            {componentes.map(({ producto, cantidad }) => (
              <li
                key={producto.id}
                className="relative flex h-14 w-full items-center gap-2 rounded-lg border border-border bg-card px-2"
              >
                {/* La línea que une este componente con la de todos. */}
                <span aria-hidden="true" className="absolute top-1/2 left-full h-0.5 w-7 bg-primario/50" />
                {producto.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={producto.foto} alt="" className="h-9 w-9 shrink-0 rounded-md border border-border object-cover" />
                ) : (
                  <span aria-hidden="true" className="h-9 w-9 shrink-0 rounded-md border border-dashed border-border" />
                )}
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate text-[13px] font-medium">{producto.nombre}</span>
                  <span className="truncate text-xs text-muted-foreground">{producto.codigo}</span>
                </span>
                <span className="shrink-0 rounded-full bg-primario-suave px-2 py-0.5 text-xs font-semibold text-primario tabular-nums">×{cantidad}</span>
              </li>
            ))}
            {/* La línea que junta a todos los componentes (del centro del primero al centro del último). */}
            {componentes.length > 1 && <span aria-hidden="true" className="absolute top-7 right-0 bottom-7 w-0.5 bg-primario/50" />}
          </ul>
          <span aria-hidden="true" className="h-0.5 w-8 bg-primario/50" />
          <span aria-hidden="true" className="-ml-1 text-primario">
            ▶
          </span>
          <div className="ml-1 flex w-56 shrink-0 flex-col gap-0.5 rounded-xl border-2 border-primario bg-card px-3 py-2.5 shadow-sm">
            <span className="text-xs font-medium text-primario">Producto compuesto</span>
            <span className="truncate text-sm font-semibold">{nombre.trim() || "Nuevo producto"}</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {componentes.length} {componentes.length === 1 ? "componente" : "componentes"} · {piezas} {piezas === 1 ? "pieza" : "piezas"}
            </span>
          </div>
        </div>
      </div>
    </figure>
  );
}
