"use client";

import { useState } from "react";
import { fieldClass } from "@/components/ui/field";

interface OpcionSimple {
  id: string;
  codigo: string;
  nombre: string;
}

export function ComboBuilder({ opciones }: { opciones: OpcionSimple[] }) {
  const [filas, setFilas] = useState<number[]>([0]);

  return (
    <div className="flex flex-col gap-2">
      {filas.map((key) => (
        <div key={key} className="flex items-center gap-2">
          <select name="componente_id" className={`${fieldClass} flex-1`} required defaultValue="">
            <option value="" disabled>
              Selecciona un SKU simple aprobado
            </option>
            {opciones.map((o) => (
              <option key={o.id} value={o.id}>
                {o.codigo} — {o.nombre}
              </option>
            ))}
          </select>
          <input
            type="number"
            name="cantidad"
            min={1}
            defaultValue={1}
            className={`${fieldClass} w-20`}
            required
          />
          {filas.length > 1 && (
            <button
              type="button"
              onClick={() => setFilas((f) => f.filter((k) => k !== key))}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Quitar
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={() => setFilas((f) => [...f, Date.now()])}
        className="self-start text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        + Agregar componente
      </button>
    </div>
  );
}
