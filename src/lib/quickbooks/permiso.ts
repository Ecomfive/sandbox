// Quién puede conectar y desconectar QuickBooks y Monday: quien puede **modificar** Usuarios y roles.

import type { UsuarioActual } from "@/lib/auth";

export const administraIntegraciones = (u: Pick<UsuarioActual, "modulos" | "modulosSoloLectura"> | null) =>
  Boolean(u && u.modulos.includes("usuarios") && !u.modulosSoloLectura.includes("usuarios"));
