import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { InventarioIcon } from "@/lib/nav-icons";
import { createServiceClient } from "@/lib/supabase/server";
import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { ImportarConteo } from "./importar-conteo";
import { SolicitudesAjuste, type SolicitudAjuste } from "./solicitudes-ajuste";

export const metadata = { title: "Importar conteo" };

export const dynamic = "force-dynamic";
// Un conteo grande son varios lotes de 400 ajustes.
export const maxDuration = 60;

export default async function ImportarConteoPage() {
  const usuario = await requireModulo("rentabilidad");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Inventario" />;
  const puede = usuario.modulos.includes("inventario") && !usuario.modulosSoloLectura.includes("inventario");
  const esAdmin = usuario.modulos.includes("usuarios") && !usuario.modulosSoloLectura.includes("usuarios");
  const supabase = createServiceClient();
  const [pend, hechas] = await Promise.all([
    supabase.from("fin_ajustes_inventario").select("id, archivo, soporte, diferencias, estado, solicitado_por, solicitado_en, resuelto_por, motivo_rechazo").eq("estado", "pendiente").order("solicitado_en", { ascending: false }).limit(50),
    supabase.from("fin_ajustes_inventario").select("id, archivo, soporte, diferencias, estado, solicitado_por, solicitado_en, resuelto_por, motivo_rechazo").neq("estado", "pendiente").order("resuelto_en", { ascending: false }).limit(10),
  ]);
  const filas = [...(pend.data ?? []), ...(hechas.data ?? [])];
  const ids = [...new Set(filas.flatMap((f) => [f.solicitado_por, f.resuelto_por]).filter((x): x is string => !!x))];
  const { data: personas } = ids.length ? await supabase.from("perfiles").select("id, nombre").in("id", ids) : { data: [] };
  const nombre = new Map((personas ?? []).map((p) => [p.id as string, (p.nombre as string) || "—"]));
  const solicitudes: SolicitudAjuste[] = filas.map((f) => ({
    id: f.id as string,
    archivo: f.archivo as string,
    soporte: f.soporte as string,
    diferencias: (Array.isArray(f.diferencias) ? f.diferencias : []) as SolicitudAjuste["diferencias"],
    estado: f.estado as SolicitudAjuste["estado"],
    solicitadoPor: nombre.get(f.solicitado_por as string) ?? "—",
    solicitadoEn: f.solicitado_en as string,
    resueltoPor: f.resuelto_por ? (nombre.get(f.resuelto_por as string) ?? "—") : null,
    motivoRechazo: (f.motivo_rechazo as string | null) ?? null,
    propia: f.solicitado_por === usuario.id,
  }));
  return (
    <Pagina ancho="angosta" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Importar conteo de inventario" icono={InventarioIcon} />
      {puede ? <ImportarConteo /> : <EstadoVacioAF4 titulo="Sin permiso para ajustar el inventario">Hace falta poder modificar Inventario.</EstadoVacioAF4>}
      {pend.error ? (
        <EstadoVacioAF4 titulo="Falta la aprobación de ajustes">Correr la migración 0990 en Supabase.</EstadoVacioAF4>
      ) : (
        <SolicitudesAjuste solicitudes={solicitudes} esAdmin={esAdmin} puedeEscribir={puede} />
      )}
    </Pagina>
  );
}
