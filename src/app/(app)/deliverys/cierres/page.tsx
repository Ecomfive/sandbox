import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { dineroKpi, entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarCierres } from "@/lib/deliverys/cargar";
import { createServiceClient } from "@/lib/supabase/server";
import { TablaCierres } from "../tabla-cierres";

export const metadata = { title: "Cierres de deliverys" };

export const dynamic = "force-dynamic";

const MODULO = "deliverys";

/** Todos los cierres semanales: los pendientes de cerrar o de pagar primero (los pagados, con el botón «Pagados»). */
export default async function CierresDeliverysPage() {
  const usuario = await requireModulo(MODULO);
  const puedeEscribir = !usuario.modulosSoloLectura.includes(MODULO);
  const r = await cargarCierres(createServiceClient());
  if ("error" in r) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Cierres de deliverys" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudieron leer los cierres">{r.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  // Lo que falta: cierres sin pagar (abiertos o cerrados) y su neto pendiente (lo que se le paga, sin lo que deben entregar).
  const pendientes = r.filas.filter((f) => f.estado !== "pagado");
  const abiertos = pendientes.filter((f) => f.estado === "abierto").length;
  const porPagar = pendientes.reduce((a, f) => a + Math.max(0, f.neto), 0);
  const porRendir = pendientes.reduce((a, f) => a + Math.max(0, -f.neto), 0);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Cierres de deliverys" />
      {r.filas.length > 0 && (
        <FilaKpiAF4>
          <KpiAF4 titulo="Sin pagar" destacado tono={pendientes.length ? "warning" : "success"} valor={entero(pendientes.length)} subtexto={`${entero(abiertos)} sin cerrar`} />
          <KpiAF4 titulo="Por pagar a repartidores" valor={dineroKpi(porPagar)} />
          <KpiAF4 titulo="Por rendir" tono={porRendir ? "warning" : "neutral"} valor={dineroKpi(porRendir)} subtexto="Efectivo que deben entregar" />
        </FilaKpiAF4>
      )}
      <TablaCierres filas={r.filas} todos puedeEscribir={puedeEscribir} />
    </Pagina>
  );
}
