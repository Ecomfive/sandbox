"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, GastoIcon, TiendaIcon } from "@/lib/nav-icons";
import { crearRecurrente } from "./actions";

type Opcion = { id: string; nombre: string };

function Lista({ id, name, opciones, vacio, obligatorio, invalido }: { id: string; name: string; opciones: Opcion[]; vacio: string; obligatorio?: boolean; invalido?: boolean }) {
  return (
    <select id={id} name={name} required={obligatorio} defaultValue="" aria-invalid={invalido || undefined} className={`${fieldClass} w-full`}>
      <option value="" disabled={obligatorio}>
        {vacio}
      </option>
      {opciones.map((o) => (
        <option key={o.id} value={o.id}>
          {o.nombre}
        </option>
      ))}
    </select>
  );
}

/** «Agregar» de Recurrentes: un movimiento que el libro registra solo cada mes. */
export function CrearRecurrentePanel({ tiendas, tipos, cuentas, mes }: { tiendas: Opcion[]; tipos: Opcion[]; cuentas: Opcion[]; mes: string }) {
  return (
    <FichaCrear titulo="Nuevo recurrente" etiquetaCrear="Crear recurrente" action={crearRecurrente} mensajeExito="Recurrente creado" abrirConNuevo>
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={TiendaIcon} titulo="Movimiento">
            <Campo etiqueta="Tienda" id="rec-unidad" obligatorio faltante={faltante}>
              <Lista id="rec-unidad" name="unidad_id" opciones={tiendas} vacio="Elegir tienda" obligatorio invalido={invalido("rec-unidad")} />
            </Campo>
            <Campo etiqueta="Tipo" id="rec-tipo" obligatorio faltante={faltante}>
              <Lista id="rec-tipo" name="tipo_id" opciones={tipos} vacio="Elegir tipo" obligatorio invalido={invalido("rec-tipo")} />
            </Campo>
            <Campo etiqueta="Descripción" id="rec-descripcion" obligatorio faltante={faltante}>
              <input id="rec-descripcion" name="descripcion" required maxLength={500} data-enfocar aria-invalid={invalido("rec-descripcion")} placeholder="Ej: Alquiler de la oficina" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Monto (USD)" id="rec-monto" obligatorio faltante={faltante} mensaje="Debe ser mayor a cero">
              <input id="rec-monto" name="monto" type="number" inputMode="decimal" step="0.01" min="0.01" required aria-invalid={invalido("rec-monto")} placeholder="Ej: 850.00" className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Cuándo">
            <Campo etiqueta="Día del mes" id="rec-dia" obligatorio faltante={faltante} mensaje="Del 1 al 31">
              <input id="rec-dia" name="dia" type="number" min="1" max="31" step="1" required defaultValue="1" aria-invalid={invalido("rec-dia")} className={`${fieldClass} w-full tabular-nums`} />
            </Campo>
            <Campo etiqueta="Desde" id="rec-desde" obligatorio faltante={faltante}>
              <input id="rec-desde" name="desde" type="month" required defaultValue={mes} aria-invalid={invalido("rec-desde")} className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Hasta (vacío = sin fin)" id="rec-hasta">
              <input id="rec-hasta" name="hasta" type="month" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Forma de pago" id="rec-cuenta">
              <Lista id="rec-cuenta" name="cuenta_id" opciones={cuentas} vacio="Sin forma de pago" />
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
