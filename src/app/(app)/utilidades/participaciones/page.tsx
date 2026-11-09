import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarUtilidades } from "@/lib/finanzas/cargar-utilidades";
import { TablaParticipaciones, type FilaParticipacion } from "./tabla-participaciones";
import { hoyPanama } from "@/lib/af4/fecha";

export const metadata = { title: "Participaciones" };

export const dynamic = "force-dynamic";


export default async function ParticipacionesPage() {
  const usuario = await requireModulo("utilidades");
  const datos = await cargarUtilidades(createServiceClient());
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Participaciones" oculto />
        <EstadoVacioAF4 titulo="No se pudo leer la distribución de utilidades">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const hoy = `${hoyPanama().slice(0, 7)}-01`;
  const socio = new Map(datos.socios.map((s) => [s.id, s.nombre]));
  const tienda = new Map(datos.unidades.map((u) => [u.id, u.nombre]));
  // Vigente: la fila que manda hoy para su socio y su tienda (la más reciente que ya empezó) y las que todavía no
  // empiezan (el próximo cambio). Las demás son historia.
  const ultimaPorPar = new Map<string, { id: string; desde: string }>();
  for (const p of datos.participaciones) {
    if (p.vigente_desde > hoy) continue;
    const par = `${p.socio_id}|${p.unidad_id}`;
    const previa = ultimaPorPar.get(par);
    if (!previa || p.vigente_desde > previa.desde) ultimaPorPar.set(par, { id: p.id, desde: p.vigente_desde });
  }
  const vigentes = new Set([...ultimaPorPar.values()].map((v) => v.id));
  for (const p of datos.participaciones) if (p.vigente_desde > hoy) vigentes.add(p.id);
  const filas: FilaParticipacion[] = datos.participaciones.map((p) => ({
    id: p.id,
    socio: socio.get(p.socio_id) ?? "—",
    tienda: tienda.get(p.unidad_id) ?? "—",
    porcentaje: p.porcentaje,
    desde: p.vigente_desde,
    vigente: vigentes.has(p.id),
  }));
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Participaciones" imprimir={false} />
      <TablaParticipaciones
        filas={filas}
        socios={datos.socios.filter((s) => s.activo).map((s) => ({ id: s.id, nombre: s.nombre }))}
        tiendas={datos.unidades.filter((u) => u.clase === "tienda").map((u) => ({ id: u.id, nombre: u.nombre }))}
        mesSugerido={hoy.slice(0, 7)}
        puedeEscribir={!usuario.modulosSoloLectura.includes("utilidades")}
      />
    </Pagina>
  );
}
