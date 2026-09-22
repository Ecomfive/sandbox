import { SIN_VALOR, type DefTabla } from "@/lib/tabla/motor";

export interface Rol {
  id: string;
  nombre: string;
  descripcion: string | null;
}

export interface FilaUsuario {
  id: string;
  email: string;
  nombre: string | null;
  avatarUrl: string | null;
  rolId: string | null;
  rolNombre: string | null;
  activo: boolean;
  creadoEn: string;
  /** Primer ingreso real (no la invitación) — null si nunca entró. Lo marca un trigger de la base la primera
   * vez que cambia `last_sign_in_at`, así que una cuenta que ya había entrado antes de que existiera esta
   * columna se queda sin este dato: por eso "ya entró" se decide con `primerIngresoEn || ultimoIngresoEn`,
   * nunca con este campo solo. */
  primerIngresoEn: string | null;
  /** Del lado de auth.users, no de `perfiles`: cuándo entró por última vez (null si nunca). */
  ultimoIngresoEn: string | null;
  /** El último "estoy aquí" de `LatidoPresencia` — con qué `EstadoPresencia` decide si está "Activo" ahora. */
  ultimaActividadEn: string | null;
  /** Última vez que se le pidió la foto desde su ficha ("Recordar otra vez") — solo para mostrarlo, no manda nada. */
  fotoRecordadaEn: string | null;
}

/** Qué le falta a una persona para estar completa: cuenta creada (siempre), primer ingreso, foto y
 * rol de trabajo. "Listo" cuando no falta nada. */
export function faltantesDePersona(u: Pick<FilaUsuario, "primerIngresoEn" | "ultimoIngresoEn" | "avatarUrl" | "rolId">): string[] {
  const faltantes: string[] = [];
  if (!u.primerIngresoEn && !u.ultimoIngresoEn) faltantes.push("primer ingreso");
  if (!u.avatarUrl) faltantes.push("foto");
  if (!u.rolId) faltantes.push("rol de trabajo");
  return faltantes;
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
  // Quien ya no entra al sistema (suspendido) es lo "cerrado" de esta lista: por defecto solo se ven
  // los activos, y el botón aísla a los suspendidos (nunca mezclados) — igual que Cuentas destino.
  cerrados: {
    etiqueta: "Suspendidos",
    esCerrado: (u) => !u.activo,
    campoEstado: "estado",
    valoresCerrados: ["inactivo"],
    ocultosPorDefecto: true,
    exclusivo: true,
  },
};
