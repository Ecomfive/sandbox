import { NextResponse } from "next/server";
import { analizarPendientes } from "@/lib/meta-ads/analizar-videos";
import { refrescarAnalisisMeta, type ResultadoRefresco } from "@/lib/meta-ads/analisis-guardado";
import { estadoAnalisisAutomatico } from "@/lib/meta-ads/ajustes";
import { leerCuentasMeta } from "@/lib/meta-ads/leer-cuentas";
import { hoyEnPanama } from "@/lib/meta-ads/sincronizar";
import { esPeticionDeCron } from "@/lib/seguridad/cron";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * La lectura de las cuentas publicitarias de Meta (18 nov 2026): solo consulta Meta y guarda en la base, nunca cambia nada en Meta. Después, con el tiempo que quede, la IA ve los videos
 * con más gasto que todavía no tienen análisis (y, cuando ya no queda ninguno, vuelve a pedir solo el ángulo de los ya analizados con la regla nueva) (ángulo, promesa, gancho, estructura, llamado a la acción). Con `?solo=videos` no lee Meta y dedica todo el tiempo a los videos: Vercel lo corre cada 10 minutos (un video tarda de 20 a
 * 90 segundos, así que cada pasada hace de 3 a 8; si no hay pendientes, termina en un segundo y no cuesta nada). Si el análisis automático está en pausa (interruptor de Videos, `meta_ajustes`) no analiza nada. Ve todo el historial leído, de más a menos gasto, hasta ponerse al día. Solo lo acepta el cron de Vercel (`CRON_SECRET`).
 */
export async function GET(request: Request) {
  if (!esPeticionDeCron(request)) return new NextResponse("Unauthorized", { status: 401 });
  const inicio = Date.now();
  try {
    const supabase = createServiceClient();
    const soloVideos = new URL(request.url).searchParams.get("solo") === "videos";
    const lectura = soloVideos ? { lecturas: [], sinCuentas: false } : await leerCuentasMeta(supabase, { presupuestoMs: 120_000 });
    // El análisis del historial (24 nov 2026): después de leer Meta, se vuelve a calcular y, una vez al día, la IA lo interpreta. Las pantallas lo leen ya hecho. Con poco tiempo, la interpretación espera a la próxima pasada.
    const analisis: { pais: string; resultado: ResultadoRefresco }[] = [];
    if (!soloVideos) {
      const { data: cuentas } = await supabase.from("meta_cuentas").select("pais_id").eq("activa", true);
      const ids = [...new Set((cuentas ?? []).map((c) => c.pais_id as string))];
      const { data: paises } = ids.length ? await supabase.from("paises").select("id, nombre").in("id", ids) : { data: [] };
      for (const p of paises ?? []) {
        analisis.push({ pais: String(p.nombre), resultado: await refrescarAnalisisMeta(supabase, { paisId: p.id as string, paisNombre: String(p.nombre), hoy: hoyEnPanama(), interpretar: Date.now() - inicio < 90_000 }) });
      }
    }
    let videos: Awaited<ReturnType<typeof analizarPendientes>> | { error: string } | { pausado: true } | null = null;
    try {
      // Pausado desde el botón de Videos (21 nov 2026: la cuenta de Gemini quedó suspendida): se lee Meta como siempre, pero no se llama a la IA.
      if (!(await estadoAnalisisAutomatico(supabase)).activo) videos = { pausado: true };
      else videos = await analizarPendientes(supabase, { limiteMs: 285_000 - (Date.now() - inicio), max: soloVideos ? 8 : 3, quien: "Lectura automática" });
    } catch (e) {
      videos = { error: e instanceof Error ? e.message : "No se pudieron analizar los videos." };
    }
    return NextResponse.json({ ...lectura, analisis, videos });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "No se pudo leer Meta." }, { status: 500 });
  }
}
