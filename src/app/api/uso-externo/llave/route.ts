import { NextResponse } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { crearLlaveUso, secretosLlaveUso } from "@/lib/rendimiento/llave-uso";

export const dynamic = "force-dynamic";

/** La llave de la extensión «Ecomfive · Uso», para quien tiene sesión. La pide su puente desde las páginas del sistema, donde sí está la sesión. Se firma con
 * `USO_EXTERNO_LLAVE_SECRETO` si está (auditoría de seguridad, 18 nov 2026). */
export async function GET() {
  // Solo para una persona del equipo con la cuenta activa: una suspendida o una cuenta del portal del proveedor no recibe llave.
  const usuarioId = (await getUsuarioActual())?.id ?? null;
  if (!usuarioId) return NextResponse.json({ error: "Sin sesión." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ llave: crearLlaveUso(usuarioId, secretosLlaveUso().firmar) }, { headers: { "Cache-Control": "no-store" } });
}
