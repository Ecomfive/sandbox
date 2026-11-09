import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaLineasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { KpiCard, KpiGrid, KpiGroup, type Tono } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { mesCorto, rangoMeses } from "@/lib/af4/fecha";
import { dias, dinero, dineroKpi, entero, SIN_DATO } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarCapital } from "@/lib/finanzas/cargar-rentabilidad";
import { baseDiaria, capitalTrabajo, cascadas, evolucionCapital } from "@/lib/finanzas/rentabilidad";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDatosPagina } from "../datos";
import { TablaEvolucion } from "./tabla-evolucion";

export const metadata = { title: "Capital de trabajo" };

export const dynamic = "force-dynamic";

/** Por encima de estos días de cobro el DSO se marca en ámbar (contra entrega debería volver en días). */
const DSO_ALERTA = 15;

/** La curva de un indicador por mes (los meses sin dato quedan fuera de la curva). */
const serie = (valores: (number | null)[]) => {
  const v = valores.map((x) => x ?? Number.NaN);
  return v.filter(Number.isFinite).length > 1 ? v : undefined;
};

export default async function CapitalTrabajoPage() {
  const usuario = await requireModulo("rentabilidad");
  // Inventario, compras y capital de trabajo son de toda la empresa: con tiendas limitadas no se muestran.
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Capital de trabajo" />;
  const supabase = createServiceClient();
  // Todas las entidades, como antes de la 0136 (los saldos de capital de trabajo son de Panamá).
  const [datos, actualizado] = await Promise.all([cargarDatosPagina(supabase, { entidad: "consolidado" }), ultimaActualizacionLibro(supabase)]);
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Capital de trabajo" imprimir={false} />
        <EstadoVacioAF4 titulo="Faltan el libro y la rentabilidad">Correr las migraciones 0901 (libro de movimientos) y 0915 (rentabilidad) en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const capital = await cargarCapital(supabase, datos.ventana);

  // Base: los 3 últimos meses cerrados, de todas las tiendas.
  const cerrados = datos.ventana.filter((m) => m < datos.mesEnCurso);
  const { porMes } = cascadas(datos.ventas, datos.libro, datos.ventana);
  const base = baseDiaria(porMes, cerrados.slice(-3));
  const k = capitalTrabajo(capital.saldos, base);
  const evolucion = evolucionCapital(porMes, capital.cartera, cerrados);
  const s = capital.saldos;
  const puede = (m: string) => usuario.modulos.includes(m);
  const tonoDso: Tono = k.dso !== null && k.dso > DSO_ALERTA ? "warning" : "neutral";
  const baseTexto = base.meses.length ? `Base ${rangoMeses(base.meses)} (${entero(base.dias)} días)` : "Sin meses cerrados";

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Capital de trabajo" datosHasta={base.meses.at(-1) ?? null} actualizado={actualizado} />

      <FilaKpiAF4>
        <KpiAF4 titulo="DSO" tono={tonoDso} valor={dias(k.dso)} serie={serie(evolucion.map((p) => p.dso))} subtexto={`${dinero(k.porCobrar)} por cobrar`} />
        <KpiAF4
          titulo="DIO"
          tono={s.inventario === null || capital.skusSinCosto > 0 ? "warning" : "neutral"}
          valor={s.inventario === null ? "Sin datos" : dias(k.dio)}
          href="/rentabilidad/inventario"
          subtexto={
            s.inventario === null
              ? "Sin stock cargado en Inventario"
              : `${dinero(s.inventario)} en stock${capital.skusSinCosto ? ` · ${entero(capital.skusSinCosto)} productos sin costo` : ""}`
          }
        />
        <KpiAF4 titulo="DPO" valor={dias(k.dpo)} serie={serie(evolucion.map((p) => p.dpo))} subtexto={`${dinero(k.porPagar)} por pagar`} />
        <KpiAF4
          titulo="CCC"
          destacado
          tono={k.ccc !== null && k.ccc > 0 ? "warning" : "neutral"}
          valor={k.ccc === null ? SIN_DATO : dias(k.ccc)}
          subtexto={k.ccc === null && k.cccSinInventario !== null ? `DSO − DPO: ${dias(k.cccSinInventario)}` : "DIO + DSO − DPO"}
        />
        <KpiAF4
          titulo="Capital de trabajo operativo"
          tono={k.capitalOperativo < 0 ? "warning" : "neutral"}
          valor={dineroKpi(k.capitalOperativo)}
          subtexto={baseTexto}
        />
      </FilaKpiAF4>

      <KpiGroup titulo="Saldos a hoy · USD">
        <KpiGrid compacta>
          <KpiCard compacta titulo="Cuentas por cobrar" valor={dinero(s.cxcCartera)} href={puede("cuentas-por-cobrar") ? "/cuentas-por-cobrar" : undefined} />
          <KpiCard
            compacta
            titulo="Cobros por depositar"
            valor={dinero(s.cobrosPorDepositar)}
            subtexto={`${entero(capital.cobrosPendientes)} cobros de los últimos 60 días`}
            href={puede("conciliacion-bancaria") ? "/conciliacion-bancaria" : undefined}
          />
          <KpiCard compacta titulo="Efectivo de repartidores" valor={dinero(s.efectivoRepartidores)} href={puede("deliverys") ? "/deliverys" : undefined} />
          <KpiCard compacta titulo="Cuentas por pagar" valor={dinero(s.cxpCartera)} href={puede("cuentas-por-pagar") ? "/cuentas-por-pagar" : undefined} />
          <KpiCard compacta titulo="Compras abiertas" valor={dinero(s.comprasAbiertas)} href={puede("compras") ? "/compras" : undefined} />
          {capital.parcial && <KpiCard compacta tono="warning" titulo="Solo carteras" valor="Parcial" subtexto="Falta la migración 0915" />}
        </KpiGrid>
      </KpiGroup>

      {evolucion.length > 1 && (
        <GraficaLineasAF4
          id="grafica-dias"
          titulo="Días de cobro y de pago"
          detalle={rangoMeses(evolucion.map((p) => p.periodo))}
          formato="entero"
          alto={220}
          datos={evolucion.map((p) => ({ etiqueta: mesCorto(p.periodo), dso: p.dso, dpo: p.dpo }))}
          series={[
            { clave: "dso", nombre: "DSO", color: 2 },
            { clave: "dpo", nombre: "DPO", color: 1, trazo: "rayas" },
          ]}
        />
      )}

      <section aria-labelledby="titulo-evolucion" className="flex flex-col gap-2">
        <h2 id="titulo-evolucion" className="text-sm font-semibold">
          Evolución de las carteras
        </h2>
        <TablaEvolucion filas={evolucion.map((p) => ({ ...p, etiqueta: mesCorto(p.periodo) }))} />
      </section>
    </Pagina>
  );
}
