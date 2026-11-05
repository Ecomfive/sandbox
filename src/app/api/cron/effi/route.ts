import { NextResponse } from "next/server";
import { sincronizarEffi } from "@/lib/effi/sincronizar";
import { esPeticionDeCron } from "@/lib/seguridad/cron";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** La lectura diaria de los artículos de Effi por su API (5 nov 2026): solo consulta Effi y guarda en la base. Solo lo acepta el cron de Vercel (`CRON_SECRET`). */
export async function GET(request: Request) {
  if (!esPeticionDeCron(request)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    return NextResponse.json(await sincronizarEffi(createServiceClient()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer Effi." }, { status: 500 });
  }
}
