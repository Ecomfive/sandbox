"use client";

import { useState } from "react";
import { fieldClass } from "@/components/ui/field";

export const claseNumero = `${fieldClass} w-32 text-right tabular-nums`;
export const aNumero = (t: string): number | null => (t.trim() === "" ? null : Number(t.replace(",", ".")));
/** El costo unitario se guarda con hasta 10 decimales (para que un total escrito se reproduzca exacto); el total, en centavos. */
export const DECIMALES_UNITARIO = 10;
export const redondear = (n: number, decimales: number) => Math.round(n * 10 ** decimales) / 10 ** decimales;
const texto = (n: number | null, decimales: number) => (n === null || !Number.isFinite(n) ? "" : String(redondear(n, decimales)));

/**
 * El costo de una línea: unitario y total enlazados. Se escribe uno y el otro se calcula con la cantidad; si cambia la
 * cantidad, se recalcula a partir del último que se escribió (escribir el total y luego la cantidad reparte ese total).
 */
export function useCosto(cantidad: number, unitarioInicial: number | null) {
  const [unitario, setUnitario] = useState(texto(unitarioInicial, DECIMALES_UNITARIO));
  const [total, setTotal] = useState(unitarioInicial !== null && cantidad > 0 ? texto(unitarioInicial * cantidad, 2) : "");
  const [ultimo, setUltimo] = useState<"unitario" | "total">("unitario");

  function escribirUnitario(t: string) {
    setUltimo("unitario");
    setUnitario(t);
    const u = aNumero(t);
    setTotal(u !== null && cantidad > 0 ? texto(u * cantidad, 2) : "");
  }
  function escribirTotal(t: string) {
    setUltimo("total");
    setTotal(t);
    const tot = aNumero(t);
    setUnitario(tot !== null && cantidad > 0 ? texto(tot / cantidad, DECIMALES_UNITARIO) : "");
  }
  /** Al cambiar la cantidad: se mantiene lo último que se escribió y se recalcula el otro. */
  function conCantidad(n: number) {
    if (!(n > 0)) return;
    if (ultimo === "total" && aNumero(total) !== null) setUnitario(texto(aNumero(total)! / n, DECIMALES_UNITARIO));
    else if (aNumero(unitario) !== null) setTotal(texto(aNumero(unitario)! * n, 2));
  }
  function reiniciar(u: number | null, n: number) {
    setUnitario(texto(u, DECIMALES_UNITARIO));
    setTotal(u !== null && n > 0 ? texto(u * n, 2) : "");
    setUltimo("unitario");
  }
  return { unitario, total, escribirUnitario, escribirTotal, conCantidad, reiniciar, valorUnitario: aNumero(unitario) };
}

export function CamposCosto({ costo, deshabilitado, alSalir }: { costo: ReturnType<typeof useCosto>; deshabilitado?: boolean; alSalir?: () => void }) {
  return (
    <>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Costo unitario (USD)</span>
        <input
          type="number"
          min={0}
          step="any"
          inputMode="decimal"
          value={costo.unitario}
          disabled={deshabilitado}
          onChange={(e) => costo.escribirUnitario(e.target.value)}
          onBlur={alSalir}
          className={claseNumero}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted-foreground">Costo total (USD)</span>
        <input
          type="number"
          min={0}
          step="0.01"
          inputMode="decimal"
          value={costo.total}
          disabled={deshabilitado}
          onChange={(e) => costo.escribirTotal(e.target.value)}
          onBlur={alSalir}
          className={claseNumero}
        />
      </label>
    </>
  );
}
