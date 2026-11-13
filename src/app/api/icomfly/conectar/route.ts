import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { empezarAutorizacion } from "@/lib/tienda/icomfly";
import { claveIcomfly, COOKIE_ICOMFLY, firmarStateIcomfly, MINUTOS_STATE_ICOMFLY, nuevoNonceIcomfly } from "@/lib/tienda/icomfly-oauth";

export const dynamic = "force-dynamic";

/**
 * «Conectar iComfly» de una tienda (13 nov 2026): solo un administrador. Arma el `state` firmado (tienda + persona + número de una vez + vencimiento), deja el
 * número en una cookie httpOnly y manda a la pantalla de autorización de iComfly, donde la persona pega el token de la tienda y autoriza.
 */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario) return NextResponse.redirect(new URL("/login", req.url));
  if (!esAdministrador(usuario)) return new NextResponse("No autorizado", { status: 403 });
  const tiendaId = req.nextUrl.searchParams.get("tienda") ?? "";
  const volver = (estado: string) => NextResponse.redirect(new URL(`/tienda-tiendas?icomfly=${estado}`, req.url));
  if (!/^[0-9a-f-]{36}$/i.test(tiendaId)) return volver("tienda-invalida");
  const clave = claveIcomfly();
  if (!clave) return volver("sin-clave");
  const nonce = nuevoNonceIcomfly();
  const state = firmarStateIcomfly({ tiendaId, usuarioId: usuario.id, nonce, vence: Date.now() + MINUTOS_STATE_ICOMFLY * 60_000 }, clave);
  const r = await empezarAutorizacion(createServiceClient(), tiendaId, new URL("/api/icomfly/retorno", req.url).toString(), state);
  if ("error" in r) return NextResponse.redirect(new URL(`/tienda-tiendas?icomfly=error&motivo=${encodeURIComponent(r.error.slice(0, 160))}`, req.url));
  const res = NextResponse.redirect(r.url);
  res.cookies.set(COOKIE_ICOMFLY, nonce, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/icomfly", maxAge: MINUTOS_STATE_ICOMFLY * 60 });
  return res;
}
