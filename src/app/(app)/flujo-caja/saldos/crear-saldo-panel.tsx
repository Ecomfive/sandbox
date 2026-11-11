"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, WalletIcon } from "@/lib/nav-icons";
import { guardarSaldoInicial } from "../actions";

export interface OpcionCuenta {
  id: string;
  nombre: string;
}

/** «Agregar» de Saldos iniciales: el saldo de una cuenta al comenzar un mes (si ya había uno, se reemplaza). */
export function CrearSaldoPanel({ cuentas, mesSugerido }: { cuentas: OpcionCuenta[]; mesSugerido: string }) {
  return (
    <FichaCrear titulo="Saldo inicial" etiquetaCrear="Guardar saldo" action={guardarSaldoInicial} mensajeExito="Saldo guardado" abrirConNuevo>
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={WalletIcon} titulo="Cuenta">
            <Campo etiqueta="Forma de pago" id="campo-cuenta" obligatorio faltante={faltante}>
              <select id="campo-cuenta" name="cuenta_id" required defaultValue="" data-enfocar aria-invalid={invalido("campo-cuenta")} className={`${fieldClass} w-full`}>
                <option value="" disabled>
                  Elige una cuenta
                </option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Saldo">
            <Campo etiqueta="Al comenzar el mes" id="campo-mes" obligatorio faltante={faltante}>
              <input
                id="campo-mes"
                name="mes"
                type="month"
                required
                defaultValue={mesSugerido}
                aria-invalid={invalido("campo-mes")}
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="Saldo en la moneda de la cuenta" id="campo-monto" obligatorio faltante={faltante}>
              <input
                id="campo-monto"
                name="monto"
                required
                inputMode="decimal"
                pattern="-?[0-9.,$ ]+"
                aria-invalid={invalido("campo-monto")}
                placeholder="Ej: 12500.00 o -850.00"
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="Nota" id="campo-nota" faltante={faltante}>
              <input id="campo-nota" name="nota" maxLength={200} placeholder="Ej: Extracto al 31/12" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
