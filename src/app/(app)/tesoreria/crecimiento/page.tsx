import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaLineasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { Pagina } from "@/components/ui/pagina";
import { hoyPanama, mesCorto } from "@/lib/af4/fecha";
import { dias, dinero, dineroKpi, porcentaje } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { leerDias, necesidadCapitalTrabajo } from "@/lib/finanzas/capital-crecimiento";
import { cargarBaseCovenants, cargarBaseDeuda, cargarCajaDisponible } from "@/lib/finanzas/cargar-deuda-avanzada";
import { mesesDesde, servicioPorMes } from "@/lib/finanzas/optimizar-deuda";
import { createServiceClient } from "@/lib/supabase/server";
import { AvisoTesoreria } from "../aviso";
import { FiltroCampos } from "../piezas-deuda";

export const metadata = { title: "Capital para crecer" };

export const dynamic = "force-dynamic";

const r1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10);

export default async function CapitalParaCrecerPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("tesoreria");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Tesorería" />;
  const p = await searchParams;
  const texto = (k: string) => (typeof p[k] === "string" ? (p[k] as string) : "");
  const hoy = hoyPanama();
  const supabase = createServiceClient();
  const [baseCov, deuda, caja] = await Promise.all([cargarBaseCovenants(supabase, hoy, 1), cargarBaseDeuda(supabase, hoy), cargarCajaDisponible(supabase, hoy)]);
  if ("error" in baseCov) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Capital para crecer" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer el balance y el estado de resultados">{baseCov.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const ultimo = baseCov.meses.at(-1)!;
  const ind = ultimo.indicadores;
  const crecimientoPct = Number(texto("crecimiento").replace(",", ".")) || 30;
  const mesesH = Math.min(Math.max(Math.round(Number(texto("meses")) || 12), 1), 36);
  const dso = leerDias(texto("dso")) ?? r1(ind.dso) ?? 0;
  const dio = leerDias(texto("dio")) ?? r1(ind.dio) ?? 0;
  const dpo = leerDias(texto("dpo")) ?? r1(ind.dpo) ?? 0;
  const mesesConDatos = Math.max(ultimo.insumos.mesesConDatos, 1);
  const ventasMes = ultimo.insumos.ventas / mesesConDatos;
  const costoMes = ultimo.insumos.costoVentas / mesesConDatos;
  const margenEbitda = ultimo.insumos.ventas > 0 ? ultimo.insumos.ebitda / ultimo.insumos.ventas : 0;
  const meses = mesesDesde(hoy, mesesH + 1).slice(1);
  const servicio = deuda ? servicioPorMes(deuda.instrumentos, meses) : [];
  const deudaDisponible = deuda ? deuda.deuda.lineas.reduce((a, l) => a + Math.max(l.cupo - l.usado, 0), 0) : 0;
  const cajaDisponible = "error" in caja ? 0 : caja.disponible;
  const r = necesidadCapitalTrabajo({
    ventasMes,
    costoMes,
    dso,
    dio,
    dpo,
    crecimiento: Math.min(Math.max(crecimientoPct, -90), 500) / 100,
    meses: mesesH,
    margenEbitda,
    servicioDeuda: servicio,
    cajaDisponible,
    deudaDisponible,
  });
  const etiquetas = meses.map(mesCorto);
  const frase = `Crecer ${porcentaje(crecimientoPct, { decimales: 0 })} en ${mesesH} meses requiere ${dinero(r.requerido)} adicionales de capital de trabajo; ${
    r.alcanza ? (r.alcanzaSinDeuda ? "con la caja proyectada alcanza." : "alcanza usando las líneas de crédito.") : `faltan ${dinero(r.falta)} desde ${etiquetas[(r.mesFalta ?? 1) - 1]}.`
  }`;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Capital para crecer"
        datosHasta={ultimo.corte}
        filtros={
          <FiltroCampos
            accion="/tesoreria/crecimiento"
            campos={[
              { nombre: "crecimiento", etiqueta: "Crecimiento de ventas %", valor: texto("crecimiento") || "30", ancho: "w-24" },
              { nombre: "meses", etiqueta: "Meses", valor: texto("meses") || "12", ancho: "w-20" },
              { nombre: "dso", etiqueta: "Días de cobro", valor: String(dso), ancho: "w-24" },
              { nombre: "dio", etiqueta: "Días de inventario", valor: String(dio), ancho: "w-24" },
              { nombre: "dpo", etiqueta: "Días de pago", valor: String(dpo), ancho: "w-24" },
            ]}
          />
        }
      />
      {"error" in caja && <AvisoTesoreria>No se pudo leer la proyección de caja: {caja.error}</AvisoTesoreria>}
      <p role="status" className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium">
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${r.alcanza ? (r.alcanzaSinDeuda ? "bg-success" : "bg-warning") : "bg-destructive"}`} />
        {frase}
      </p>
      <FilaKpiAF4>
        <KpiAF4 titulo="Capital de trabajo hoy" destacado valor={dineroKpi(r.capitalTrabajoHoy)} subtexto={`Ciclo de caja ${dias(r.ciclo)}`} />
        <KpiAF4 titulo="Adicional para crecer" tono={r.requerido > 0 ? "warning" : "neutral"} valor={dineroKpi(r.requerido)} subtexto={`Ventas de ${dinero(ventasMes)} a ${dinero(r.filas.at(-1)?.ventas ?? ventasMes)} al mes`} />
        <KpiAF4 titulo="Caja que genera" valor={dineroKpi(r.cajaGenerada)} subtexto={`EBITDA ${porcentaje(margenEbitda * 100, { decimales: 1 })} − servicio de la deuda`} />
        <KpiAF4 titulo="Caja y líneas disponibles" valor={dineroKpi(cajaDisponible + deudaDisponible)} subtexto={`Caja ${dinero(cajaDisponible)} · líneas ${dinero(deudaDisponible)}`} />
        <KpiAF4 titulo={r.alcanza ? "Holgura mínima" : "Falta"} tono={r.alcanza ? "success" : "destructive"} valor={dineroKpi(r.alcanza ? Math.min(...r.filas.map((f) => f.holgura)) : r.falta)} />
      </FilaKpiAF4>
      <GraficaLineasAF4
        id="grafica-capital-crecer"
        titulo="Necesidad acumulada contra fondos"
        datos={r.filas.map((f, k) => ({ etiqueta: etiquetas[k], necesidad: f.acumulado, fondos: cajaDisponible + deudaDisponible + f.cajaGeneradaAcumulada }))}
        series={[
          { clave: "necesidad", nombre: "Capital de trabajo adicional", color: 1 },
          { clave: "fondos", nombre: "Caja, líneas y caja generada", color: 2, trazo: "rayas" },
        ]}
      />
      <TablaFinanciera
        id="tabla-capital-crecer"
        titulo="Mes a mes"
        columnas={meses.map((m, k) => ({ clave: m, etiqueta: etiquetas[k], marca: r.filas[k].holgura < 0 ? { tono: "destructive", texto: "Falta caja" } : undefined }))}
        ariaLabel="Capital de trabajo que exige el crecimiento, mes a mes"
        filas={[
          { clave: "ventas", etiqueta: "Ventas del mes", tipo: "seccion", valores: r.filas.map((f) => f.ventas), total: null },
          { clave: "ct", etiqueta: "Capital de trabajo", tipo: "saldo", valores: r.filas.map((f) => f.capitalTrabajo), total: null },
          { clave: "incremental", etiqueta: "Capital de trabajo incremental", tipo: "seccion", valores: r.filas.map((f) => -f.incremental) },
          { clave: "generada", etiqueta: "Caja generada", tipo: "seccion", valores: r.filas.map((f) => f.cajaGenerada) },
          { clave: "holgura", etiqueta: "Holgura acumulada", tipo: "total", valores: r.filas.map((f) => f.holgura), total: null },
        ]}
      />
    </Pagina>
  );
}
