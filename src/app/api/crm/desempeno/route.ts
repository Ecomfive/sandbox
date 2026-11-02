import { NextResponse, type NextRequest } from "next/server";
import { getUsuarioActual } from "@/lib/auth";
import { leerDesempeno } from "@/app/(app)/crm-dropshippers/desempeno-datos";

export const dynamic = "force-dynamic";

/**
 * «Desempeño en la plataforma» de la ficha de un dropshipper: ?d=<id>&desde=AAAA-MM-DD&hasta=AAAA-MM-DD. Es una ruta y no una
 * acción del servidor para no esperar en fila detrás de las otras lecturas de la ficha. Solo lectura; basta poder abrir el CRM.
 */
export async function GET(request: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("crm-dropshippers")) return NextResponse.json({ error: "No tienes acceso." }, { status: 403 });
  const q = request.nextUrl.searchParams;
  const r = await leerDesempeno(q.get("d") ?? "", q.get("desde") ?? "", q.get("hasta") ?? "");
  return NextResponse.json(r, { status: "error" in r ? 400 : 200, headers: { "Cache-Control": "no-store" } });
}
