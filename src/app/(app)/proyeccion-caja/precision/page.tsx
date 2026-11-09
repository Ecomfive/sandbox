import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { Pagina } from "@/components/ui/pagina";
import { diaMes, fechaCorta } from "@/lib/af4/fecha";
import { dinero, dineroKpi, entero, fraccion } from "@/lib/af4/formato";
import type { FilaAF4 } from "@/lib/af4/tabla-financiera";
import { calcularVariacion } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { cargarPrecision } from "@/lib/finanzas/cargar-proyeccion";
import { RUBROS_PRECISION } from "@/lib/finanzas/proyeccion-caja";
import { createServiceClient } from "@/lib/supabase/server";
import { hoyPanama } from "../datos";
import { TablaRubros, type FilaRubro } from "./tabla-rubros";
import { tonoError } from "./tono";

export const metadata = { title: "Precisión de la proyección" };

export const dynamic = "force-dynamic";

const GRUPO: Record<string, string> = { entradas: "Entradas", salidas: "Salidas" };

export default async function PrecisionProyeccionPage() {
  await requireModulo("proyeccion-caja");
  const r = await cargarPrecision(createServiceClient(), hoyPanama());
  if ("error" in r) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Precisión" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo medir la precisión">{r.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  if (!r.pares) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Precisión" imprimir={false} />
        <EstadoVacioAF4 titulo="Todavía no hay semanas cerradas que comparar" accion={{ href: "/proyeccion-caja", etiqueta: "Abrir la proyección" }}>
          Cada semana se guarda una foto de la proyección al abrirla.
        </EstadoVacioAF4>
      </Pagina>
    );
  }
  const neto = r.rubros.find((x) => x.rubro === "neto")!;
  const entradas = r.rubros.find((x) => x.rubro === "entradas")!;
  const salidas = r.rubros.find((x) => x.rubro === "salidas")!;
  const grupoDe = new Map(RUBROS_PRECISION.map((x) => [x.clave as string, GRUPO[x.grupo] ?? "Salidas"]));
  const filasRubros: FilaRubro[] = r.rubros.map((x) => ({ ...x, grupo: grupoDe.get(x.rubro) ?? "Totales" }));

  const ultima = r.semanas.at(-1);
  const resumen = `${entero(r.semanas.length)} ${r.semanas.length === 1 ? "semana cerrada" : "semanas cerradas"} · ${entero(r.pares)} comparaciones · USD`;
  const filasSemanas: FilaAF4[] = [
    { clave: "proyectado", etiqueta: "Proyectado", tipo: "seccion", valores: r.porSemana.map((s) => s.proyectado) },
    { clave: "real", etiqueta: "Real", tipo: "seccion", valores: r.porSemana.map((s) => s.real) },
    { clave: "diferencia", etiqueta: "Diferencia", tipo: "subtotal", valores: r.porSemana.map((s) => s.proyectado - s.real) },
  ];

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Precisión" />

      <FilaKpiAF4>
        <KpiAF4
          titulo="Error en entradas"
          tono={tonoError(entradas.errorAbsoluto)}
          valor={fraccion(entradas.errorAbsoluto)}
          subtexto={`Sesgo ${fraccion(entradas.error, { conSigno: true })}`}
        />
        <KpiAF4
          titulo="Error en salidas"
          tono={tonoError(salidas.errorAbsoluto)}
          valor={fraccion(salidas.errorAbsoluto)}
          subtexto={`Sesgo ${fraccion(salidas.error, { conSigno: true })}`}
        />
        <KpiAF4
          titulo="Neto proyectado"
          destacado
          valor={dineroKpi(neto.proyectado)}
          comparaciones={[{ v: calcularVariacion(neto.proyectado, neto.real, "neutro"), contra: "lo real", modo: "dinero" }]}
          subtexto={`Real ${dinero(neto.real)}`}
        />
        <KpiAF4
          titulo="Semanas comparadas"
          valor={entero(r.semanas.length)}
          subtexto={ultima ? `Hasta la del ${fechaCorta(ultima)} · ${entero(r.pares)} comparaciones` : undefined}
        />
      </FilaKpiAF4>

      <TablaRubros filas={filasRubros} />

      <TablaFinanciera
        id="tabla-precision-semanas"
        titulo="Neto por semana"
        detalle={resumen}
        etiquetaConcepto="Neto"
        columnas={r.porSemana.map((s) => ({
          clave: s.semana,
          etiqueta: diaMes(s.semana),
          detalle: `${entero(s.fotos)} ${s.fotos === 1 ? "foto" : "fotos"}`,
        }))}
        filas={filasSemanas}
        ariaLabel="Neto proyectado contra real por semana"
      />
    </Pagina>
  );
}
