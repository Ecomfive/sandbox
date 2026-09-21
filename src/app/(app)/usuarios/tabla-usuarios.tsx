"use client";

import type { IconoComp } from "@/components/tabla/botones-vista";
import { TablaDatos, type ColumnaTabla } from "@/components/tabla/tabla-datos";
import { EstadoIcon, PersonaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { ActivoToggle } from "./activo-toggle";
import { DEF_USUARIOS, type FilaUsuario } from "./def-usuarios";
import { RolSelect } from "./rol-select";

const NOMBRE: NombreFilas = { singular: "usuario", plural: "usuarios" };
const ICONOS: Record<string, IconoComp> = {
  rol: PersonaIcon,
  estado: EstadoIcon,
  correo: PersonaIcon,
  nombre: PersonaIcon,
};

interface Rol {
  id: string;
  nombre: string;
}

const COLUMNAS: ColumnaTabla<FilaUsuario, Rol[]>[] = [
  { id: "correo", label: "Correo", ocultable: false, clase: "font-medium", render: (u) => u.email },
  { id: "nombre", label: "Nombre", ocultable: true, clase: "text-muted-foreground", render: (u) => u.nombre ?? "—" },
  { id: "rol", label: "Rol", ocultable: true, render: (u, roles) => <RolSelect perfilId={u.id} rolIdActual={u.rolId} roles={roles} usuario={u.nombre ?? u.email} /> },
  { id: "estado", label: "Estado", ocultable: true, render: (u) => <ActivoToggle perfilId={u.id} activo={u.activo} /> },
];

/** Tabla de usuarios con la barra de herramientas común (agrupar por rol o estado, inactivos, filtros y columnas). */
export function TablaUsuarios({ usuarios, roles }: { usuarios: FilaUsuario[]; roles: Rol[] }) {
  return (
    <TablaDatos
      def={DEF_USUARIOS}
      filas={usuarios}
      columnas={COLUMNAS}
      contexto={roles}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(u) => u.id}
      ariaLabel="Tabla de usuarios"
      vacio="Todavía no hay usuarios invitados."
    />
  );
}
