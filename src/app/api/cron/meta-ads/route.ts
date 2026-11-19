import { NextResponse } from "next/server";
import { analizarPendientes } from "@/lib/meta-ads/analizar-videos";
import { leerCuentasMeta } from "@/lib/meta-ads/leer-cuentas";
import { esPeticionDeCron } from "@/lib/seguridad/cron";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * La lectura de las cuentas publicitarias de Meta (18 nov 2026): solo consulta Meta y guarda en la base, nunca cambia nada en Meta. Después, con el tiempo que quede, la IA ve los videos
 * con más gasto que todavía no tienen análisis (ángulo, promesa, gancho, estructura, llamado a la acción). Con `?solo=videos` no lee Meta y dedica todo el tiempo a los videos: Vercel lo corre cada 10 minutos (un video tarda de 20 a
 * 90 segundos, así que cada pasada hace de 3 a 8; si no hay pendientes, termina en un segundo y no cuesta nada). Ve todo el historial leído, de más a menos gasto, hasta ponerse al día. Solo lo acepta el cron de Vercel (`CRON_SECRET`).
 */
export async function GET(request: Request) {
  if (!esPeticionDeCron(request)) return new NextResponse("Unauthorized", { status: 401 });
  const inicio = Date.now();
  try {
    const supabase = createServiceClient();
    const soloVideos = new URL(request.url).searchParams.get("solo") === "videos";
    const lectura = soloVideos ? { lecturas: [], sinCuentas: false } : await leerCuentasMeta(supabase, { presupuestoMs: 120_000 });
    let videos: Awaited<ReturnType<typeof analizarPendientes>> | { error: string } | null = null;
    try {
      videos = await analizarPendientes(supabase, { limiteMs: 285_000 - (Date.now() - inicio), max: soloVideos ? 8 : 3, quien: "Lectura automática" });
    } catch (e) {
      videos = { error: e instanceof Error ? e.message : "No se pudieron analizar los videos." };
    }
    return NextResponse.json({ ...lectura, videos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer Meta." }, { status: 500 });
  }
}
