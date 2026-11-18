import { NextResponse } from "next/server";
import { leerCuentasMeta } from "@/lib/meta-ads/leer-cuentas";
import { esPeticionDeCron } from "@/lib/seguridad/cron";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** La lectura de las cuentas publicitarias de Meta (18 nov 2026): solo consulta Meta y guarda en la base, nunca cambia nada en Meta. Solo lo acepta el cron de Vercel (`CRON_SECRET`). */
export async function GET(request: Request) {
  if (!esPeticionDeCron(request)) return new NextResponse("Unauthorized", { status: 401 });
  try {
    return NextResponse.json(await leerCuentasMeta(createServiceClient()));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer Meta." }, { status: 500 });
  }
}
