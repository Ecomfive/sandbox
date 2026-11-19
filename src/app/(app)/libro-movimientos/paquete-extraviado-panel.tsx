"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { hoyPanama } from "@/lib/af4/fecha";
import type { Opcion } from "@/lib/finanzas/cargar-pendientes";
import { EnvioIcon, GastoIcon, PedidoIcon } from "@/lib/nav-icons";
import { registrarPaqueteExtraviado } from "./paquete-extraviado-actions";

/**
 * «Paquete extraviado»: deja la mercadería perdida como merma (costo de ventas, fuera del flujo) y lo que paga el
 * repartidor como otros ingresos (en el flujo si ya entró a una cuenta). Si el pago lleva factura lo decide el contador.
 */
export function PaqueteExtraviadoPanel({ tiendas, cuentas }: { tiendas: Opcion[]; cuentas: Opcion[] }) {
  return (
    <FichaCrear
      titulo="Paquete extraviado"
      etiquetaCrear="Registrar paquete extraviado"
      action={registrarPaqueteExtraviado}
      mensajeExito="Paquete extraviado registrado"
      boton={(abrir) => (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={abrir}
          className={`inline-flex items-center gap-1.5 border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted ${anilloFoco} !rounded-md`}
        >
          <EnvioIcon className="h-4 w-4" />
          Paquete extraviado
        </button>
      )}
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={PedidoIcon} titulo="Pedido">
            <Campo etiqueta="Tienda" id="ext-unidad" obligatorio faltante={faltante}>
              <select id="ext-unidad" name="unidad_id" required defaultValue="" data-enfocar aria-invalid={invalido("ext-unidad")} className={`${fieldClass} w-full`}>
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
            <Campo etiqueta="Pedido o guía" id="ext-pedido" obligatorio faltante={faltante}>
              <input id="ext-pedido" name="pedido" required maxLength={60} aria-invalid={invalido("ext-pedido")} placeholder="Ej: #10452" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Día en que se perdió" id="ext-fecha" obligatorio faltante={faltante}>
              <input id="ext-fecha" name="fecha" type="date" required defaultValue={hoyPanama()} aria-invalid={invalido("ext-fecha")} className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Repartidor" id="ext-repartidor">
              <input id="ext-repartidor" name="repartidor" maxLength={80} placeholder="Ej: Juan Pérez" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
          <Seccion icono={GastoIcon} titulo="Montos (USD)">
            <Campo etiqueta="Costo de la mercadería perdida" id="ext-costo">
              <input id="ext-costo" name="costo" type="number" inputMode="decimal" step="0.01" min="0" placeholder="Ej: 12.40" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
            <Campo etiqueta="Lo que paga el repartidor" id="ext-pago">
              <input id="ext-pago" name="indemnizacion" type="number" inputMode="decimal" step="0.01" min="0" placeholder="Ej: 25.00" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
            <Campo etiqueta="Cuenta donde entró el pago" id="ext-cuenta">
              <select id="ext-cuenta" name="cuenta_id" defaultValue="" className={`${fieldClass} w-full`}>
                <option value="">Todavía no entra (por cobrar)</option>
                {cuentas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Fecha del pago" id="ext-fecha-pago">
              <input id="ext-fecha-pago" name="fecha_pago" type="date" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
