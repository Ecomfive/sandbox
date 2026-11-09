import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarCostosVigentes, cargarMapeo } from "@/lib/finanzas/cargar-costos";
import { TablaMapeo } from "./tabla-mapeo";

export const metadata = { title: "Mapeo con Dropi" };

export const dynamic = "force-dynamic";

export default async function MapeoPage() {
  const usuario = await requireModulo("costos-mercancia");
  const supabase = createServiceClient();
  const vigentes = await cargarCostosVigentes(supabase);
  const mapeo = "error" in vigentes ? vigentes : await cargarMapeo(supabase, vigentes.filas);
  if ("error" in mapeo) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Mapeo con Dropi" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo armar el mapeo">{mapeo.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const { filas } = mapeo;
  const enProductos = filas.filter((f) => f.productos.length);
  const sinCostoEnProductos = enProductos.filter((f) => f.costoActual === null);
  const resolubles = sinCostoEnProductos.filter((f) => f.costoReal !== null);
  const distintos = enProductos.filter((f) => f.diferencia !== null && Math.abs(f.diferencia) >= 0.05);
  const puedeEscribir = !usuario.modulosSoloLectura.includes("costos-mercancia");
  const puedeAplicar = usuario.modulos.includes("productos") && !usuario.modulosSoloLectura.includes("productos");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Mapeo con Dropi" imprimir={false} />
      <KpiGroup titulo="Productos de Dropi">
        <KpiGrid compacta>
          <KpiCard compacta titulo="Mapeados" valor={entero(filas.filter((f) => f.estado === "Mapeado").length)} />
          <KpiCard compacta tono="warning" titulo="Sugeridos por confirmar" valor={entero(filas.filter((f) => f.estado === "Sugerido").length)} />
          <KpiCard compacta titulo="Sin costo real" valor={entero(filas.filter((f) => f.estado === "Sin costo").length)} />
          <KpiCard
            compacta
            tono={sinCostoEnProductos.length ? "warning" : "success"}
            titulo="Sin costo en Productos y márgenes"
            valor={entero(sinCostoEnProductos.length)}
            subtexto={`${entero(resolubles.length)} se pueden completar con su costo real`}
          />
          <KpiCard compacta tono={distintos.length ? "warning" : "neutral"} titulo="Costo distinto al real" valor={entero(distintos.length)} subtexto="5 centavos o más" />
        </KpiGrid>
      </KpiGroup>
      <TablaMapeo filas={filas} puedeEscribir={puedeEscribir} puedeAplicar={puedeAplicar} />
    </Pagina>
  );
}
