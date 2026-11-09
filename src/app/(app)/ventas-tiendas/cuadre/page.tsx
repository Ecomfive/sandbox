import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { Pagina } from "@/components/ui/pagina";
import { dinero2, dineroKpi, entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarBase, cargarIngresosLibro } from "@/lib/ventas/cargar";
import { cuadreConLibro, TOLERANCIA_CUADRE } from "@/lib/ventas/resumen";
import { cargarDatosPagina } from "../datos";
import { BaseReparto } from "./base-reparto";
import { TablaCuadre } from "./tabla-cuadre";

export const metadata = { title: "Cuadre" };

export const dynamic = "force-dynamic";

export default async function CuadrePage() {
  const usuario = await requireModulo("ventas-tiendas");
  const supabase = createServiceClient();
  const datos = await cargarDatosPagina(supabase, {});
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Cuadre" imprimir={false} />
        <EstadoVacioAF4 titulo="Falta la tabla de ventas">Correr la migración 0909 (ventas por tienda) en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const desde = datos.meses[0] ?? "2000-01-01";
  const [libro, base] = await Promise.all([cargarIngresosLibro(supabase, desde), cargarBase(supabase, desde)]);
  const cuadre = cuadreConLibro(datos.resumen, libro);
  const conLibro = cuadre.filter((c) => c.ingresos_libro !== null && c.ingresos_libro > 0);
  const cuadran = conLibro.filter((c) => Math.abs(c.diferencia ?? 0) <= TOLERANCIA_CUADRE).length;
  const sinLibro = cuadre.length - conLibro.length;
  const diferencia = conLibro.reduce((a, c) => a + (c.diferencia ?? 0), 0);
  const conVentas = new Set(datos.resumen.map((r) => r.unidad_id));
  const otras = datos.unidades.filter((u) => u.clase === "tienda" && u.recibe_reparto && !conVentas.has(u.id)).map((u) => u.id);
  const puedeEscribir = !usuario.modulosSoloLectura.includes("ventas-tiendas") && !usuario.modulosSoloLectura.includes("libro-movimientos") && usuario.modulos.includes("libro-movimientos");

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Cuadre" datosHasta={datos.meses.at(-1) ?? null} />

      <FilaKpiAF4>
        <KpiAF4
          titulo="Tiendas y meses que cuadran"
          tono={conLibro.length && cuadran === conLibro.length ? "success" : "warning"}
          valor={`${entero(cuadran)} de ${entero(conLibro.length)}`}
          subtexto={`Tolerancia ${dinero2(TOLERANCIA_CUADRE)}`}
        />
        <KpiAF4
          titulo="Diferencia (ventas − libro)"
          tono={Math.abs(diferencia) > TOLERANCIA_CUADRE ? "warning" : "neutral"}
          valor={dineroKpi(diferencia)}
          subtexto="En los meses con ingresos en el libro"
        />
        <KpiAF4 titulo="Tiendas y meses sin ingresos en el libro" tono={sinLibro ? "warning" : "neutral"} valor={entero(sinLibro)} />
      </FilaKpiAF4>

      <section aria-labelledby="titulo-cuadre-libro" className="flex flex-col gap-2">
        <h2 id="titulo-cuadre-libro" className="text-sm font-semibold">
          Ventas entregadas contra ingresos del libro
        </h2>
        <TablaCuadre filas={cuadre} />
      </section>

      <BaseReparto
        ventas={datos.resumen.map((r) => ({ periodo: r.periodo, unidad_id: r.unidad_id, ordenes: r.ordenes, entregadas: r.entregadas }))}
        base={base}
        otras={otras}
        nombres={Object.fromEntries(datos.unidades.map((u) => [u.id, u.nombre]))}
        meses={datos.meses}
        puedeEscribir={puedeEscribir}
      />
    </Pagina>
  );
}
