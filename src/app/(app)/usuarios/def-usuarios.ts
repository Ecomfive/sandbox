import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

export interface FilaUsuario {
  id: string;
  email: string;
  nombre: string | null;
  rolId: string | null;
  rolNombre: string | null;
  activo: boolean;
}

/** Cómo se filtra, agrupa y oculta lo inactivo en la tabla de usuarios. */
export const DEF_USUARIOS: DefTabla<FilaUsuario> = {
  clave: "usuarios",
  campos: [
    {
      id: "rol",
      etiqueta: "Rol",
      tipo: "seleccion",
      valores: (u) => [u.rolNombre ?? SIN_VALOR],
      etiquetaSinValor: "Sin rol",
      agrupable: true,
    },
    {
      id: "estado",
      etiqueta: "Estado",
      tipo: "seleccion",
      valores: (u) => [u.activo ? "activo" : "inactivo"],
      opciones: () => [
        { valor: "activo", etiqueta: "Activo" },
        { valor: "inactivo", etiqueta: "Inactivo" },
      ],
      agrupable: true,
      ordenGrupos: ["activo", "inactivo"],
    },
    { id: "correo", etiqueta: "Correo", tipo: "texto", valor: (u) => u.email },
    { id: "nombre", etiqueta: "Nombre", tipo: "texto", valor: (u) => u.nombre ?? "" },
  ],
  // Quien ya no entra al sistema (inactivo) es lo "cerrado" de esta lista; por defecto se ven todos.
  cerrados: {
    etiqueta: "Inactivos",
    esCerrado: (u) => !u.activo,
    campoEstado: "estado",
    valoresCerrados: ["inactivo"],
    ocultosPorDefecto: false,
  },
};
