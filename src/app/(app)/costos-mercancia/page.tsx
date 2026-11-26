import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { fechaCorta, inicioDeMes } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { esAdministrador } from "@/lib/permisos/acceso";
import { cargarHojaCostos } from "@/lib/finanzas/cargar-hoja-costos";
import { VARIACION_AVISO } from "@/lib/finanzas/hoja-costos";
import { createServiceClient } from "@/lib/supabase/server";
import { obtenerOpcionesSkuMaestro } from "@/lib/wms/skus-maestros";
import { HojaCostos } from "./hoja-costos";
import { TraerCompras } from "./traer-compras";

export const metadata = { title: "Costos de producto" };

export const dynamic = "force-dynamic";

/**
 * Costos de producto (0992): la hoja única de costos de Panamá. Una fila por compra que llegó (En Bodega o Completado),
 * agrupada por el código único del producto; de aquí toman el costo la ficha de Inventario, la reportería de pedidos y
 * Pedidos Dropi.
 */
export default async function CostosProductoPage() {
  const usuario = await requireModulo("costos-mercancia");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("costos-mercancia");
  const supabase = createServiceClient();
  const [r, opciones] = await Promise.all([cargarHojaCostos(supabase), puedeEscribir ? obtenerOpcionesSkuMaestro(supabase) : Promise.resolve([])]);
  if ("error" in r) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Costos de producto" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer la hoja de costos">{r.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const { filas, resumen, sinCosto, ultimoCerrado } = r;
  const productos = resumen.size;
  const subieron = [...resumen.values()].filter((p) => p.compras > 1 && (p.variacion ?? 0) >= VARIACION_AVISO).length;
  const ultima = filas.map((f) => f.llegada).filter((x): x is string => !!x).sort().at(-1);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Costos de producto" datosHasta={ultima ? inicioDeMes(ultima) : null} filtros={puedeEscribir ? <TraerCompras /> : undefined} imprimir={false} />
      <FilaKpiAF4>
        <KpiAF4 titulo="Productos con costo" valor={entero(productos)} subtexto={ultimoCerrado ? `Panamá · cerrado hasta ${ultimoCerrado.slice(0, 7)}` : "Panamá"} />
        <KpiAF4 titulo="Compras en la hoja" valor={entero(filas.length)} subtexto={ultima ? `Última llegada ${fechaCorta(ultima)}` : undefined} />
        <KpiAF4 titulo="Con stock y sin costo" tono={sinCosto.length ? "destructive" : "neutral"} valor={entero(sinCosto.length)} subtexto="se marcan abajo" />
        <KpiAF4 titulo={`Última compra ${VARIACION_AVISO} % más cara`} tono={subieron ? "warning" : "neutral"} valor={entero(subieron)} subtexto="que su promedio" />
      </FilaKpiAF4>
      <HojaCostos filas={filas} resumen={Object.fromEntries(resumen)} sinCosto={sinCosto} opciones={opciones} puedeEscribir={puedeEscribir} esAdmin={esAdministrador(usuario)} />
    </Pagina>
  );
}
