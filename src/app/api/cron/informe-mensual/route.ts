import { manejarCron } from "@/lib/tareas/ruta";

export const dynamic = "force-dynamic";
// El trabajo se corta a los 45 s (`PRESUPUESTO_MS`) y lo que falta sigue en la próxima ejecución.
export const maxDuration = 60;

export function GET(request: Request) {
  return manejarCron(request, "informe-mensual");
}
