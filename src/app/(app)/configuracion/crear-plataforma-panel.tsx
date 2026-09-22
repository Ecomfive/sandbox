"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { TiendaIcon } from "@/lib/nav-icons";
import { crearPlataforma } from "./actions";

/** «Agregar» de Plataformas: la ficha para crear una plataforma del país (queda disponible para crear retiros). */
export function CrearPlataformaPanel({ paisId }: { paisId: string }) {
  return (
    <FichaCrear
      titulo="Nueva plataforma"
      etiquetaCrear="Crear plataforma"
      action={crearPlataforma}
      mensajeExito="Plataforma agregada"
      ocultos={{ pais_id: paisId }}
    >
      {({ faltante, invalido }) => (
        <Seccion icono={TiendaIcon} titulo="Plataforma">
          <Campo etiqueta="Nombre de la plataforma" id="campo-nombre-plataforma" obligatorio faltante={faltante}>
            <input
              id="campo-nombre-plataforma"
              type="text"
              name="nombre"
              required
              data-enfocar
              aria-invalid={invalido("campo-nombre-plataforma")}
              placeholder="Ej: Boxful"
              className={`${fieldClass} w-full`}
            />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}
