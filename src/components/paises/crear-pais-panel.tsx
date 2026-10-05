"use client";

import type { ReactNode } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { crearPais } from "@/lib/paises-actions";
import { ConfiguracionIcon } from "@/lib/nav-icons";

/** La ficha para agregar un país (código ISO y nombre). Por defecto se abre con «Agregar»; `boton` pone otro. */
export function CrearPaisPanel({ boton }: { boton?: (abrir: () => void) => ReactNode }) {
  return (
    <FichaCrear titulo="Nuevo país" etiquetaCrear="Agregar país" action={crearPais} mensajeExito="País agregado" boton={boton}>
      {({ faltante, invalido }) => (
        <Seccion icono={ConfiguracionIcon} titulo="País">
          <Campo etiqueta="Nombre" id="campo-nombre-pais" obligatorio faltante={faltante}>
            <input
              id="campo-nombre-pais"
              type="text"
              name="nombre"
              required
              data-enfocar
              maxLength={60}
              aria-invalid={invalido("campo-nombre-pais")}
              placeholder="Ej: México"
              className={`${fieldClass} w-full`}
            />
          </Campo>
          <Campo etiqueta="Código ISO (dos letras)" id="campo-codigo-pais" obligatorio faltante={faltante}>
            <input
              id="campo-codigo-pais"
              type="text"
              name="codigo"
              required
              minLength={2}
              maxLength={2}
              pattern="[A-Za-z]{2}"
              autoComplete="off"
              aria-invalid={invalido("campo-codigo-pais")}
              placeholder="Ej: MX"
              className={`${fieldClass} w-full uppercase`}
            />
          </Campo>
        </Seccion>
      )}
    </FichaCrear>
  );
}
