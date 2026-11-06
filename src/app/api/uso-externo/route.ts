import { NextResponse } from "next/server";
import { getUsuarioIdSesion } from "@/lib/auth";
import { revisarLatidoExterno } from "@/lib/rendimiento/uso-externo";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Lo que manda la extensión «Ecomfive · Uso» (migración 0240), con la sesión de la persona: un minuto activo en una plataforma, o la señal de que la extensión
 * está puesta. Solo se aceptan pedidos de una extensión, y el minuto lo pone el servidor: nadie puede anotar tiempo pasado ni a nombre de otro.
 */
export async function POST(request: Request) {
  if (!request.headers.get("origin")?.startsWith("chrome-extension://")) return NextResponse.json({ error: "No permitido." }, { status: 403 });
  const usuarioId = await getUsuarioIdSesion();
  if (!usuarioId) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const latido = revisarLatidoExterno(await request.json().catch(() => null));
  if (!latido) return NextResponse.json({ error: "Datos no válidos." }, { status: 400 });

  const supabase = createServiceClient();
  const ahora = new Date();
  const { error } = await supabase.from("uso_externo_extensiones").upsert({ usuario_id: usuarioId, version: latido.version, visto_en: ahora.toISOString() }, { onConflict: "usuario_id" });
  if (error) return NextResponse.json({ error: "No se pudo guardar." }, { status: 503 });
  if (latido.tipo === "minuto") {
    ahora.setUTCSeconds(0, 0);
    const { error: e } = await supabase
      .from("uso_externo_minutos")
      .upsert({ usuario_id: usuarioId, minuto: ahora.toISOString(), plataforma: latido.plataforma, seccion: latido.seccion }, { onConflict: "usuario_id,minuto", ignoreDuplicates: true });
    if (e) return NextResponse.json({ error: "No se pudo guardar." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
