"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { CalendarioIcon, DropshipperIcon } from "@/lib/nav-icons";
import { registrarInteraccion } from "./actions";
import { TIPOS_INTERACCION } from "./def-crm";

const hoy = () => new Date().toISOString().slice(0, 10);

/** «Agregar» de la bitácora de interacciones: la ficha para registrar un contacto con un dropshipper. */
export function RegistrarInteraccionPanel({ dropshippers }: { dropshippers: { id: string; nombre: string }[] }) {
  return (
    <FichaCrear
      titulo="Nueva interacción"
      etiquetaCrear="Registrar interacción"
      action={registrarInteraccion}
      mensajeExito="Interacción registrada"
      // Sin dropshippers no hay a quién registrarle nada: el botón lleva a ese aviso.
      puedeExtra={dropshippers.length > 0}
      alPulsarSinCompletar={() => document.getElementById("campo-dropshipper-interaccion")?.scrollIntoView({ block: "center" })}
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={DropshipperIcon} titulo="Interacción">
            <Campo etiqueta="Dropshipper" id="campo-dropshipper-interaccion" obligatorio faltante={faltante}>
              {dropshippers.length > 0 ? (
                <select
                  id="campo-dropshipper-interaccion"
                  name="dropshipper_id"
                  required
                  data-enfocar
                  aria-invalid={invalido("campo-dropshipper-interaccion")}
                  defaultValue=""
                  className={`${fieldClass} w-full`}
                >
                  <option value="">Selecciona un dropshipper</option>
                  {dropshippers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              ) : (
                <p id="campo-dropshipper-interaccion" role="alert" className="py-1 text-xs text-destructive">
                  Sin dropshippers. Agrega uno para poder registrar interacciones.
                </p>
              )}
            </Campo>
            <Campo etiqueta="Tipo" id="campo-tipo-interaccion" obligatorio faltante={faltante}>
              <select
                id="campo-tipo-interaccion"
                name="tipo"
                required
                aria-invalid={invalido("campo-tipo-interaccion")}
                defaultValue="whatsapp"
                className={`${fieldClass} w-full`}
              >
                {TIPOS_INTERACCION.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          </Seccion>

          <Seccion icono={CalendarioIcon} titulo="Detalle">
            <Campo etiqueta="Fecha" id="campo-fecha-interaccion" obligatorio faltante={faltante}>
              <input
                id="campo-fecha-interaccion"
                type="date"
                name="fecha"
                required
                aria-invalid={invalido("campo-fecha-interaccion")}
                defaultValue={hoy()}
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="Nota" id="campo-nota-interaccion" obligatorio faltante={faltante}>
              <textarea
                id="campo-nota-interaccion"
                name="nota"
                required
                rows={3}
                aria-invalid={invalido("campo-nota-interaccion")}
                placeholder="Ej: Confirmó que empieza a enviar pedidos la próxima semana"
                className={`${fieldClass} w-full resize-y`}
              />
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
