"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { fieldClassSm } from "@/components/ui/field";
import { FiltroFechas } from "@/components/filtro-fechas";

export function PeriodPicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const compararActual = searchParams.get("comparar") ?? "anterior";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <FiltroFechas />
      <select
        aria-label="Comparar con"
        value={compararActual}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("comparar", e.target.value);
          router.push(`${pathname}?${params.toString()}`);
        }}
        className={fieldClassSm}
      >
        <option value="anterior">vs. período anterior</option>
        <option value="anio_pasado">vs. mismo período año pasado</option>
      </select>
    </div>
  );
}
