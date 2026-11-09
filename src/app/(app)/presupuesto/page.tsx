import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { valorEmpresa } from "@/lib/finanzas/eerr";
import { cargarListaPresupuestos, cargarRealPorUnidad } from "@/lib/finanzas/cargar-presupuesto";
import { cargarValoracion } from "@/lib/finanzas/valoracion";
import { rangoMeses, sumarSeries } from "@/lib/finanzas/presupuesto";
import type { DatosGenerar } from "./campos-generar";
import { TablaPresupuestos, type FilaPresupuesto } from "./tabla-presupuestos";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { hoyPanama } from "@/lib/af4/fecha";

export const metadata = { title: "Presupuesto" };

export const dynamic = "force-dynamic";

/** Cuántos meses hacia atrás se ofrecen como base. */
const MESES_ELEGIBLES = 24;
/** Base sugerida: los últimos 6 meses cerrados con datos. */
const BASE_SUGERIDA = 6;

export default async function PresupuestoPage() {
  const usuario = await requireModulo("presupuesto");
  const supabase = createServiceClient();
  const hoy = hoyPanama();
  const enCurso = `${hoy.slice(0, 7)}-01`;
  const anio = Number(hoy.slice(0, 4));
  const ventana = rangoMeses(`${anio - 2}-${hoy.slice(5, 7)}-01`, enCurso).slice(-MESES_ELEGIBLES);

  const [lista, real, valoracion, actualizado] = await Promise.all([
    cargarListaPresupuestos(supabase),
    cargarRealPorUnidad(supabase, ventana),
    cargarValoracion(supabase),
    ultimaActualizacionLibro(supabase),
  ]);
  if ("error" in lista) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Presupuesto" oculto />
        <EstadoVacioAF4 titulo="El presupuesto todavía no está instalado">Falta correr la migración 0913 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }

  const filas: FilaPresupuesto[] = lista.presupuestos.map((p) => {
    const t = (s: string) => lista.totales.find((x) => x.presupuesto_id === p.id && x.escenario === "base" && x.seccion === s)?.monto ?? 0;
    const ingresos = t("ingresos");
    const ebitda = ingresos - t("costo_ventas") - t("administracion") - t("marketing");
    return {
      id: p.id,
      nombre: p.nombre,
      anio: p.anio,
      estado: p.estado,
      nivel: p.por_tienda ? "Por tienda" : "Consolidado",
      ingresos,
      ebitda,
      margenEbitda: ingresos > 0 ? (ebitda / ingresos) * 100 : null,
      valorEmpresa: valorEmpresa(ebitda, valoracion.supuestos.multiplo),
    };
  });

  const datosHasta = "error" in real ? null : (ventana.filter((m) => real.conDatos.has(m) && m <= enCurso).at(-1) ?? null);
  let datos: DatosGenerar | null = null;
  if (!("error" in real)) {
    const meses = ventana.filter((m) => real.conDatos.has(m));
    const cerrados = meses.filter((m) => m < enCurso);
    const base = (cerrados.length ? cerrados : meses).slice(-BASE_SUGERIDA);
    if (base.length) {
      datos = {
        serie: sumarSeries([...real.porUnidad.values()], meses),
        meses,
        baseDesde: base[0],
        baseHasta: base[base.length - 1],
        anio,
      };
    }
  }

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Presupuesto" datosHasta={datosHasta} actualizado={actualizado} imprimir={false} />
      <TablaPresupuestos filas={filas} datos={datos} puedeEscribir={!usuario.modulosSoloLectura.includes("presupuesto")} />
    </Pagina>
  );
}
