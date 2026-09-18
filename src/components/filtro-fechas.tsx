"use client";

import { useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { fieldClassSm } from "@/components/ui/field";

export interface PresetFecha {
  valor: string;
  etiqueta: string;
}

export const PRESETS_FECHA_ESTANDAR: PresetFecha[] = [
  { valor: "7d", etiqueta: "7 días" },
  { valor: "30d", etiqueta: "30 días" },
  { valor: "mes_actual", etiqueta: "Este mes" },
  { valor: "mes_anterior", etiqueta: "Mes anterior" },
];

/**
 * Selector de rango de fechas unico para toda la plataforma: presets rapidos
 * (7 dias, 30 dias, etc.) mas un rango personalizado Desde/Hasta, siempre
 * manejado por parametros de URL (preset | desde+hasta) para que cualquier
 * pagina que lea esos mismos parametros funcione igual sin importar cual
 * mecanismo se haya usado para elegir la fecha.
 */
export function FiltroFechas({ presets = PRESETS_FECHA_ESTANDAR }: { presets?: PresetFecha[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const esPersonalizado = Boolean(searchParams.get("desde"));
  const presetActual = esPersonalizado ? "personalizado" : (searchParams.get("preset") ?? presets[0]?.valor ?? "");
  const [mostrarPersonalizado, setMostrarPersonalizado] = useState(esPersonalizado);
  const desdeRef = useRef<HTMLInputElement>(null);
  const hastaRef = useRef<HTMLInputElement>(null);

  function elegirPreset(valor: string) {
    setMostrarPersonalizado(false);
    const params = new URLSearchParams(searchParams.toString());
    params.set("preset", valor);
    params.delete("desde");
    params.delete("hasta");
    router.push(`${pathname}?${params.toString()}`);
  }

  function aplicarPersonalizado() {
    const desde = desdeRef.current?.value;
    const hasta = hastaRef.current?.value;
    if (!desde || !hasta) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("preset");
    params.set("desde", desde);
    params.set("hasta", hasta);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap rounded-md border border-border bg-card p-0.5">
        {presets.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => elegirPreset(p.valor)}
            className={
              presetActual === p.valor
                ? "rounded px-3 py-1 text-xs font-medium bg-accent text-accent-foreground"
                : "rounded px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
            }
          >
            {p.etiqueta}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setMostrarPersonalizado((v) => !v)}
          className={
            presetActual === "personalizado"
              ? "rounded px-3 py-1 text-xs font-medium bg-accent text-accent-foreground"
              : "rounded px-3 py-1 text-xs text-muted-foreground hover:bg-muted"
          }
        >
          Personalizado
        </button>
      </div>
      {mostrarPersonalizado && (
        <div className="flex items-center gap-1.5">
          <input
            ref={desdeRef}
            type="date"
            defaultValue={searchParams.get("desde") ?? ""}
            onChange={aplicarPersonalizado}
            className={fieldClassSm}
          />
          <span className="text-xs text-muted-foreground">a</span>
          <input
            ref={hastaRef}
            type="date"
            defaultValue={searchParams.get("hasta") ?? ""}
            onChange={aplicarPersonalizado}
            className={fieldClassSm}
          />
        </div>
      )}
    </div>
  );
}
