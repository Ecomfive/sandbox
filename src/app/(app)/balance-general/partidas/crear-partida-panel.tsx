"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, WalletIcon } from "@/lib/nav-icons";
import { RUBROS_PARTIDA } from "@/lib/finanzas/balance";
import { guardarPartidaBalance } from "../actions";

export interface OpcionEntidad {
  id: string;
  nombre: string;
}

/** «Agregar» de Partidas del balance: el saldo de un concepto desde el cierre de un mes (si ya había uno, se reemplaza). */
export function CrearPartidaPanel({ entidades, mesSugerido }: { entidades: OpcionEntidad[]; mesSugerido: string }) {
  return (
    <FichaCrear titulo="Partida del balance" etiquetaCrear="Guardar partida" action={guardarPartidaBalance} mensajeExito="Partida guardada" abrirConNuevo>
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={WalletIcon} titulo="Partida">
            <Campo etiqueta="Rubro" id="campo-rubro" obligatorio faltante={faltante}>
              <select id="campo-rubro" name="rubro" required defaultValue="" data-enfocar aria-invalid={invalido("campo-rubro")} className={`${fieldClass} w-full`}>
                <option value="" disabled>
                  Elige un rubro
                </option>
                {RUBROS_PARTIDA.map((r) => (
                  <option key={r.clave} value={r.clave}>
                    {r.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Concepto" id="campo-concepto" obligatorio faltante={faltante}>
              <input id="campo-concepto" name="concepto" required maxLength={120} aria-invalid={invalido("campo-concepto")} placeholder="Ej: Préstamo Banco Uno" className={`${fieldClass} w-full`} />
            </Campo>
            {entidades.length > 1 && (
              <Campo etiqueta="Entidad" id="campo-entidad" faltante={faltante}>
                <select id="campo-entidad" name="entidad_id" defaultValue={entidades[0]?.id ?? ""} className={`${fieldClass} w-full`}>
                  {entidades.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Saldo">
            <Campo etiqueta="Desde el cierre de" id="campo-mes" obligatorio faltante={faltante}>
              <input id="campo-mes" name="mes" type="month" required defaultValue={mesSugerido} aria-invalid={invalido("campo-mes")} className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Saldo en dólares" id="campo-monto" obligatorio faltante={faltante}>
              <input
                id="campo-monto"
                name="monto"
                required
                inputMode="decimal"
                pattern="-?[0-9.,$ ]+"
                aria-invalid={invalido("campo-monto")}
                placeholder="Ej: 15000.00"
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="Nota" id="campo-nota" faltante={faltante}>
              <input id="campo-nota" name="nota" maxLength={300} placeholder="Ej: Saldo según estado del banco" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
