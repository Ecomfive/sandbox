"use client";

import { useMemo } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { MODALIDADES, VIAS_RUTA } from "@/lib/compras/rutas-envio";
import { paisesDelMundo } from "@/lib/paises-mundo";
import type { FilaRuta } from "./def-envios";

/**
 * Los datos de una ruta, iguales al crear y en su ficha: el país (cualquiera del mundo: no hace falta que exista en el
 * sistema), el agente, la vía, DDP o DAP, el courier y el tiempo que promete el agente (días mínimo y máximo).
 */
export function CamposRuta({ ruta, agentes, faltante, invalido }: { ruta?: FilaRuta; agentes: string[]; faltante?: string | null; invalido?: (id: string) => true | undefined }) {
  const paises = useMemo(() => paisesDelMundo(), []);
  const sufijo = ruta?.id ?? "nueva";
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo etiqueta="País" id={`ruta-pais-${sufijo}`} obligatorio faltante={faltante}>
          <select id={`ruta-pais-${sufijo}`} name="pais_codigo" required defaultValue={ruta?.paisCodigo ?? ""} aria-invalid={invalido?.(`ruta-pais-${sufijo}`)} className={fieldClass}>
            <option value="" disabled>
              Elige el país
            </option>
            {paises.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Agente" id={`ruta-agente-${sufijo}`}>
          <input id={`ruta-agente-${sufijo}`} type="text" name="agente" list={`agentes-${sufijo}`} defaultValue={ruta?.agente ?? ""} maxLength={60} placeholder="Ej: Chin" className={fieldClass} />
          <datalist id={`agentes-${sufijo}`}>
            {agentes.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Campo>
        <Campo etiqueta="Vía" id={`ruta-via-${sufijo}`} obligatorio faltante={faltante}>
          <select id={`ruta-via-${sufijo}`} name="via" required defaultValue={ruta?.via ?? ""} aria-invalid={invalido?.(`ruta-via-${sufijo}`)} className={fieldClass}>
            <option value="" disabled>
              Elige la vía
            </option>
            {VIAS_RUTA.map((v) => (
              <option key={v.valor} value={v.valor}>
                {v.etiqueta}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Modalidad" id={`ruta-modalidad-${sufijo}`}>
          <select id={`ruta-modalidad-${sufijo}`} name="modalidad" defaultValue={ruta?.modalidad ?? "DDP"} className={fieldClass}>
            <option value="">—</option>
            {MODALIDADES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Courier" id={`ruta-courier-${sufijo}`}>
          <input id={`ruta-courier-${sufijo}`} type="text" name="courier" defaultValue={ruta?.courier ?? ""} maxLength={60} placeholder="Ej: DHL" className={fieldClass} />
        </Campo>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Campo etiqueta="Días prometidos (mínimo)" id={`ruta-min-${sufijo}`}>
          <input id={`ruta-min-${sufijo}`} type="number" name="dias_min" min={0} max={365} step={1} defaultValue={ruta?.diasMin ?? ""} placeholder="Ej: 45" className={`${fieldClass} tabular-nums`} />
        </Campo>
        <Campo etiqueta="Días prometidos (máximo)" id={`ruta-max-${sufijo}`}>
          <input id={`ruta-max-${sufijo}`} type="number" name="dias_max" min={0} max={365} step={1} defaultValue={ruta?.diasMax ?? ""} placeholder="Ej: 55" className={`${fieldClass} tabular-nums`} />
        </Campo>
      </div>
    </>
  );
}
