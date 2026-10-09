"use client";

import { useState } from "react";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { CampoSkuMaestro, ProveedorSkusMaestros, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";

/**
 * Los componentes de un producto compuesto: cada uno se busca **igual que al agregar un producto a una orden de compra**
 * (mientras se escribe el SKU, el nombre o el N.º salen las sugerencias con su foto en miniatura, SKU, nombre y N.º; se elige
 * con el ratón o con flechas y Enter) y lleva su cantidad. Viaja en el formulario como `componente_id` + `cantidad` por fila.
 * Un producto ya elegido en otra fila no se vuelve a ofrecer.
 */
export function ComboBuilder({ opciones }: { opciones: OpcionSkuMaestro[] }) {
  const [filas, setFilas] = useState<{ clave: number; id: string | null }[]>([{ clave: 0, id: null }]);
  const elegidos = new Set(filas.map((f) => f.id).filter(Boolean));

  return (
    <div className="flex flex-col gap-2">
      {filas.map((fila, i) => (
        <div key={fila.clave} className="flex items-center gap-2">
          <input type="hidden" name="componente_id" value={fila.id ?? ""} />
          {/* Cada fila ofrece los productos que no se eligieron en otra (y el suyo). */}
          <ProveedorSkusMaestros opciones={opciones.filter((o) => o.id === fila.id || !elegidos.has(o.id))}>
            <CampoSkuMaestro
              valor={fila.id}
              alCambiar={(sku) => setFilas((fs) => fs.map((f) => (f.clave === fila.clave ? { ...f, id: sku?.id ?? null } : f)))}
              etiquetaAria={`Producto del componente ${i + 1}`}
              placeholder="Busca por SKU, nombre o N.º"
              className="min-w-0 flex-1"
            />
          </ProveedorSkusMaestros>
          <input
            type="number"
            name="cantidad"
            aria-label={`Cantidad del componente ${i + 1}`}
            min={1}
            defaultValue={1}
            className={`${fieldClass} w-20 tabular-nums`}
            required
          />
          {filas.length > 1 && (
            <button
              type="button"
              onClick={() => setFilas((fs) => fs.filter((f) => f.clave !== fila.clave))}
              aria-label={`Quitar el componente ${i + 1}`}
              className={`rounded text-xs text-muted-foreground hover:text-foreground ${anilloFoco}`}
            >
              Quitar
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setFilas((fs) => [...fs, { clave: Date.now(), id: null }])}
        className={`self-start rounded text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground ${anilloFoco}`}
      >
        + Agregar componente
      </button>
    </div>
  );
}
