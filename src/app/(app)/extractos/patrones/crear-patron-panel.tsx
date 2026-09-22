"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { ExtractoIcon, TiendaIcon } from "@/lib/nav-icons";
import { crearPatron } from "./actions";

/** «Agregar» de Patrones bancarios: la ficha para guardar un texto a buscar y la plataforma que se le asigna. */
export function CrearPatronPanel({ paisId, plataformas }: { paisId: string; plataformas: { id: string; nombre: string }[] }) {
  return (
    <FichaCrear
      titulo="Nuevo patrón"
      etiquetaCrear="Guardar patrón"
      action={crearPatron}
      mensajeExito="Patrón guardado"
      ocultos={{ pais_id: paisId }}
    >
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={ExtractoIcon} titulo="Texto a buscar">
            <Campo etiqueta="Texto a buscar" id="campo-fragmento" obligatorio faltante={faltante}>
              <input
                id="campo-fragmento"
                type="text"
                name="fragmento"
                required
                data-enfocar
                aria-invalid={invalido("campo-fragmento")}
                placeholder="Ej: TRANSF SINPE DROPI"
                className={`${fieldClass} w-full font-mono`}
              />
            </Campo>
          </Seccion>

          <Seccion icono={TiendaIcon} titulo="Plataforma">
            <Campo etiqueta="Plataforma" id="campo-plataforma-patron" obligatorio faltante={faltante}>
              <select
                id="campo-plataforma-patron"
                name="plataforma_id"
                required
                aria-invalid={invalido("campo-plataforma-patron")}
                defaultValue=""
                className={`${fieldClass} w-full`}
              >
                <option value="">Selecciona una plataforma</option>
                {plataformas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </Seccion>
        </>
      )}
    </FichaCrear>
  );
}
