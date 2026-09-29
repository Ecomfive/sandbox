import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { calcularPendientes, upsertAlerta } from "@/lib/alertas/pendientes";

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createServiceClient();
  const pendientes = await calcularPendientes(supabase);
  for (const p of pendientes) {
    await upsertAlerta(supabase, p);
  }

  return NextResponse.json({ alertasGeneradas: pendientes.length });
}
