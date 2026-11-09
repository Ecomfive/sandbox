// Lo común de las rutas `/api/cron/<tarea>`: solo con el secreto de los crons de Vercel (`Authorization: Bearer
// ${CRON_SECRET}`, comparado en tiempo constante; sin secreto configurado, 401) y siempre una respuesta corta en JSON.

import { NextResponse } from "next/server";
import { esPeticionDeCron } from "../seguridad/cron";
import { createServiceClient } from "../supabase/server";
import type { ClaveTarea } from "./definiciones";
import { ejecutarTarea } from "./ejecutar";

export async function manejarCron(request: Request, clave: ClaveTarea): Promise<NextResponse> {
  if (!esPeticionDeCron(request)) return new NextResponse("Unauthorized", { status: 401 });
  const r = await ejecutarTarea(createServiceClient(), clave, { disparo: "cron" });
  return NextResponse.json(
    { tarea: clave, ok: r.ok, omitida: r.omitida ?? false, resumen: r.resumen, error: r.error ?? null },
    { status: r.ok ? 200 : 500 },
  );
}
