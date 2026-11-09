import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaBarrasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4, type ComparacionKpi } from "@/components/af4/kpi-af4";
import { SelectorEnlace } from "@/components/af4/selector-enlace";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { mesCorto, mesEnCursoPanama, mesMedio } from "@/lib/af4/fecha";
import { dinero, dineroKpi, entero, fraccion } from "@/lib/af4/formato";
import { calcularVariacion, type Sentido } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { cargarLineas, cargarMeses, cargarUnidades, mesAnterior } from "@/lib/nomina/cargar";
import { UNIDAD_REPARTO } from "@/lib/nomina/excel";
import { resumirMes, variacionPct, type ResumenMes } from "@/lib/nomina/resumen";
import { createServiceClient } from "@/lib/supabase/server";
import { TablaNomina } from "./tabla-nomina";

export const metadata = { title: "Nómina" };

export const dynamic = "force-dynamic";

const MODULO = "nomina";

/** Una subida del costo de más de esto (en %) contra el mes anterior pone el punto ámbar. */
const ALERTA_VARIACION = 10;

export default async function NominaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo(MODULO);
  const puedeEscribir = !usuario.modulosSoloLectura.includes(MODULO);
  const supabase = createServiceClient();
  const { mes } = await searchParams;

  const [meses, unidades] = await Promise.all([cargarMeses(supabase), cargarUnidades(supabase)]);
  if ("error" in meses || "error" in unidades) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Nómina" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo leer la nómina">{"error" in meses ? meses.error : "No se pudieron leer las tiendas."}</EstadoVacioAF4>
      </Pagina>
    );
  }
  if (!meses.meses.length) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Nómina" imprimir={false} />
        <EstadoVacioAF4 titulo="Todavía no hay nómina cargada" accion={puedeEscribir ? { href: "/nomina/importar", etiqueta: "Importar los Excel" } : undefined} />
      </Pagina>
    );
  }

  // Sin pedir un mes, el último cerrado (el mes en curso todavía no tiene todas sus quincenas); se elige igual y sale «parcial».
  const enCurso = mesEnCursoPanama();
  const elegido = typeof mes === "string" && meses.meses.includes(mes) ? mes : (meses.meses.filter((m) => m < enCurso).at(-1) ?? meses.meses[meses.meses.length - 1]);
  const anterior = mesAnterior(elegido);
  const ultimos = meses.meses.slice(-13);
  const opcionesMes = [...ultimos].reverse().map((m) => ({ valor: m, etiqueta: m >= enCurso ? `${mesMedio(m)} · parcial` : mesMedio(m), href: `/nomina?mes=${m}` }));
  const encabezado = (conDescarga: boolean) => (
    <EncabezadoAF4
      titulo="Nómina"
      filtros={<SelectorEnlace etiqueta="Elegir mes" opciones={opcionesMes} elegido={elegido} />}
      datosHasta={meses.meses.at(-1) ?? null}
      descarga={conDescarga ? { href: `/nomina/descargar?mes=${elegido}`, etiqueta: "Planilla del mes en Excel" } : null}
    />
  );

  const cargadas = await cargarLineas(supabase, [elegido, anterior], unidades.nombre);
  if ("error" in cargadas) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        {encabezado(false)}
        <EstadoVacioAF4 titulo="No se pudieron leer los pagos">{cargadas.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const delMes = cargadas.lineas.filter((l) => l.periodo === elegido);
  const delAnterior = cargadas.lineas.filter((l) => l.periodo === anterior);
  const aResumen = (ls: typeof delMes) =>
    ls.map((l) => ({
      tipo: l.tipo,
      persona_id: l.personaId,
      unidad: l.unidad,
      total_bruto: l.bruto,
      neto: l.neto,
      seguro_social: l.seguroSocial,
      seguro_educativo: l.seguroEducativo,
      diferencia_calculo: l.diferencia,
    }));
  const r = resumirMes(aResumen(delMes), meses.comision[elegido] ?? 0);
  const previo: ResumenMes | null = meses.meses.includes(anterior) ? resumirMes(aResumen(delAnterior), meses.comision[anterior] ?? 0) : null;
  const variacion = variacionPct(r.costoTotal, previo?.costoTotal ?? null);
  const contra = mesCorto(anterior);
  // Un costo que sube es desfavorable; las personas no llevan juicio.
  const vs = (actual: number, antes: (x: ResumenMes) => number, sentido: Sentido = "menos-es-mejor"): ComparacionKpi[] =>
    previo ? [{ v: calcularVariacion(actual, antes(previo), sentido), contra }] : [];
  const nombreTienda = (u: string) => (u === UNIDAD_REPARTO ? "A distribuir (todas)" : u);

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      {encabezado(true)}

      <FilaKpiAF4>
        <KpiAF4
          titulo="Costo total"
          destacado
          tono={variacion !== null && variacion > ALERTA_VARIACION ? "warning" : "neutral"}
          valor={dineroKpi(r.costoTotal)}
          comparaciones={vs(r.costoTotal, (x) => x.costoTotal)}
          subtexto={r.comision ? `Incluye ${dinero(r.comision)} de comisión` : "USD · 1 USDT = 1 USD"}
        />
        <KpiAF4
          titulo="Planilla formal"
          valor={dineroKpi(r.formalBruto)}
          comparaciones={vs(r.formalBruto, (x) => x.formalBruto)}
          subtexto={`Neto ${dinero(r.formalNeto)} · seguros ${dinero(r.retenciones)}`}
        />
        <KpiAF4
          titulo="Externa (USDT)"
          valor={dineroKpi(r.externa)}
          comparaciones={vs(r.externa, (x) => x.externa)}
          subtexto={r.costoTotal ? `${fraccion(r.externa / r.costoTotal, { decimales: 0 })} del costo` : undefined}
        />
        <KpiAF4
          titulo="Personas"
          valor={entero(r.personas)}
          comparaciones={vs(r.personas, (x) => x.personas, "neutro")}
          subtexto={`${entero(r.personasFormal)} planilla · ${entero(r.personasExterna)} externas`}
        />
      </FilaKpiAF4>

      {r.noCuadran > 0 && (
        <KpiGroup titulo="Pendientes de datos">
          <KpiGrid compacta>
            <KpiCard compacta tono="warning" titulo="No cuadran con la fórmula" valor={entero(r.noCuadran)} subtexto="Pagos del mes" />
          </KpiGrid>
        </KpiGroup>
      )}

      {r.porTienda.length > 0 && (
        <GraficaBarrasAF4
          id="grafica-nomina-tienda"
          titulo="Costo por tienda"
          detalle={`${mesCorto(elegido)} · sin repartir A DISTRIBUIR · USD`}
          etiquetaEje="Tienda"
          alto={240}
          datos={r.porTienda.map((t) => ({ etiqueta: nombreTienda(t.unidad), formal: t.formal, externa: t.externa }))}
          series={[
            { clave: "formal", nombre: "Planilla formal", color: 1, apilar: "costo" },
            { clave: "externa", nombre: "Externa (USDT)", color: 2, apilar: "costo" },
          ]}
        />
      )}

      <section aria-labelledby="titulo-pagos" className="flex flex-col gap-2">
        <h2 id="titulo-pagos" className="text-sm font-semibold">
          Pagos <span className="font-normal text-muted-foreground">· {mesCorto(elegido)}</span>
        </h2>
        <TablaNomina filas={delMes} tiendas={unidades.opciones} puedeEscribir={puedeEscribir} />
      </section>
    </Pagina>
  );
}
