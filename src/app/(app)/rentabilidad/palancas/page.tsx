import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { RecordarTienda } from "@/components/tienda-global/recordar-tienda";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { dinero, dineroKpi } from "@/lib/af4/formato";
import { rangoPeriodo } from "@/lib/af4/periodo";
import { requireModulo } from "@/lib/auth";
import { valorEmpresa } from "@/lib/finanzas/eerr";
import { ordenarPalancas, sumarCascadas } from "@/lib/finanzas/rentabilidad";
import { paramsConTienda } from "@/lib/finanzas/tienda-actual";
import { cargarValoracion } from "@/lib/finanzas/valoracion";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDatosPagina } from "../datos";
import { Selectores } from "../selectores";
import { TablaPalancas } from "./tabla-palancas";

export const metadata = { title: "Palancas de valor" };

export const dynamic = "force-dynamic";

/** Un monto grande de KPI con su signo («+$120,000»). */
const conSigno = (v: number) => (Math.abs(v) >= 10_000_000 ? `+${dineroKpi(v)}` : dinero(v, "USD", { conSigno: true }));

export default async function PalancasPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  await requireModulo("rentabilidad");
  const supabase = createServiceClient();
  // Sin `?tienda=` arranca con la tienda global de la barra de arriba.
  const selTienda = await paramsConTienda(supabase, await searchParams, "tienda");
  const [datos, valoracion, actualizado] = await Promise.all([
    cargarDatosPagina(supabase, selTienda.params),
    cargarValoracion(supabase),
    ultimaActualizacionLibro(supabase),
  ]);
  const multiplo = valoracion.supuestos.multiplo;
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Palancas de valor" imprimir={false} />
        <EstadoVacioAF4 titulo="Faltan el libro y la rentabilidad">Correr las migraciones 0901 (libro de movimientos) y 0915 (rentabilidad) en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const { periodo, porTienda, nombre, tienda } = datos;
  const filas = ordenarPalancas(porTienda, multiplo).map((p) => ({ ...p, id: `${p.unidad_id}|${p.clave}`, tienda: nombre(p.unidad_id) }));
  const t = sumarCascadas([...porTienda.values()]);
  const ebitdaAnual = t.meses ? (t.ebitda / t.meses) * 12 : 0;
  const potencial = filas.reduce((a, p) => a + p.ebitdaAnual, 0);
  const contexto = `${tienda?.nombre ?? "Todas las tiendas"} · ${rangoPeriodo(periodo)} anualizado · USD`;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <RecordarTienda {...selTienda.recordar} />
      <EncabezadoAF4
        titulo="Palancas de valor"
        filtros={<Selectores datos={datos} ruta="/rentabilidad/palancas" />}
        datosHasta={datos.conDatos.filter((m) => m <= datos.mesEnCurso).at(-1) ?? null}
        actualizado={actualizado}
      />

      {!filas.length ? (
        <EstadoVacioAF4 titulo="Todavía no hay movimientos ni órdenes en este período" />
      ) : (
        <>
          <FilaKpiAF4>
            <KpiAF4 titulo="EBITDA anual" tono={ebitdaAnual < 0 ? "destructive" : "neutral"} valor={dineroKpi(ebitdaAnual)} subtexto={contexto} />
            <KpiAF4 titulo="Valor de empresa" valor={dineroKpi(valorEmpresa(ebitdaAnual, multiplo))} subtexto={`EBITDA anual × ${multiplo}`} />
            <KpiAF4 titulo="EBITDA anual con todas las palancas" tono="success" valor={conSigno(potencial)} />
            <KpiAF4 titulo="Valor creado con todas las palancas" destacado tono="success" valor={conSigno(potencial * multiplo)} />
          </FilaKpiAF4>
          <TablaPalancas filas={filas} />
        </>
      )}
    </Pagina>
  );
}
