"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { EtiquetaIcon } from "@/lib/nav-icons";
import { crearRol } from "./actions";

/** «Agregar» de Roles y permisos: la ficha para crear un rol (después se le marcan los módulos en la tabla). */
export function CrearRolPanel() {
  return (
    <FichaCrear titulo="Nuevo rol" etiquetaCrear="Crear rol" action={crearRol} mensajeExito="Rol creado">
      {({ faltante, invalido }) => (
        <Seccion icono={EtiquetaIcon} titulo="Rol">
          <Campo etiqueta="Nombre del rol" id="campo-nombre-rol" obligatorio faltante={faltante}>
            <input
              id="campo-nombre-rol"
              type="text"
              name="nombre"
              required
              data-enfocar
              aria-invalid={invalido("campo-nombre-rol")}
              placeholder="Ej: Finanzas"
              className={`${fieldClass} w-full`}
            />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}
