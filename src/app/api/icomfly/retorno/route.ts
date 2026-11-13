import { NextResponse, type NextRequest } from "next/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { probarIcomfly, terminarAutorizacion } from "@/lib/tienda/icomfly";
import { claveIcomfly, COOKIE_ICOMFLY, verificarStateIcomfly } from "@/lib/tienda/icomfly-oauth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Retorno de la autorización de iComfly (13 nov 2026): verifica la sesión, el permiso y el `state` (firma, vencimiento, persona y la cookie de este navegador),
 * cambia el código por los tokens, los guarda cifrados y prueba la conexión. Nunca devuelve tokens.
 */
export async function GET(req: NextRequest) {
  const volver = (estado: string, motivo?: string) => {
    const r = NextResponse.redirect(new URL(`/tienda-tiendas?icomfly=${estado}${motivo ? `&motivo=${encodeURIComponent(motivo.slice(0, 160))}` : ""}`, req.url));
    r.cookies.set(COOKIE_ICOMFLY, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/icomfly", maxAge: 0 });
    return r;
  };
  const usuario = await getUsuarioActual();
  if (!usuario) return NextResponse.redirect(new URL("/login", req.url));
  if (!esAdministrador(usuario)) return new NextResponse("No autorizado", { status: 403 });
  const clave = claveIcomfly();
  if (!clave) return volver("sin-clave");
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return volver("cancelado");
  const v = verificarStateIcomfly(p.get("state"), { usuarioId: usuario.id, nonceCookie: req.cookies.get(COOKIE_ICOMFLY)?.value, ahora: Date.now() }, clave);
  if (!v.ok) return volver("error", v.motivo);
  const codigo = p.get("code");
  if (!codigo || codigo.length > 2000) return volver("error", "iComfly no devolvió el código.");
  const supabase = createServiceClient();
  const t = await terminarAutorizacion(supabase, v.tiendaId, codigo, usuario.id);
  if (t.error) return volver("error", t.error);
  const prueba = await probarIcomfly(supabase, v.tiendaId);
  await registrarAuditoria({ accion: "conectar_icomfly", entidad: "tiendas", entidadId: v.tiendaId, detalle: "error" in prueba ? `Conectada; la prueba falló: ${prueba.error}` : `Conectada: ${prueba.resumen}` });
  return volver("conectado");
}
