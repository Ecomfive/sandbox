import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria";
import { guardarConexionQbo, intercambiarCodigo } from "@/lib/quickbooks/cliente";
import { COOKIE_STATE, leerConfigQbo, leerRealmId, verificarState } from "@/lib/quickbooks/oauth";
import { administraIntegraciones } from "@/lib/quickbooks/permiso";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Retorno de la autorización de Intuit: verifica la sesión, el permiso y el `state` (firma, vencimiento, persona y la
 * cookie de este navegador), cambia el código por los tokens y los guarda cifrados con el `realmId`. Nunca devuelve tokens.
 */
export async function GET(req: NextRequest) {
  const volver = (estado: string) => {
    const r = NextResponse.redirect(new URL(`/cierre-mes/quickbooks?qbo=${estado}`, req.url));
    r.cookies.set(COOKIE_STATE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/quickbooks", maxAge: 0 });
    return r;
  };
  const usuario = await getUsuarioActual();
  if (!usuario) return NextResponse.redirect(new URL("/login", req.url));
  if (!administraIntegraciones(usuario)) return new NextResponse("No autorizado", { status: 403 });
  const cfg = leerConfigQbo(process.env);
  if (!cfg) return volver("sin-variables");
  const p = req.nextUrl.searchParams;
  if (p.get("error")) return volver("cancelado");
  const v = verificarState(p.get("state"), { usuarioId: usuario.id, nonceCookie: req.cookies.get(COOKIE_STATE)?.value, ahora: Date.now() }, cfg.clave);
  if (!v.ok) return volver("state-invalido");
  const codigo = p.get("code");
  const realmId = leerRealmId(p.get("realmId"));
  if (!codigo || codigo.length > 500 || !realmId) return volver("sin-codigo");
  try {
    const tokens = await intercambiarCodigo(cfg, codigo);
    const g = await guardarConexionQbo(createServiceClient(), cfg, realmId, tokens, usuario.id);
    if (g.error) return volver("error");
  } catch {
    return volver("error");
  }
  await registrarAuditoria({ accion: "conectar_quickbooks", entidad: "qbo_conexion", detalle: `Compañía ${realmId} (${cfg.entorno})` });
  return volver("conectado");
}
