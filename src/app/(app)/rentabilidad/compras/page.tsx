import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { paisDeOperacionActual } from "@/lib/finanzas/pais-servidor";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { hoyPanama, mesMedio, sumarMeses } from "@/lib/af4/fecha";
import { dinero, dineroKpi, entero, fraccion } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarComprasCostos } from "@/lib/finanzas/cargar-compras-costos";
import { costoPuestoCompras, porPagarProveedores, presupuestoCompras, variacionCostos } from "@/lib/finanzas/compras-costos";
import { createServiceClient } from "@/lib/supabase/server";
import { AjusteInventario } from "../inventario/ajuste-inventario";
import { PresupuestoCompras } from "./presupuesto-compras";
import { TablaAnticipos, TablaCostoPuesto, TablaPorPagar, TablaVariacion } from "./tablas-compras-costos";

export const metadata = { title: "Compras y costos" };

export const dynamic = "force-dynamic";

const MESES_PRESUPUESTO = 6;

function Bloque({ id, titulo, accion, children }: { id: string; titulo: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id={id} className="text-sm font-semibold">
          {titulo}
        </h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

export default async function ComprasCostosPage() {
  const usuario = await requireModulo("rentabilidad");
  // Inventario, compras y capital de trabajo son de toda la empresa: con tiendas limitadas no se muestran.
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Compras y costos" />;
  const escribe = usuario.modulos.includes("rentabilidad") && !usuario.modulosSoloLectura.includes("rentabilidad");
  const pais = await paisDeOperacionActual(usuario.paisesPermitidos);
  if (!pais) return <SoloTodaLaEmpresa titulo="Compras y costos" />;
  const hoy = hoyPanama();
  const datos = await cargarComprasCostos(createServiceClient(), hoy, pais);
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Compras y costos" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudieron leer las compras">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const mesHoy = `${hoy.slice(0, 7)}-01`;
  const meses = Array.from({ length: MESES_PRESUPUESTO }, (_, i) => sumarMeses(mesHoy, i));
  const porPagar = porPagarProveedores(datos.compras, datos.gastos, hoy);
  const presupuesto = presupuestoCompras(meses, datos.presupuestos, porPagar, hoy);
  const costos = costoPuestoCompras(datos.compras, datos.items, datos.gastos, datos.vigente, datos.nombres);
  const variacion = variacionCostos(datos.lotes, datos.ajustes.alertaCosto);
  const totalPorPagar = porPagar.reduce((a, p) => a + p.monto, 0);
  const vencido = porPagar.filter((p) => p.vencido).reduce((a, p) => a + p.monto, 0);
  const proximos30 = porPagar.filter((p) => p.fecha && p.fecha <= sumarDias30(hoy)).reduce((a, p) => a + p.monto, 0);
  const anticipos = datos.anticipos.reduce((a, x) => a + x.anticipo, 0);
  const alertas = variacion.filter((v) => v.alerta).length;
  const delMes = presupuesto[0];

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Compras y costos" />
      <FilaKpiAF4>
        <KpiAF4
          titulo="Por pagar a proveedores"
          destacado
          tono={vencido > 0 ? "warning" : "neutral"}
          valor={dineroKpi(totalPorPagar)}
          subtexto={`${dinero(proximos30)} en 30 días${vencido > 0 ? ` · ${dinero(vencido)} con fecha pasada` : ""}`}
        />
        <KpiAF4 titulo="Anticipos a proveedores" valor={dineroKpi(anticipos)} subtexto={`${entero(datos.anticipos.length)} compras pagadas en camino`} />
        <KpiAF4
          titulo={`Presupuesto de ${mesMedio(mesHoy)}`}
          tono={delMes.disponible !== null && delMes.disponible < 0 ? "destructive" : "neutral"}
          valor={delMes.disponible === null ? "Sin presupuesto" : dineroKpi(delMes.disponible)}
          subtexto={delMes.presupuesto === null ? `${dinero(delMes.comprometido)} comprometido` : `disponible de ${dinero(delMes.presupuesto)}`}
        />
        <KpiAF4
          titulo={`Costo que subió más de ${fraccion(datos.ajustes.alertaCosto, { decimales: 0 })}`}
          tono={alertas ? "warning" : "success"}
          valor={entero(alertas)}
          subtexto="productos, último lote contra el anterior"
        />
      </FilaKpiAF4>
      {datos.sinMigracion && <EstadoVacioAF4 titulo="Falta la migración 0935">Sin ella no se cargan gastos de importación, presupuesto de compras ni anticipos.</EstadoVacioAF4>}

      <Bloque id="titulo-presupuesto" titulo="Presupuesto de compras">
        <PresupuestoCompras meses={presupuesto} puedeEditar={escribe && !datos.sinMigracion} />
      </Bloque>

      <Bloque id="titulo-por-pagar" titulo="Cuentas por pagar a proveedores">
        <TablaPorPagar filas={porPagar} />
      </Bloque>

      <Bloque id="titulo-anticipos" titulo="Anticipos a proveedores">
        <TablaAnticipos filas={datos.anticipos} />
      </Bloque>

      <Bloque id="titulo-costo-puesto" titulo="Costo puesto en bodega">
        <TablaCostoPuesto filas={costos} gastos={datos.gastos} umbral={datos.ajustes.alertaCosto} puedeEditar={escribe && !datos.sinMigracion} />
      </Bloque>

      <Bloque
        id="titulo-variacion"
        titulo="Variación del costo entre lotes"
        accion={escribe ? <AjusteInventario clave="alertaCosto" valor={Math.round(datos.ajustes.alertaCosto * 1000) / 10} /> : undefined}
      >
        <TablaVariacion filas={variacion} />
      </Bloque>
    </Pagina>
  );
}

function sumarDias30(hoy: string): string {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 30);
  return d.toISOString().slice(0, 10);
}
