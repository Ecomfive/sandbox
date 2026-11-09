"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass, labelClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, EtiquetaIcon } from "@/lib/nav-icons";
import { diaCorto, sumarDias } from "@/lib/finanzas/proyeccion-caja";
import { crearAjuste } from "./actions";

/** «Agregar» de los ajustes: una partida a mano en una de las 13 semanas (entra o sale). */
export function CrearAjustePanel({ semanas }: { semanas: string[] }) {
  return (
    <FichaCrear titulo="Nuevo ajuste" etiquetaCrear="Agregar ajuste" action={crearAjuste} mensajeExito="Ajuste agregado" abrirConNuevo>
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={EtiquetaIcon} titulo="Ajuste">
            <Campo etiqueta="Concepto" id="campo-concepto" obligatorio faltante={faltante}>
              <input
                id="campo-concepto"
                name="concepto"
                required
                maxLength={120}
                data-enfocar
                aria-invalid={invalido("campo-concepto")}
                placeholder="Ej: Préstamo bancario"
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <fieldset className="flex flex-col gap-1">
              <legend className={labelClass}>Movimiento</legend>
              <div className="flex gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="sentido" value="salida" defaultChecked />
                  Sale de caja
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="sentido" value="entrada" />
                  Entra a caja
                </label>
              </div>
            </fieldset>
            <Campo etiqueta="Monto en USD" id="campo-monto" obligatorio faltante={faltante}>
              <input
                id="campo-monto"
                name="monto"
                required
                inputMode="decimal"
                pattern="[0-9.,$ ]+"
                aria-invalid={invalido("campo-monto")}
                placeholder="Ej: 15000.00"
                className={`${fieldClass} w-full`}
              />
            </Campo>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Cuándo">
            <Campo etiqueta="Semana" id="campo-semana" obligatorio faltante={faltante}>
              <select id="campo-semana" name="semana" required defaultValue="" aria-invalid={invalido("campo-semana")} className={`${fieldClass} w-full`}>
                <option value="" disabled>
                  Elige la semana
                </option>
                {semanas.map((s, i) => (
                  <option key={s} value={s}>
                    {`S${i + 1} · ${diaCorto(s)} al ${diaCorto(sumarDias(s, 6))}`}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Nota" id="campo-nota" faltante={faltante}>
              <textarea id="campo-nota" name="nota" rows={2} maxLength={2000} placeholder="Ej: Desembolso confirmado por el banco" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
