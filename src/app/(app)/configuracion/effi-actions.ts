"use server";

import { requireModulo } from "@/lib/auth";
import { probarConexionEffi, type ResumenConexionEffi } from "@/lib/effi/api";

/** «Probar conexión con Effi» de Configuración: dos consultas de solo lectura con la llave del servidor. */
export async function probarEffi(): Promise<{ resumen?: ResumenConexionEffi; error?: string }> {
  await requireModulo("configuracion");
  const r = await probarConexionEffi();
  return r.ok ? { resumen: r.resumen } : { error: r.error };
}
