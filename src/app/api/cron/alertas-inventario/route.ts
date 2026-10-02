import { NextResponse } from "next/server";
import { esPeticionDeCron } from "@/lib/seguridad/cron";
import { createServiceClient } from "@/lib/supabase/server";
import { calcularPendientes, upsertAlerta } from "@/lib/alertas/pendientes";

export async function GET(request: Request) {
  if (!esPeticionDeCron(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createServiceClient();
  const pendientes = await calcularPendientes(supabase);
  for (const p of pendientes) {
    await upsertAlerta(supabase, p);
  }

  return NextResponse.json({ alertasGeneradas: pendientes.length });
}
