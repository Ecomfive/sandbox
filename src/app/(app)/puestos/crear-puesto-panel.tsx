"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { PuestosIcon } from "@/lib/nav-icons";
import { AREAS_PUESTO, LARGO } from "@/lib/puestos/puesto";
import { crearPuesto } from "./actions";

/** «Agregar» de Puestos: lo mínimo para crear el puesto; el resto (responsabilidades, SOP, personas) se llena en su ficha. */
export function CrearPuestoPanel({ puestos }: { puestos: { id: string; nombre: string }[] }) {
  return (
    <FichaCrear titulo="Nuevo puesto" etiquetaCrear="Crear puesto" action={crearPuesto} mensajeExito="Puesto creado">
      {({ faltante, invalido }) => (
        <Seccion icono={PuestosIcon} titulo="Puesto">
          <Campo etiqueta="Nombre" id="campo-nombre-puesto" obligatorio faltante={faltante}>
            <input id="campo-nombre-puesto" type="text" name="nombre" required data-enfocar autoComplete="off" maxLength={LARGO.nombre} aria-invalid={invalido("campo-nombre-puesto")} placeholder="Ej: Media Buyer" className={`${fieldClass} w-full`} />
          </Campo>
          <Campo etiqueta="Área" id="campo-area-puesto" obligatorio faltante={faltante}>
            <select id="campo-area-puesto" name="area" required defaultValue="" aria-invalid={invalido("campo-area-puesto")} className={`${fieldClass} w-full`}>
              <option value="" disabled>
                Elige un área
              </option>
              {AREAS_PUESTO.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Reporta a" id="campo-reporta-puesto">
            <select id="campo-reporta-puesto" name="reporta_a" defaultValue="" className={`${fieldClass} w-full`}>
              <option value="">Nadie (cabeza del organigrama)</option>
              {puestos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Plazas" id="campo-plazas-puesto">
            <input id="campo-plazas-puesto" type="number" name="plazas" min={1} max={99} defaultValue={1} className={`${fieldClass} w-28`} />
          </Campo>
          <Campo etiqueta="Misión" id="campo-mision-puesto">
            <textarea id="campo-mision-puesto" name="mision" rows={3} maxLength={LARGO.mision} placeholder="Ej: Gestionar campañas de Meta Ads y optimizar la adquisición de clientes." className={`${fieldClass} w-full resize-y`} />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}
