import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaBarrasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { Pagina } from "@/components/ui/pagina";
import { hoyPanama, mesCorto } from "@/lib/af4/fecha";
import { dinero, dineroKpi, porcentaje } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarBaseDeuda, cargarCajaDisponible, SIN_MIGRACION_0946 } from "@/lib/finanzas/cargar-deuda-avanzada";
import { SIN_MIGRACION_DEUDA } from "@/lib/finanzas/cargar-tesoreria";
import { leerMonto } from "@/lib/finanzas/pagos";
import { avalancha, calendario, ETIQUETA_ORIGEN, intereses12, tasaNetaPrepago } from "@/lib/finanzas/optimizar-deuda";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoTesoreria } from "../aviso";
import { FiltroCampos, Punto, TablaSimple } from "../piezas-deuda";

export const metadata = { title: "Optimizar deuda" };

export const dynamic = "force-dynamic";

const d2 = (v: number) => dinero(v, "USD", { decimales: 2 });
const tasa = (t: number) => porcentaje(t * 100, { decimales: 1 });

export default async function OptimizarDeudaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("tesoreria");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Tesorería" />;
  const params = await searchParams;
  const cajaPedida = typeof params.caja === "string" && params.caja.trim() ? leerMonto(params.caja) : null;
  const hoy = hoyPanama();
  const supabase = createServiceClient();
  const [base, caja] = await Promise.all([cargarBaseDeuda(supabase, hoy), cargarCajaDisponible(supabase, hoy)]);
  if (!base) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Optimizar deuda" imprimir={false} />
        <AvisoTesoreria>{SIN_MIGRACION_DEUDA}</AvisoTesoreria>
      </Pagina>
    );
  }
  const { instrumentos } = base;
  const disponible = cajaPedida ?? ("error" in caja ? 0 : caja.disponible);
  const r = avalancha(instrumentos, disponible, hoy);
  const meses = calendario(instrumentos, r.despues, hoy, r.usada > 0 ? { fecha: hoy, monto: r.usada } : null);
  const pasoDe = new Map(r.pasos.map((p) => [p.ref, p]));
  const noConviene = new Map(r.noConviene.map((p) => [p.ref, p.motivo]));
  const orden = [...instrumentos].sort((a, b) => tasaNetaPrepago(b) - tasaNetaPrepago(a));
  const mayor = orden[0] ?? null;
  const saldo = instrumentos.reduce((a, i) => a + i.saldo, 0);
  const tasaPromedio = saldo > 0 ? instrumentos.reduce((a, i) => a + i.tasaEfectivaAnual * i.saldo, 0) / saldo : null;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Optimizar deuda"
        filtros={<FiltroCampos accion="/tesoreria/optimizar" campos={[{ nombre: "caja", etiqueta: "Caja para prepagar (USD)", valor: cajaPedida !== null ? String(cajaPedida) : "", placeholder: "error" in caja ? "Ej: 10000" : String(caja.disponible), ancho: "w-40" }]} />}
        imprimir
      />
      {base.deuda.sinMigracionCiclos && <AvisoTesoreria>{SIN_MIGRACION_0946}</AvisoTesoreria>}
      {"error" in caja && cajaPedida === null && <AvisoTesoreria>No se pudo leer la proyección de caja: {caja.error}</AvisoTesoreria>}
      {!instrumentos.length ? (
        <EstadoVacioAF4 titulo="No hay deuda vigente" accion={{ href: "/tesoreria/deuda", etiqueta: "Cargar deuda" }} />
      ) : (
        <>
          <FilaKpiAF4>
            <KpiAF4
              titulo="Caja para prepagar"
              destacado
              valor={dineroKpi(disponible)}
              subtexto={cajaPedida !== null ? "Monto elegido" : "error" in caja ? undefined : `Mínimo proyectado ${dinero(caja.minimo)} − caja mínima ${dinero(caja.cajaMinima)}`}
            />
            <KpiAF4 titulo="Costo financiero 12 meses" valor={dineroKpi(r.interesesAntes12)} subtexto={tasaPromedio !== null ? `Tasa efectiva promedio ${tasa(tasaPromedio)}` : undefined} />
            <KpiAF4 titulo="Ahorro de intereses 12 meses" tono={r.ahorro12 > 0 ? "success" : "neutral"} valor={dineroKpi(r.ahorro12)} subtexto={`Prepagando ${dinero(r.usada)}`} />
            <KpiAF4 titulo="Deuda más cara" tono={mayor && mayor.tasaEfectivaAnual > 0.3 ? "destructive" : "neutral"} valor={mayor ? tasa(mayor.tasaEfectivaAnual) : "—"} subtexto={mayor?.nombre} />
          </FilaKpiAF4>

          <TablaSimple
            id="tabla-avalancha"
            titulo="Qué prepagar primero"
            detalle="Avalancha por tasa efectiva anual neta de penalidad y comisión"
            columnas={[
              { etiqueta: "Deuda" },
              { etiqueta: "Tipo" },
              { etiqueta: "Saldo", numero: true },
              { etiqueta: "Tasa efectiva anual", numero: true },
              { etiqueta: "Penalidad + comisión", numero: true },
              { etiqueta: "Intereses 12 meses", numero: true },
              { etiqueta: "Prepagar", numero: true },
              { etiqueta: "Ahorro 12 meses", numero: true },
            ]}
            filas={orden.map((i, k) => {
              const p = pasoDe.get(i.ref);
              const motivo = noConviene.get(i.ref);
              return {
                clave: i.ref,
                resaltar: !!p,
                celdas: [
                  <Punto key="n" tono={p ? "success" : motivo ? "warning" : "neutral"}>
                    {k + 1}. {i.nombre}
                  </Punto>,
                  <span key="t" className="text-muted-foreground">
                    {ETIQUETA_ORIGEN[i.origen]}
                    {motivo ? ` · ${motivo}` : ""}
                  </span>,
                  d2(i.saldo),
                  tasa(i.tasaEfectivaAnual),
                  i.penalidad || i.comision ? `${tasa(i.penalidad)} + ${d2(i.comision)}` : "—",
                  d2(intereses12(i, hoy)),
                  p ? d2(p.prepago) : "—",
                  p ? d2(p.ahorro12) : "—",
                ],
              };
            })}
            pie={["Total", "", d2(saldo), "", "", d2(r.interesesAntes12), d2(r.pasos.reduce((a, p) => a + p.prepago, 0)), d2(r.ahorro12)]}
          />

          <GraficaBarrasAF4
            id="grafica-servicio"
            titulo="Servicio de la deuda por mes"
            detalle="Cuotas, intereses y costos de ciclo"
            datos={meses.map((m) => ({ etiqueta: mesCorto(m.mes), antes: m.antes, despues: m.despues }))}
            series={[
              { clave: "antes", nombre: "Hoy", color: 5 },
              { clave: "despues", nombre: "Después de prepagar", color: 2 },
            ]}
          />

          <TablaFinanciera
            id="calendario-prepago"
            titulo="Calendario resultante"
            columnas={meses.map((m) => ({ clave: m.mes, etiqueta: mesCorto(m.mes) }))}
            ariaLabel="Servicio de la deuda antes y después de prepagar"
            filas={[
              { clave: "antes", etiqueta: "Servicio de la deuda hoy", tipo: "seccion", valores: meses.map((m) => m.antes) },
              { clave: "despues", etiqueta: "Servicio después de prepagar", tipo: "seccion", valores: meses.map((m) => m.despues) },
              { clave: "prepago", etiqueta: "Prepago", tipo: "seccion", valores: meses.map((m) => -m.unico) },
              { clave: "efecto", etiqueta: "Efecto en caja", tipo: "subtotal", valores: meses.map((m) => m.efecto) },
              { clave: "acumulado", etiqueta: "Efecto acumulado", tipo: "saldo", valores: meses.map((m) => m.acumulado), total: null },
            ]}
          />
        </>
      )}
    </Pagina>
  );
}
