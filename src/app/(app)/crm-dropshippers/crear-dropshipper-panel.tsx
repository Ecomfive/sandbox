"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { DropshipperIcon, PersonaIcon } from "@/lib/nav-icons";
import { FASES } from "@/lib/crm/areas";
import { crearDropshipper } from "./actions";
import { CampoTiendas } from "./campo-tiendas";

/** «Agregar» del directorio de dropshippers: la ficha para dar de alta uno (nombre y datos de contacto). */
export function CrearDropshipperPanel({ paisId, conFase }: { paisId: string; conFase: boolean }) {
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <CampoTiendas id="campo-tienda-dropshipper" />
              <Campo etiqueta="Ciudad" id="campo-ciudad-dropshipper">
                <input
                  id="campo-ciudad-dropshipper"
                  type="text"
                  name="ciudad"
                  autoComplete="off"
                  placeholder="Ej: Medellín"
                  className={`${fieldClass} w-full`}
                />
              </Campo>
            </div>
            {conFase && (
              <Campo etiqueta="Fase" id="campo-fase-dropshipper">
                <select id="campo-fase-dropshipper" name="fase" defaultValue="activo" className={`${fieldClass} w-full`}>
                  {FASES.map((f) => (
                    <option key={f.valor} value={f.valor}>
                      {f.etiqueta}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
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
                  placeholder="Ej: +57 300 111 2233"
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
