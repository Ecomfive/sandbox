"use client";

import { useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, PersonaIcon, TiendaIcon } from "@/lib/nav-icons";
import { guardarParticipacion } from "../actions";

export interface Opcion {
  id: string;
  nombre: string;
}

const NUEVO = "nuevo";

/**
 * «Agregar» de Participaciones: el porcentaje de un socio en una tienda desde un mes. Cambiar un porcentaje es agregar
 * uno nuevo con otra fecha; lo anterior queda como historia. Para sacar a un socio de una tienda, 0 %.
 */
export function CrearParticipacionPanel({ socios, tiendas, mesSugerido }: { socios: Opcion[]; tiendas: Opcion[]; mesSugerido: string }) {
  const [socio, setSocio] = useState("");
  return (
    <FichaCrear
      titulo="Porcentaje de un socio"
      etiquetaCrear="Guardar porcentaje"
      action={guardarParticipacion}
      mensajeExito="Porcentaje guardado"
      abrirConNuevo
      alAbrir={() => setSocio("")}
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={PersonaIcon} titulo="Socio">
            <Campo etiqueta="Socio" id="campo-socio" obligatorio faltante={faltante}>
              <select
                id="campo-socio"
                name="socio_id"
                required
                value={socio}
                onChange={(e) => setSocio(e.target.value)}
                data-enfocar
                aria-invalid={invalido("campo-socio")}
                className={`${fieldClass} w-full`}
              >
                <option value="" disabled>
                  Elige un socio
                </option>
                {socios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
                <option value={NUEVO}>Nuevo socio…</option>
              </select>
            </Campo>
            {socio === NUEVO && (
              <Campo etiqueta="Nombre del socio nuevo" id="campo-socio-nuevo" obligatorio faltante={faltante}>
                <input
                  id="campo-socio-nuevo"
                  name="socio_nuevo"
                  required
                  minLength={3}
                  maxLength={80}
                  aria-invalid={invalido("campo-socio-nuevo")}
                  placeholder="Ej: Inversiones Ejemplo S.A."
                  className={`${fieldClass} w-full`}
                />
              </Campo>
            )}
          </Seccion>
          <Seccion icono={TiendaIcon} titulo="Tienda y porcentaje">
            <Campo etiqueta="Tienda" id="campo-tienda" obligatorio faltante={faltante}>
              <select id="campo-tienda" name="unidad_id" required defaultValue="" aria-invalid={invalido("campo-tienda")} className={`${fieldClass} w-full`}>
                <option value="" disabled>
                  Elige una tienda
                </option>
                {tiendas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Porcentaje de la utilidad" id="campo-porcentaje" obligatorio faltante={faltante}>
              <input
                id="campo-porcentaje"
                name="porcentaje"
                required
                inputMode="decimal"
                pattern="[0-9]{1,3}([.,][0-9]{1,4})?"
                aria-invalid={invalido("campo-porcentaje")}
                placeholder="Ej: 47.5"
                className={`${fieldClass} w-full`}
              />
            </Campo>
          </Seccion>
          <Seccion icono={CalendarioIcon} titulo="Vigencia">
            <Campo etiqueta="Rige desde" id="campo-desde" obligatorio faltante={faltante}>
              <input
                id="campo-desde"
                name="desde"
                type="month"
                required
                defaultValue={mesSugerido}
                aria-invalid={invalido("campo-desde")}
                className={`${fieldClass} w-full`}
              />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
