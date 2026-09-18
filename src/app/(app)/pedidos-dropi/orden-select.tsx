"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { fieldClass, labelClassSm } from "@/components/ui/field";

const OPCIONES = [
  { valor: "fecha_desc", etiqueta: "Fecha (recientes primero)" },
  { valor: "fecha_asc", etiqueta: "Fecha (antiguos primero)" },
  { valor: "monto_asc", etiqueta: "Monto (menor a mayor)" },
  { valor: "monto_desc", etiqueta: "Monto (mayor a menor)" },
];

export function OrdenSelect({ actual }: { actual: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <div className="flex flex-col gap-1">
      <label className={labelClassSm}>Ordenar por</label>
      <select
        defaultValue={actual}
        className={fieldClass}
        onChange={(e) => {
          const params = new URLSearchParams(searchParams.toString());
          params.set("orden", e.target.value);
          router.push(`${pathname}?${params.toString()}`);
        }}
      >
        {OPCIONES.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </div>
  );
}
