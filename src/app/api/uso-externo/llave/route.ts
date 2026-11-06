import { NextResponse } from "next/server";
import { getUsuarioIdSesion } from "@/lib/auth";
import { crearLlaveUso } from "@/lib/rendimiento/llave-uso";

export const dynamic = "force-dynamic";

/** La llave de la extensión «Ecomfive · Uso», para quien tiene sesión. La pide su puente desde las páginas del sistema, donde sí está la sesión. */
export async function GET() {
  const usuarioId = await getUsuarioIdSesion();
  if (!usuarioId) return NextResponse.json({ error: "Sin sesión." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ llave: crearLlaveUso(usuarioId, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "") }, { headers: { "Cache-Control": "no-store" } });
}
