"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, GastoIcon, TiendaIcon } from "@/lib/nav-icons";
import type { Opcion } from "@/lib/finanzas/cargar-pendientes";
import { crearMovimiento } from "./movimiento-actions";

/** «Agregar» de Movimientos: un movimiento cargado a mano (un ajuste, un gasto que no está en el Excel). */
export function CrearMovimientoPanel({ tiendas, tipos, cuentas, mes }: { tiendas: Opcion[]; tipos: Opcion[]; cuentas: Opcion[]; mes: string }) {
  return (
    <FichaCrear titulo="Nuevo movimiento" etiquetaCrear="Registrar movimiento" action={crearMovimiento} mensajeExito="Movimiento registrado" abrirConNuevo>
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={TiendaIcon} titulo="Movimiento">
            <Campo etiqueta="Tienda" id="mov-unidad" obligatorio faltante={faltante}>
              <select id="mov-unidad" name="unidad_id" required defaultValue="" data-enfocar aria-invalid={invalido("mov-unidad")} className={`${fieldClass} w-full`}>
                <option value="" disabled>
                  Elegir tienda
                </option>
                {tiendas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Tipo" id="mov-tipo" obligatorio faltante={faltante}>
              <select id="mov-tipo" name="tipo_id" required defaultValue="" aria-invalid={invalido("mov-tipo")} className={`${fieldClass} w-full`}>
                <option value="" disabled>
                  Elegir tipo
                </option>
                {tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Descripción" id="mov-descripcion" obligatorio faltante={faltante}>
              <input
                id="mov-descripcion"
                name="descripcion"
                required
                maxLength={500}
                aria-invalid={invalido("mov-descripcion")}
                placeholder="Ej: Ajuste de comisiones de marzo"
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="Monto (USD)" id="mov-monto" obligatorio faltante={faltante} mensaje="Debe ser mayor a cero">
              <input
                id="mov-monto"
                name="monto"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                required
                aria-invalid={invalido("mov-monto")}
                placeholder="Ej: 1500.00"
                className={`${fieldClass} w-full tabular-nums`}
              />
            </Campo>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Fechas y pago">
            <Campo etiqueta="Mes del EERR" id="mov-mes" obligatorio faltante={faltante}>
              <input id="mov-mes" name="mes" type="month" required defaultValue={mes.slice(0, 7)} aria-invalid={invalido("mov-mes")} className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Fecha de pago" id="mov-pago">
              <input id="mov-pago" name="fecha_pago" type="date" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Forma de pago" id="mov-cuenta">
              <select id="mov-cuenta" name="cuenta_id" defaultValue="" className={`${fieldClass} w-full`}>
                <option value="">Sin forma de pago</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </Seccion>
          <Seccion icono={GastoIcon} titulo="Dónde entra">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="en_eerr" value="si" defaultChecked className="h-4 w-4" />
              Entra al Estado de resultados
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="en_flujo" value="si" defaultChecked className="h-4 w-4" />
              Entra al flujo de caja
            </label>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
