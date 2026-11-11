"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, WalletIcon } from "@/lib/nav-icons";
import { guardarTipoCambio } from "./actions";

/** «Agregar» de Tipos de cambio: promedio y cierre de un mes (si ya había uno, se reemplaza y queda como manual). */
export function CrearTipoCambioPanel({ monedas, mesSugerido }: { monedas: string[]; mesSugerido: string }) {
  return (
    <FichaCrear titulo="Tipo de cambio del mes" etiquetaCrear="Guardar tipo de cambio" action={guardarTipoCambio} mensajeExito="Tipo de cambio guardado" abrirConNuevo>
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={CalendarioIcon} titulo="Mes">
            <Campo etiqueta="Moneda" id="campo-moneda" obligatorio faltante={faltante}>
              <select
                id="campo-moneda"
                name="moneda"
                required
                defaultValue={monedas.length === 1 ? monedas[0] : ""}
                data-enfocar
                aria-invalid={invalido("campo-moneda")}
                className={`${fieldClass} w-full`}
              >
                <option value="" disabled>
                  Elige una moneda
                </option>
                {monedas.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Mes" id="campo-mes" obligatorio faltante={faltante}>
              <input id="campo-mes" name="mes" type="month" required defaultValue={mesSugerido} aria-invalid={invalido("campo-mes")} className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
          <Seccion icono={WalletIcon} titulo="Unidades por 1 USD">
            <Campo etiqueta="Promedio del mes" id="campo-promedio" obligatorio faltante={faltante}>
              <input
                id="campo-promedio"
                name="promedio"
                required
                inputMode="decimal"
                pattern="[0-9.,]+"
                aria-invalid={invalido("campo-promedio")}
                placeholder="Ej: 505.25"
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="Cierre del mes" id="campo-cierre" faltante={faltante}>
              <input id="campo-cierre" name="cierre" inputMode="decimal" pattern="[0-9.,]+" placeholder="Ej: 507.80" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Nota" id="campo-nota" faltante={faltante}>
              <input id="campo-nota" name="nota" maxLength={300} placeholder="Ej: Tipo de cambio de referencia de venta" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
