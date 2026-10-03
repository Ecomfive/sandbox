"use client";

import { useState } from "react";
import { anilloFoco, fieldClass, labelClassSm } from "@/components/ui/field";
import { MasIcon } from "@/lib/nav-icons";

const MAXIMO = 20;

// Una clave distinta para cada campo, para que quitar uno no mueva lo escrito en los demás.
let contadorClaves = 0;
const nuevaClave = () => `t${contadorClaves++}`;

/**
 * Las tiendas de un dropshipper: un campo por tienda y un «+» debajo para agregar otra. Cada campo viaja con el nombre
 * `tienda` (el servidor las lee todas, sin las vacías ni las repetidas). Una tienda de más se quita con su «×».
 */
export function CampoTiendas({ inicial = [], id }: { inicial?: string[]; id: string }) {
  const [filas, setFilas] = useState<{ clave: string; valor: string }[]>(() =>
    (inicial.length ? inicial : [""]).map((valor) => ({ clave: nuevaClave(), valor })),
  );
  const [enfocar, setEnfocar] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1" role="group" aria-labelledby={`${id}-etiqueta`}>
      <span id={`${id}-etiqueta`} className={labelClassSm}>
        {filas.length > 1 ? "Tiendas" : "Tienda"}
      </span>
      {filas.map((f, i) => (
        <div key={f.clave} className="flex items-center gap-1.5">
          <input
            id={i === 0 ? id : undefined}
            type="text"
            name="tienda"
            autoComplete="off"
            maxLength={200}
            aria-label={`Tienda ${i + 1}`}
            value={f.valor}
            ref={(el) => {
              if (el && enfocar === f.clave) {
                el.focus();
                setEnfocar(null);
              }
            }}
            onChange={(e) => setFilas((actuales) => actuales.map((x) => (x.clave === f.clave ? { ...x, valor: e.target.value } : x)))}
            placeholder="Ej: aurora-shop.com"
            className={`${fieldClass} w-full`}
          />
          {filas.length > 1 && (
            <button
              type="button"
              aria-label={`Quitar la tienda ${i + 1}`}
              onClick={() => setFilas((actuales) => actuales.filter((x) => x.clave !== f.clave))}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-lg leading-none text-muted-foreground hover:bg-accent ${anilloFoco}`}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {filas.length < MAXIMO && (
        <button
          type="button"
          aria-label="Agregar otra tienda"
          onClick={() => {
            const clave = nuevaClave();
            setFilas((actuales) => [...actuales, { clave, valor: "" }]);
            setEnfocar(clave);
          }}
          className={`flex h-9 w-9 items-center justify-center rounded-md border border-border bg-card hover:bg-accent ${anilloFoco}`}
        >
          <MasIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
