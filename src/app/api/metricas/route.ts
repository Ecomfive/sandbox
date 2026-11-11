import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { leerMedicion } from "@/lib/rendimiento/metricas";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Mejora 32: guarda las mediciones de tiempo de carga que manda el navegador (Web Vitals). Solo con sesión; no se guarda quién
 * fue, solo la ruta, la métrica y el valor. Hasta 10 por envío. De vez en cuando borra lo de más de 30 días.
 */
export async function POST(request: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario) return new NextResponse(null, { status: 204 });
  let cuerpo: unknown;
  try {
    cuerpo = JSON.parse((await request.text()).slice(0, 8_000));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const filas = (Array.isArray(cuerpo) ? cuerpo : [cuerpo]).slice(0, 10).map(leerMedicion).filter((x) => x !== null);
  if (!filas.length) return new NextResponse(null, { status: 204 });
  const db = createServiceClient();
  await db.from("app_metricas").insert(filas);
  if (Math.random() < 0.01) await db.from("app_metricas").delete().lt("creado_en", new Date(Date.now() - 30 * 86_400_000).toISOString());
  return new NextResponse(null, { status: 204 });
}
