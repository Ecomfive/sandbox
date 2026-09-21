"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { DropshipperIcon, PersonaIcon } from "@/lib/nav-icons";
import { crearDropshipper } from "./actions";

/** «Agregar» del directorio de dropshippers: la ficha para dar de alta uno (nombre y datos de contacto). */
export function CrearDropshipperPanel({ paisId }: { paisId: string }) {
  return (
    <FichaCrear
      titulo="Nuevo dropshipper"
      etiquetaCrear="Crear dropshipper"
      action={crearDropshipper}
      mensajeExito="Dropshipper agregado"
      ocultos={{ pais_id: paisId }}
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={DropshipperIcon} titulo="Dropshipper">
            <Campo etiqueta="Nombre" id="campo-nombre-dropshipper" obligatorio faltante={faltante}>
              <input
                id="campo-nombre-dropshipper"
                type="text"
                name="nombre"
                required
                data-enfocar
                autoComplete="off"
                aria-invalid={invalido("campo-nombre-dropshipper")}
                placeholder="Ej: Tienda Aurora"
                className={`${fieldClass} w-full`}
              />
            </Campo>
          </Seccion>

          <Seccion icono={PersonaIcon} titulo="Contacto">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo etiqueta="Correo" id="campo-correo-dropshipper">
                <input
                  id="campo-correo-dropshipper"
                  type="email"
                  name="contacto_email"
                  autoComplete="off"
                  placeholder="Ej: contacto@tienda.com"
                  className={`${fieldClass} w-full`}
                />
              </Campo>
              <Campo etiqueta="Teléfono" id="campo-telefono-dropshipper">
                <input
                  id="campo-telefono-dropshipper"
                  type="text"
                  name="contacto_telefono"
                  autoComplete="off"
                  placeholder="Ej: +506 8888 0000"
                  className={`${fieldClass} w-full`}
                />
              </Campo>
            </div>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
