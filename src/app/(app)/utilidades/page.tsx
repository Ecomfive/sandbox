import { ControlPeriodo } from "@/components/af4/control-periodo";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4, type ComparacionKpi } from "@/components/af4/kpi-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { KpiCard, KpiGrid, KpiGroup, type Tono } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { mesCorto, mesEnCursoPanama, rangoMeses as textoRango } from "@/lib/af4/fecha";
import { dineroKpi } from "@/lib/af4/formato";
import { elegirPeriodoAF4, opcionesPeriodo, periodoAnterior, type PeriodoAF4 } from "@/lib/af4/periodo";
import { desdeTablaMensual } from "@/lib/af4/tabla-mensual";
import { calcularVariacion } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarUtilidades } from "@/lib/finanzas/cargar-utilidades";
import { rangoMeses, ventanaPedida } from "@/lib/finanzas/flujo";
import { distribuir, filasPorSocio, filasPorTienda, sumaEn, utilidadPorUnidad } from "@/lib/finanzas/utilidades";

export const metadata = { title: "Distribución de utilidades" };

export const dynamic = "force-dynamic";

const TITULO = "Distribución de utilidades";
const tono = (v: number): Tono => (v < 0 ? "destructive" : "neutral");

export default async function UtilidadesPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("utilidades");
  const sp = await searchParams;
  const supabase = createServiceClient();
  const [datos, actualizado] = await Promise.all([cargarUtilidades(supabase), ultimaActualizacionLibro(supabase)]);
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo={TITULO} oculto />
        <EstadoVacioAF4 titulo="No se pudo leer la distribución de utilidades">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  // El período se elige con `?periodo=` (u3/u6/u12/aAAAA/AAAA-MM); un enlace viejo con `?desde=&hasta=` sigue funcionando.
  const mesEnCurso = mesEnCursoPanama();
  const conRango = (typeof sp.desde === "string" || typeof sp.hasta === "string") && typeof sp.periodo !== "string";
  const periodo: PeriodoAF4 | null = conRango
    ? null
    : elegirPeriodoAF4(sp.periodo, datos.disponibles, mesEnCurso, { predeterminado: "u12", incluirEnCurso: true });
  const ventana = conRango
    ? ventanaPedida(sp.desde, sp.hasta, datos.disponibles)
    : periodo && periodo.meses.length
      ? rangoMeses(periodo.meses[0], periodo.meses[periodo.meses.length - 1])
      : [];
  if (!ventana.length) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo={TITULO} oculto />
        <EstadoVacioAF4 titulo="Todavía no hay resultados en el libro para repartir" accion={{ href: "/libro-movimientos/importar", etiqueta: "Importar el libro" }} />
      </Pagina>
    );
  }
  // El saldo de cada socio se acumula desde el primer mes con datos, aunque se vea una ventana más corta.
  const historia = rangoMeses(datos.disponibles[0], ventana[ventana.length - 1]);
  const unidadesReparto = new Set(datos.unidades.filter((u) => u.clase !== "reparto").map((u) => u.id));
  const utilidades = utilidadPorUnidad(
    datos.filas.filter((f) => unidadesReparto.has(f.unidad_id)),
    historia,
  );
  const d = distribuir({ meses: historia, utilidades, participaciones: datos.participaciones, socios: datos.socios, retiros: datos.retiros });

  const nombresSocio = new Map(datos.socios.map((s) => [s.id, s.nombre]));
  const nombresUnidad = new Map(datos.unidades.map((u) => [u.id, u.nombre]));
  const ordenUnidad = new Map(datos.unidades.map((u) => [u.id, u.orden]));
  const sumaDe = (meses: string[], f: (u: (typeof d.unidades)[number]) => Record<string, number>) => d.unidades.reduce((a, u) => a + sumaEn(f(u), meses), 0);
  const suma = (f: (u: (typeof d.unidades)[number]) => Record<string, number>) => sumaDe(ventana, f);
  const utilidad = suma((u) => u.utilidad);
  const repartido = suma((u) => u.repartido);
  const sinRepartir = suma((u) => u.sinRepartir);
  const retirosDe = (meses: string[]) => d.socios.reduce((a, s) => a + sumaEn(s.retiros, meses), 0) + sumaEn(d.retirosSinAtribuir, meses);
  const retiros = retirosDe(ventana);
  const sinAtribuir = sumaEn(d.retirosSinAtribuir, ventana);
  const masDeCien = d.unidades.filter((u) => ventana.some((m) => u.sumaPorcentajes[m] > 100.0001)).map((u) => nombresUnidad.get(u.unidad_id));
  const rango = textoRango(ventana);

  // Contra el período anterior del mismo largo (dentro de la historia ya calculada).
  const previos = periodo ? periodoAnterior(periodo, datos.disponibles).filter((m) => historia.includes(m)) : [];
  const contra = previos.length ? textoRango(previos) : "";
  const vsAnterior = (actual: number, anterior: number): ComparacionKpi[] => (previos.length ? [{ v: calcularVariacion(actual, anterior), contra }] : []);
  const datosHasta = datos.disponibles.filter((m) => m <= mesEnCurso).at(-1) ?? null;
  const columnas = ventana.map((m) => ({ clave: m, etiqueta: mesCorto(m) }));
  const alertas = Math.abs(sinRepartir) >= 1 || sinAtribuir >= 1 || masDeCien.length > 0;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo={TITULO}
        filtros={
          periodo ? (
            <ControlPeriodo
              periodo={periodo}
              opciones={opcionesPeriodo(datos.disponibles, mesEnCurso, { incluirEnCurso: true })}
              href={(clave) => `/utilidades?periodo=${clave}`}
            />
          ) : (
            <span className="text-sm text-muted-foreground">{rango}</span>
          )
        }
        datosHasta={datosHasta}
        actualizado={actualizado}
      />

      <KpiGroup titulo={`${rango} · USD`}>
        <FilaKpiAF4>
          <KpiAF4 titulo="Utilidad antes de retiros" destacado tono={tono(utilidad)} valor={dineroKpi(utilidad)} comparaciones={vsAnterior(utilidad, sumaDe(previos, (u) => u.utilidad))} />
          <KpiAF4 titulo="Repartida a socios" valor={dineroKpi(repartido)} />
          <KpiAF4 titulo="Retiros de dividendos" valor={dineroKpi(retiros)} comparaciones={previos.length ? [{ v: calcularVariacion(retiros, retirosDe(previos), "neutro"), contra }] : []} />
        </FilaKpiAF4>
      </KpiGroup>

      {alertas && (
        <KpiGroup titulo="Para revisar">
          <KpiGrid compacta>
            <KpiCard compacta titulo="Sin repartir" tono={Math.abs(sinRepartir) >= 1 ? "warning" : "neutral"} valor={dineroKpi(sinRepartir)} href="/utilidades/participaciones" />
            <KpiCard compacta titulo="Retiros sin atribuir" tono={sinAtribuir >= 1 ? "warning" : "neutral"} valor={dineroKpi(sinAtribuir)} href="/utilidades/retiros" />
            {masDeCien.length > 0 && (
              <KpiCard compacta tono="destructive" titulo="Porcentajes de más de 100 %" valor={masDeCien.join(", ")} href="/utilidades/participaciones" />
            )}
          </KpiGrid>
        </KpiGroup>
      )}

      <TablaFinanciera
        id="titulo-utilidades-socios"
        titulo="Por socio"
        detalle="USD"
        etiquetaConcepto="Socio"
        ariaLabel="Parte de la utilidad, retiros y saldo de cada socio por mes"
        columnas={columnas}
        filas={desdeTablaMensual(filasPorSocio(d, nombresSocio, ventana), ventana, { grupos: "seccion" })}
      />

      <TablaFinanciera
        id="titulo-utilidades-tiendas"
        titulo="Por tienda"
        detalle="USD"
        etiquetaConcepto="Tienda"
        ariaLabel="Utilidad de cada tienda y parte de cada socio por mes"
        columnas={columnas}
        filas={desdeTablaMensual(filasPorTienda(d, datos.participaciones, nombresUnidad, nombresSocio, ventana, ordenUnidad), ventana, { grupos: "seccion" })}
      />
    </Pagina>
  );
}
