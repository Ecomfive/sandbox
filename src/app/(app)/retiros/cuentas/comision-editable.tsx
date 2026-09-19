"use client";

import { useState, useTransition } from "react";
import { actualizarCuentaRetiro } from "./actions";
import { fieldClassSm } from "@/components/ui/field";

type ComisionTipo = "" | "porcentaje" | "monto_fijo";

/** Comisión sugerida de la cuenta: porcentaje o monto fijo, nunca ambos a la vez — se usa
 * para prellenar el campo Comisión al elegir esta cuenta en "+ Agregar" retiro. Solo es una
 * sugerencia al crear: cambiarla después no toca los retiros que ya se crearon con ella. */
export function ComisionEditable({
  id,
  comisionTipo,
  comisionValor,
}: {
  id: string;
  comisionTipo: string | null;
  comisionValor: number | null;
}) {
  const [tipo, setTipo] = useState<ComisionTipo>((comisionTipo as ComisionTipo) || "");
  const [valor, setValor] = useState(comisionValor != null ? String(comisionValor) : "");
  const [pending, startTransition] = useTransition();

  function guardarTipo(nuevoTipo: ComisionTipo) {
    setTipo(nuevoTipo);
    const formData = new FormData();
    formData.set("id", id);
    formData.set("comision_tipo", nuevoTipo);
    if (nuevoTipo === "") setValor("");
    startTransition(() => {
      actualizarCuentaRetiro(formData);
    });
  }

  function guardarValor() {
    if (String(comisionValor ?? "") === valor) return;
    const formData = new FormData();
    formData.set("id", id);
    formData.set("comision_valor", valor);
    startTransition(() => {
      actualizarCuentaRetiro(formData);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <select
        aria-label="Tipo de comisión"
        value={tipo}
        disabled={pending}
        onChange={(e) => guardarTipo(e.target.value as ComisionTipo)}
        className={`${fieldClassSm} disabled:opacity-50`}
      >
        <option value="">Sin comisión</option>
        <option value="porcentaje">% Porcentaje</option>
        <option value="monto_fijo">$ Monto fijo</option>
      </select>
      {tipo !== "" && (
        <input
          type="number"
          step="0.01"
          min="0"
          aria-label={tipo === "porcentaje" ? "Porcentaje de comisión" : "Monto fijo de comisión"}
          value={valor}
          disabled={pending}
          onChange={(e) => setValor(e.target.value)}
          onBlur={guardarValor}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          className={`${fieldClassSm} w-20 tabular-nums disabled:opacity-50`}
        />
      )}
    </div>
  );
}
