import { NextResponse, type NextRequest } from "next/server";
import { registrarAuditoria } from "@/lib/auditoria";
import { getUsuarioActual } from "@/lib/auth";
import { hoyPanama, mesLargo } from "@/lib/af4/fecha";
import { armarPaqueteBancario, empresaDelPaquete, leerSnapshot, type SnapshotPaquete } from "@/lib/finanzas/cargar-paquete-bancario";
import { libroPaqueteBancario } from "@/lib/finanzas/excel-paquete-bancario";
import { cartaPredeterminada } from "@/lib/finanzas/paquete-bancario";
import { createServiceClient } from "@/lib/supabase/server";
import { leerParametrosPaquete, puedeVerPaquete } from "@/app/(app)/panel-financiero/paquete-bancario/parametros";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * El paquete bancario en Excel, una hoja por sección con fórmulas. `?version=<id>` baja una versión guardada tal como
 * era; si no, `?corte=AAAA-MM&entidad=PA&secciones=a,b` lo arma con los datos de hoy. Solo para quien abre el Panel
 * financiero y ve toda la empresa.
 */
export async function GET(req: NextRequest) {
  const usuario = await getUsuarioActual();
  if (!usuario || !usuario.modulos.includes("panel-financiero") || !(await puedeVerPaquete())) {
    return new NextResponse("No autorizado", { status: 403 });
  }
  const supabase = createServiceClient();
  const q = req.nextUrl.searchParams;
  let snap: SnapshotPaquete | null = null;
  const version = q.get("version");
  if (version) {
    if (!UUID.test(version)) return new NextResponse("Versión inválida", { status: 400 });
    const { data, error } = await supabase.from("fin_paquetes_bancarios").select("contenido").eq("id", version).maybeSingle();
    if (error) return new NextResponse("Falta correr la migración 0940.", { status: 500 });
    snap = data ? leerSnapshot(data.contenido) : null;
    if (!snap) return new NextResponse("No existe esa versión", { status: 404 });
  } else {
    const p = await leerParametrosPaquete(supabase, usuario, { corte: q.get("corte") ?? undefined, entidad: q.get("entidad") ?? undefined, secciones: q.get("secciones") ?? undefined });
    const empresa = await empresaDelPaquete(supabase);
    snap = await armarPaqueteBancario(supabase, {
      corte: p.corte,
      entidad: p.entidad,
      secciones: p.secciones,
      carta: cartaPredeterminada(empresa.nombre, mesLargo(p.corte), p.entidad?.razon_social ?? "consolidado"),
    });
  }
  const buffer = libroPaqueteBancario(snap);
  await registrarAuditoria({ accion: "descargar_paquete_bancario", entidad: "fin_paquetes_bancarios", entidadId: version ?? undefined, detalle: `Corte ${snap.corte.slice(0, 7)} · ${snap.entidad}` });
  const nombre = `Paquete-bancario-${snap.entidad}-${snap.corte.slice(0, 7)}-${hoyPanama()}.xlsx`.replace(/[^\w.-]+/g, "_");
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${nombre}"`,
    },
  });
}
