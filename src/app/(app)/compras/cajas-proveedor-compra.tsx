"use client";

import { useEffect, useState } from "react";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { InventarioIcon } from "@/lib/nav-icons";
import { obtenerCajasProveedorCompra, type CajasProveedorCompra } from "./cajas-proveedor-compra-actions";

/** «Cajas de Shen Zhen» en la ficha de una compra: cuántas cajas lleva el envío y la imagen de su etiqueta, como las anotó el proveedor al marcar el envío. Solo lectura. */
export function CajasProveedorCompraBloque({ compraId }: { compraId: string }) {
  const [datos, setDatos] = useState<CajasProveedorCompra | null>(null);
  useEffect(() => {
    let vigente = true;
    obtenerCajasProveedorCompra(compraId)
      .then((r) => vigente && setDatos(r))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [compraId]);
  if (!datos) return null;
  return (
    <div className="px-5">
      <Seccion icono={InventarioIcon} titulo={`Cajas de ${datos.proveedor}`}>
        <dl className="m-0 flex flex-col gap-2 text-[13px]">
          <div className="flex items-baseline gap-2">
            <dt className="text-muted-foreground">Cajas (Cartons)</dt>
            <dd className="m-0 font-semibold tabular-nums">{datos.cajas != null ? datos.cajas.toLocaleString("es-PA") : "—"}</dd>
          </div>
          {datos.etiquetas.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <dt className="text-muted-foreground">Etiqueta de las cajas</dt>
              <dd className="m-0">
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {datos.etiquetas.map((e, i) => (
                    <li key={e.ruta}>
                      <a href={e.url} target="_blank" rel="noopener noreferrer" aria-label={`Ver etiqueta ${i + 1}`} className={`block overflow-hidden rounded-md border border-border bg-card ${anilloFoco}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- la etiqueta es una dirección firmada del almacenamiento privado */}
                        <img src={e.url} alt={`Etiqueta de las cajas ${i + 1}`} className="h-28 w-28 object-contain" />
                      </a>
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>
      </Seccion>
    </div>
  );
}
