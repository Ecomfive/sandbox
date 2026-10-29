import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { esAdministrador } from "@/lib/permisos/acceso";
import { claves360, urlBase360 } from "@/lib/whatsapp/proveedor";

export const dynamic = "force-dynamic";

const TIPOS = new Set(["history", "smb_app_state_sync"]);

/**
 * Pide a Meta (por 360dialog) el historial de los chats del celular de cada número en coexistencia (29 oct 2026): `POST /smb_app_data` con
 * `sync_type` «history» (mensajes de los últimos 180 días) o «smb_app_state_sync» (contactos). Meta lo acepta **una sola vez y dentro de las
 * 24 h** desde que se conectó el número, y lo manda al webhook, que lo guarda tal cual (`historial-meta.ts`). Solo administradores y desde el
 * mismo sitio; con `variable`, solo ese número. Devuelve lo que contestó 360dialog por número, sin reintentar.
 */
export async function POST(request: Request) {
  const origen = request.headers.get("origin");
  if (!origen || new URL(origen).host !== request.headers.get("host")) return NextResponse.json({ error: "Origen no permitido." }, { status: 403 });
  const u = await getUsuarioActual();
  if (!u || !esAdministrador(u)) return NextResponse.json({ error: "Solo quien administra el sistema." }, { status: 403 });
  const cuerpo = (await request.json().catch(() => ({}))) as { tipo?: unknown; variable?: unknown };
  const tipo = typeof cuerpo.tipo === "string" && TIPOS.has(cuerpo.tipo) ? cuerpo.tipo : "history";
  const claves = claves360().filter((c) => typeof cuerpo.variable !== "string" || c.variable === cuerpo.variable);
  if (!claves.length) return NextResponse.json({ error: "No hay claves de 360dialog para ese número." }, { status: 400 });

  const resultados: { variable: string; estado: number; respuesta: string }[] = [];
  for (const { variable, config } of claves) {
    try {
      const r = await fetch(`${urlBase360(config)}/smb_app_data`, {
        method: "POST",
        headers: { "D360-API-KEY": config.clave, "Content-Type": "application/json" },
        body: JSON.stringify({ messaging_product: "whatsapp", sync_type: tipo }),
        signal: AbortSignal.timeout(20_000),
      });
      resultados.push({ variable, estado: r.status, respuesta: (await r.text()).slice(0, 600) });
    } catch (e) {
      resultados.push({ variable, estado: 0, respuesta: e instanceof Error ? e.message : String(e) });
    }
  }
  await registrarAuditoria({ accion: "pedir_historial_whatsapp", entidad: "whatsapp_numeros", detalle: `${tipo}: ${resultados.map((r) => `${r.variable} ${r.estado}`).join(", ")}` });
  return NextResponse.json({ tipo, resultados });
}
