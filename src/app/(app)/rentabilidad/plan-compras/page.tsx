import Link from "next/link";
import { paisDeOperacionActual } from "@/lib/finanzas/pais-servidor";
import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { claseAccionAF4 } from "@/components/af4/estilos-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { anilloFoco } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { hoyPanama, mesCorto, rangoMeses } from "@/lib/af4/fecha";
import { dineroKpi, entero } from "@/lib/af4/formato";
import type { ColumnaAF4, FilaAF4 } from "@/lib/af4/tabla-financiera";
import { requireModulo } from "@/lib/auth";
import { cargarPlanCompras } from "@/lib/finanzas/cargar-plan-compras";
import { createServiceClient } from "@/lib/supabase/server";
import { AjustesPlan, LlevarAlPresupuesto, LotePorProducto } from "./ajustes-plan";
import { TablaOrdenesPlan, TablaProductosPlan } from "./tablas-plan";

export const metadata = { title: "Plan de compras" };

export const dynamic = "force-dynamic";

const TITULO = "Plan de compras";

export default async function PlanComprasPage() {
  const usuario = await requireModulo("rentabilidad");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo={TITULO} />;
  const pais = await paisDeOperacionActual(usuario.paisesPermitidos);
  if (!pais) return <SoloTodaLaEmpresa titulo={TITULO} />;
  const escribe = !usuario.modulosSoloLectura.includes("rentabilidad");
  const hoy = hoyPanama();
  const datos = await cargarPlanCompras(createServiceClient(), hoy, pais);
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo={TITULO} imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo armar el plan">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const { plan, demanda, config, ajustes } = datos;
  const atrasadas = plan.ordenes.filter((o) => o.atrasada);
  const totalMonto = plan.ordenes.reduce((a, o) => a + (o.monto ?? 0), 0);
  const conQuiebre = plan.productos.filter((p) => p.quiebre !== null).length;
  const primeros = plan.meses.slice(0, 3).reduce((a, m) => a + m.pagos, 0);

  const columnas: ColumnaAF4[] = plan.meses.map((m) => ({ clave: m.mes, etiqueta: mesCorto(m.mes) }));
  const filas: FilaAF4[] = [
    { clave: "pedido", etiqueta: "Órdenes que se piden", tipo: "seccion", valores: plan.meses.map((m) => m.pedido) },
    { clave: "anticipos", etiqueta: `Anticipos (${config.anticipoPct} %)`, tipo: "detalle", valores: plan.meses.map((m) => m.anticipos), padre: "pagos" },
    { clave: "saldos", etiqueta: config.saldoAl === "envio" ? "Saldos al envío" : "Saldos a la llegada", tipo: "detalle", valores: plan.meses.map((m) => m.saldos), padre: "pagos" },
    { clave: "pagos", etiqueta: "Pagos del plan", tipo: "subtotal", valores: plan.meses.map((m) => m.pagos) },
    { clave: "comprometido", etiqueta: "Ya comprometido (compras abiertas)", tipo: "seccion", valores: plan.meses.map((m) => datos.comprometido.get(m.mes) ?? 0) },
    { clave: "total", etiqueta: "Salida de caja por compras", tipo: "total", valores: plan.meses.map((m) => m.pagos + (datos.comprometido.get(m.mes) ?? 0)) },
    { clave: "presupuesto", etiqueta: "Presupuesto de compras guardado", tipo: "saldo", valores: plan.meses.map((m) => datos.presupuestos.get(m.mes) ?? null) },
  ];
  const lotes = Object.fromEntries(datos.lotes);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo={TITULO}
        datosHasta={hoy}
        acciones={
          <Link href="/rentabilidad/reorden" className={`${claseAccionAF4} ${anilloFoco}`}>
            Punto de reorden
          </Link>
        }
      />
      <FilaKpiAF4>
        <KpiAF4 titulo={`Órdenes en ${config.meses} meses`} destacado valor={dineroKpi(totalMonto)} subtexto={`${entero(plan.ordenes.length)} órdenes · ${entero(plan.productos.filter((p) => p.ordenes).length)} productos`} />
        <KpiAF4 titulo="Pedir ya (atrasadas)" tono={atrasadas.length ? "destructive" : "success"} valor={entero(atrasadas.length)} subtexto={dineroKpi(atrasadas.reduce((a, o) => a + (o.monto ?? 0), 0))} />
        <KpiAF4 titulo="Pagos en 3 meses" valor={dineroKpi(primeros)} subtexto={`Anticipo ${config.anticipoPct} % · saldo ${config.saldoAl === "envio" ? "al envío" : "a la llegada"}`} />
        <KpiAF4 titulo="Productos que se quedan sin stock" tono={conQuiebre ? "warning" : "success"} valor={entero(conQuiebre)} subtexto="Sin órdenes nuevas" />
        <KpiAF4 titulo="Fuente de la demanda" tono={demanda.fuente === "pronostico" ? "success" : "warning"} valor={demanda.fuente === "pronostico" ? "Pronóstico" : "Ritmo de venta"} subtexto={demanda.fuente === "pronostico" ? "Planificación × mezcla de 90 días" : "90 días con tendencia de 30"} />
        <KpiAF4 titulo="Sin costo" tono={plan.sinCosto ? "warning" : "neutral"} valor={entero(plan.sinCosto)} subtexto="Órdenes sin monto" />
      </FilaKpiAF4>

      <TablaFinanciera
        id="plan-calendario"
        titulo="Calendario de pagos"
        detalle={`USD · ${rangoMeses(demanda.meses)}${plan.pagosDespues > 0 ? ` · después del plan ${dineroKpi(plan.pagosDespues)}` : ""}`}
        columnas={columnas}
        filas={filas}
        ariaLabel="Calendario de órdenes y pagos del plan de compras por mes"
        accion={escribe && plan.meses.some((m) => m.pagos > 0) ? <LlevarAlPresupuesto meses={plan.meses.length} /> : undefined}
      />

      <MarcoAF4 id="plan-ordenes" titulo="Órdenes" detalle={demanda.nota} sinRelleno>
        <TablaOrdenesPlan ordenes={plan.ordenes} />
      </MarcoAF4>

      <MarcoAF4 id="plan-productos" titulo="Productos" detalle={`Seguridad ${ajustes.seguridadDias} días · cobertura ${ajustes.coberturaDias} días por orden`} sinRelleno>
        <TablaProductosPlan productos={plan.productos} />
      </MarcoAF4>

      {escribe && (
        <MarcoAF4 id="plan-ajustes" titulo="Ajustes del plan">
          <div className="flex flex-col gap-4">
            <AjustesPlan config={config} />
            {datos.sinMigracion ? (
              <p className="flex items-center gap-1.5 text-xs">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-warning" />
                Falta correr la migración 0948 para el lote por producto.
              </p>
            ) : (
              <LotePorProducto productos={datos.productos} lotes={lotes} />
            )}
          </div>
        </MarcoAF4>
      )}
    </Pagina>
  );
}
