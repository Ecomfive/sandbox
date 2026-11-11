import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { claseCifra } from "@/components/af4/estilos-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { anilloFoco, fieldClassSm, labelClassSm } from "@/components/ui/field";
import { Pagina } from "@/components/ui/pagina";
import { hoyPanama, rangoMeses, sumarMeses } from "@/lib/af4/fecha";
import { dinero, dineroKpi, numero, veces } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { asignarCapital } from "@/lib/finanzas/asignacion-capital";
import { cargarConfigCapital, cargarTiendasCapital, MESES_ASIGNACION } from "@/lib/finanzas/cargar-capital";
import { cargarValoracion } from "@/lib/finanzas/valoracion";
import { createServiceClient } from "@/lib/supabase/server";
import { SupuestosAsignacionForm, TablaAsignacion } from "./asignacion-cliente";

export const metadata = { title: "Asignación de capital" };

export const dynamic = "force-dynamic";

export default async function AsignacionPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("capital-riesgo");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Capital y riesgo" />;
  const escribe = !usuario.modulosSoloLectura.includes("capital-riesgo");
  const supabase = createServiceClient();
  const hoy = hoyPanama();
  const [datos, config, valoracion] = await Promise.all([cargarTiendasCapital(supabase, hoy), cargarConfigCapital(supabase), cargarValoracion(supabase)]);
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Asignación de capital" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer la unidad económica">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const pautaHoy = datos.tiendas.reduce((a, t) => a + t.pauta, 0);
  const crudo = (await searchParams).monto;
  const pedido = typeof crudo === "string" ? Number(crudo.replace(/[\s,$]/g, "")) : NaN;
  const monto = Number.isFinite(pedido) && pedido >= 0 && pedido < 100_000_000 ? pedido : Math.round(pautaHoy);
  const multiplo = valoracion.supuestos.multiplo;
  const r = asignarCapital(datos.tiendas, monto, config.asignacion, multiplo);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Asignación de capital" datosHasta={sumarMeses(datos.hasta, 1)} imprimir={false} />
      <FilaKpiAF4>
        <KpiAF4 titulo="Pauta a repartir por mes" destacado valor={dineroKpi(r.monto)} subtexto={`Hoy ${dineroKpi(pautaHoy)} · promedio de ${rangoMeses([datos.desde, datos.hasta])}`} />
        <KpiAF4 titulo="EBITDA que suma por mes" tono={r.ebitdaIncremental > 0 ? "success" : r.ebitdaIncremental < 0 ? "destructive" : "neutral"} valor={dinero(r.ebitdaIncremental, "USD", { conSigno: true })} subtexto={`${dineroKpi(r.ebitdaIncremental * 12)} al año`} />
        <KpiAF4 titulo="Valor creado" valor={r.valorCreado === null ? "—" : dineroKpi(r.valorCreado)} subtexto={`EBITDA anual × ${veces(multiplo)} (Valoración)`} />
        <KpiAF4 titulo="Sin asignar" tono={r.sinAsignar > 0 ? "warning" : "neutral"} valor={dineroKpi(r.sinAsignar)} subtexto="Donde el próximo dólar no se paga" />
        <KpiAF4 titulo="Capital en inventario" valor={dineroKpi(r.capitalInventario)} subtexto={`${config.asignacion.diasInventario} días de los pedidos extra`} />
      </FilaKpiAF4>
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className={labelClassSm}>Monto de pauta por mes (USD)</span>
          <input name="monto" inputMode="decimal" defaultValue={String(monto)} className={`${fieldClassSm} w-40 text-right ${claseCifra}`} placeholder={`Ej: ${Math.round(pautaHoy)}`} />
        </label>
        <button type="submit" className={`inline-flex h-8 items-center rounded-md bg-foreground px-3 text-sm font-medium text-background hover:bg-foreground/85 ${anilloFoco}`}>
          Repartir
        </button>
        <span className={`text-xs text-muted-foreground ${claseCifra}`}>
          Elasticidad {numero(config.asignacion.elasticidad, 2)} · piso {config.asignacion.pisoPct} % · {MESES_ASIGNACION} meses cerrados
        </span>
      </form>
      <TablaAsignacion tiendas={r.tiendas} />
      {escribe && (
        <MarcoAF4 id="supuestos-asignacion" titulo="Supuestos">
          <SupuestosAsignacionForm supuestos={config.asignacion} />
        </MarcoAF4>
      )}
    </Pagina>
  );
}
