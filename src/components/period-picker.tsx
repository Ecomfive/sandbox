"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { fieldClassSm } from "@/components/ui/field";

const PRESETS = [
  { valor: "7d", etiqueta: "7 días" },
  { valor: "30d", etiqueta: "30 días" },
  { valor: "mes_actual", etiqueta: "Este mes" },
  { valor: "mes_anterior", etiqueta: "Mes anterior" },
];

export function PeriodPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const esPersonalizado = Boolean(searchParams.get("desde"));
  const presetActual = esPersonalizado ? "personalizado" : (searchParams.get("preset") ?? "7d");
  const compararActual = searchParams.get("comparar") ?? "anterior";

  function conParam(clave: string, valor: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(clave, valor);
    if (clave === "preset") {
      params.delete("desde");
      params.delete("hasta");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap rounded-md border border-border bg-card p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => conParam("preset", p.valor)}
            className={
              presetActual === p.valor
                ? "rounded px-3 py-1 text-xs font-medium bg-accent text-accent-foreground"
                : "rounded px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
            }
          >
            {p.etiqueta}
          </button>
        ))}
      </div>
      <select
        value={compararActual}
        onChange={(e) => conParam("comparar", e.target.value)}
        className={fieldClassSm}
      >
        <option value="anterior">vs. período anterior</option>
        <option value="anio_pasado">vs. mismo período año pasado</option>
      </select>
    </div>
  );
}
