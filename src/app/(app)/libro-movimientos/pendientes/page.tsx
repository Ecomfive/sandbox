import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { dineroKpi, entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarPendientes } from "@/lib/finanzas/cargar-pendientes";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";
import { TablaPendientes } from "./tabla-pendientes";

export const metadata = { title: "Por clasificar" };

export const dynamic = "force-dynamic";

export default async function PendientesPage() {
  const usuario = await requireModulo("libro-movimientos");
  const supabase = createServiceClient();
  const permitidas = await cargarTiendasPermitidas();
  const [datos, actualizado] = await Promise.all([cargarPendientes(supabase, permitidas), ultimaActualizacionLibro(supabase)]);
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Por clasificar" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer el libro">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const { filas, tiendas, tipos } = datos;
  const conSugerencia = filas.filter((f) => f.sugOrigen !== "Sin sugerencia");
  const monto = filas.reduce((a, f) => a + f.monto, 0);
  const altas = filas.filter((f) => f.nivel === "Alta").length;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Por clasificar" actualizado={actualizado} imprimir={false} />
      <FilaKpiAF4>
        <KpiAF4 titulo="Por clasificar" tono={filas.length ? "warning" : "success"} valor={entero(filas.length)} subtexto={`${dineroKpi(monto)} · ${permitidas ? "tus tiendas" : "todo el libro"}`} />
        <KpiAF4 titulo="Con sugerencia" valor={entero(conSugerencia.length)} subtexto={dineroKpi(conSugerencia.reduce((a, f) => a + f.monto, 0))} />
        <KpiAF4 titulo="Confianza alta" tono={altas ? "success" : "neutral"} valor={entero(altas)} subtexto="80 % o más" />
        <KpiAF4 titulo="Sin tienda" tono={filas.some((f) => f.falta !== "Tipo") ? "warning" : "neutral"} valor={entero(filas.filter((f) => f.falta !== "Tipo").length)} />
        <KpiAF4 titulo="Sin tipo" tono={filas.some((f) => f.falta !== "Tienda") ? "warning" : "neutral"} valor={entero(filas.filter((f) => f.falta !== "Tienda").length)} />
      </FilaKpiAF4>
      <TablaPendientes filas={filas} tiendas={tiendas} tipos={tipos} puedeEscribir={!usuario.modulosSoloLectura.includes("libro-movimientos")} />
    </Pagina>
  );
}
