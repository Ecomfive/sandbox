import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { COOKIE_STATE, firmarState, leerConfigQbo, MINUTOS_STATE, nuevoNonce, urlAutorizacion } from "@/lib/quickbooks/oauth";
import { administraIntegraciones } from "@/lib/quickbooks/permiso";

export const dynamic = "force-dynamic";

/**
 * «Conectar QuickBooks»: solo quien puede modificar Usuarios y roles. Arma un `state` firmado (persona + número de una vez +
 * vencimiento), deja el número en una cookie httpOnly y manda a la pantalla de autorización de Intuit.
 */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario) return NextResponse.redirect(new URL("/login", req.url));
  if (!administraIntegraciones(usuario)) return new NextResponse("No autorizado", { status: 403 });
  const cfg = leerConfigQbo(process.env);
  if (!cfg) return NextResponse.redirect(new URL("/cierre-mes/quickbooks?qbo=sin-variables", req.url));
  const nonce = nuevoNonce();
  const state = firmarState({ usuarioId: usuario.id, nonce, vence: Date.now() + MINUTOS_STATE * 60_000 }, cfg.clave);
  const r = NextResponse.redirect(urlAutorizacion(cfg, state));
  r.cookies.set(COOKIE_STATE, nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/quickbooks", maxAge: MINUTOS_STATE * 60 });
  return r;
}
