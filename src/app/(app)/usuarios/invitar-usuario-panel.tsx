"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { PersonaIcon } from "@/lib/nav-icons";
import { invitarDesdeFicha } from "./actions";

/** «Agregar» de Usuarios: la ficha para invitar a una persona (correo, nombre y rol). */
export function InvitarUsuarioPanel({ roles }: { roles: { id: string; nombre: string }[] }) {
  return (
    <FichaCrear titulo="Invitar usuario" etiquetaCrear="Invitar usuario" action={invitarDesdeFicha} mensajeExito="Invitación enviada">
      {({ faltante, invalido }) => (
        <>
          <Seccion icono={PersonaIcon} titulo="Usuario">
            <Campo etiqueta="Correo" id="campo-correo-usuario" obligatorio faltante={faltante}>
              <input
                id="campo-correo-usuario"
                type="email"
                name="email"
                required
                data-enfocar
                autoComplete="off"
                aria-invalid={invalido("campo-correo-usuario")}
                placeholder="Ej: nombre@empresa.com"
                className={`${fieldClass} w-full`}
              />
            </Campo>
            <Campo etiqueta="Nombre" id="campo-nombre-usuario">
              <input
                id="campo-nombre-usuario"
                type="text"
                name="nombre"
                autoComplete="off"
                placeholder="Ej: Ana Pérez"
                className={`${fieldClass} w-full`}
              />
            </Campo>
          </Seccion>

          <Seccion icono={PersonaIcon} titulo="Rol">
            <Campo etiqueta="Rol" id="campo-rol-usuario">
              <select id="campo-rol-usuario" name="rol_id" defaultValue="" className={`${fieldClass} w-full`}>
                <option value="">Sin rol</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
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
