"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { ETIQUETA_METODO, METODOS_PAGO, TARIFA_PREDETERMINADA } from "@/lib/deliverys/liquidacion";
import { GastoIcon, PersonaIcon } from "@/lib/nav-icons";
import { crearRepartidor } from "../actions";

const TARIFAS = [
  ["tarifa_entrega", "Entrega", TARIFA_PREDETERMINADA.entrega],
  ["tarifa_compartida", "Entrega compartida", TARIFA_PREDETERMINADA.compartida],
  ["tarifa_cambio", "Cambio, retiro o complemento", TARIFA_PREDETERMINADA.cambio],
  ["tarifa_fuera_ruta", "Fuera de ruta", TARIFA_PREDETERMINADA.fuera_ruta],
] as const;

/** «Agregar» de Repartidores. */
export function CrearRepartidorPanel() {
  return (
    <FichaCrear titulo="Nuevo repartidor" etiquetaCrear="Registrar repartidor" action={crearRepartidor} mensajeExito="Repartidor registrado">
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={PersonaIcon} titulo="Repartidor">
            <Campo etiqueta="Nombre completo" id="rep-nombre" obligatorio faltante={faltante}>
              <input id="rep-nombre" name="nombre" required maxLength={120} data-enfocar aria-invalid={invalido("rep-nombre")} placeholder="Ej: Juan Pérez Gómez" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Cédula o pasaporte" id="rep-documento">
              <input id="rep-documento" name="documento" maxLength={40} autoComplete="off" placeholder="Ej: 8-000-0000" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Teléfono" id="rep-telefono">
              <input id="rep-telefono" name="telefono" type="tel" maxLength={40} autoComplete="off" placeholder="Ej: 6000-0000" className={`${fieldClass} w-full`} />
            </Campo>
            <Campo etiqueta="Forma de pago" id="rep-medio">
              <select id="rep-medio" name="medio_pago" defaultValue="" className={`${fieldClass} w-full`}>
                <option value="">Sin dato</option>
                {METODOS_PAGO.map((m) => (
                  <option key={m} value={m}>
                    {ETIQUETA_METODO[m]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Zonas en la hoja (separadas por coma)" id="rep-alias">
              <input id="rep-alias" name="alias" maxLength={600} placeholder="Ej: ZONA 5 JUAN, CHORRERA" className={`${fieldClass} w-full`} />
            </Campo>
          </Seccion>
          <Seccion icono={GastoIcon} titulo="Tarifas propias (USD)">
            {TARIFAS.map(([name, etiqueta, base]) => (
              <Campo key={name} etiqueta={etiqueta} id={`rep-${name}`}>
                <input id={`rep-${name}`} name={name} type="number" inputMode="decimal" step="0.01" min="0" max="100" placeholder={`Ej: ${base.toFixed(2)}`} className={`${fieldClass} w-full tabular-nums`} />
              </Campo>
            ))}
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
