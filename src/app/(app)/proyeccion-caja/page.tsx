import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaEscenariosAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import type { Tono } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { diaMes } from "@/lib/af4/fecha";
import { dinero, dineroKpi, numero } from "@/lib/af4/formato";
import { desdeProyeccion } from "@/lib/af4/tabla-financiera";
import { calcularVariacion } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { guardarFotoSiFalta } from "@/lib/finanzas/cargar-proyeccion";
import { ESCENARIOS, filasTabla, sumarDias } from "@/lib/finanzas/proyeccion-caja";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarVista, leerParametros } from "./datos";
import { SupuestosProyeccion } from "./supuestos-proyeccion";
import { QuePasaSi } from "./que-pasa-si";
import { TablaAjustes } from "./tabla-ajustes";

export const metadata = { title: "Proyección de caja" };

export const dynamic = "force-dynamic";

const MODULO = "proyeccion-caja";
const tono = (v: number, minimo: number): Tono => (v < 0 ? "destructive" : v < minimo ? "warning" : "success");
/** Cada escenario con su color y su trazo: base continua, conservador a rayas, estrés punteado. */
const ESTILO = { base: { color: 2, trazo: "continuo" }, conservador: { color: 4, trazo: "rayas" }, estres: { color: 1, trazo: "puntos" } } as const;

export default async function ProyeccionCajaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo(MODULO);
  const { escenario, conDividendos } = leerParametros(await searchParams);
  const supabase = createServiceClient();
  const [vista, actualizado] = await Promise.all([cargarVista(supabase, escenario, conDividendos), ultimaActualizacionLibro(supabase)]);

  if ("error" in vista) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Proyección de caja" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo armar la proyección">{vista.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const { datos, activa, kpis } = vista;
  await guardarFotoSiFalta(supabase, vista.baseCompleta, usuario.id);

  const puedeEscribir = !usuario.modulosSoloLectura.includes(MODULO);
  const minimo = datos.config.cajaMinima;
  const sinCaja = datos.fuenteCaja === "sin_caja";
  const enlace = (e: string, d: boolean) => `/proyeccion-caja?${new URLSearchParams({ ...(e !== "base" ? { escenario: e } : {}), ...(d ? {} : { dividendos: "no" }) })}`;
  const salidaSemanal = activa.totalSalidas.reduce((a, b) => a + b, 0) / activa.semanas.length;
  const supuestos = {
    cajaMinima: minimo,
    cobroVencido: datos.config.probabilidades.cobroVencido,
    pagoVencido: datos.config.probabilidades.pagoVencido,
    pideCaja: datos.fuenteCaja !== "saldos",
    cajaManual: datos.config.cajaManual?.monto ?? null,
  };
  const ultima = activa.semanas[activa.semanas.length - 1];
  const cajaFinal = activa.cajaFinal[activa.cajaFinal.length - 1] ?? 0;
  const bajo = new Set(kpis.bajoMinimo);
  const etiquetaSemana = (i: number) => `S${i + 1}`;
  const rango = `${diaMes(activa.semanas[0])} al ${diaMes(sumarDias(ultima, 6))} · USD`;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Proyección de caja"
        filtros={
          <>
            <ControlSegmentado
              etiqueta="Elegir escenario"
              opciones={ESCENARIOS.map((e) => ({ valor: e.clave, etiqueta: e.etiqueta, href: enlace(e.clave, conDividendos) }))}
              elegido={escenario}
            />
            <ControlSegmentado
              etiqueta="Dividendos"
              opciones={[
                { valor: "con", etiqueta: "Con dividendos", href: enlace(escenario, true) },
                { valor: "sin", etiqueta: "Sin dividendos", href: enlace(escenario, false) },
              ]}
              elegido={conDividendos ? "con" : "sin"}
            />
          </>
        }
        actualizado={actualizado}
        acciones={<SupuestosProyeccion valores={supuestos} puedeEscribir={puedeEscribir} />}
        descarga={{ href: `/proyeccion-caja/exportar?${new URLSearchParams({ escenario, ...(conDividendos ? {} : { dividendos: "no" }) })}` }}
      />

      {sinCaja && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-warning" aria-hidden="true" />
            Sin saldos iniciales en el Flujo de caja: la proyección parte de cero hasta cargar la caja de hoy.
          </span>
          <SupuestosProyeccion valores={supuestos} puedeEscribir={puedeEscribir} etiqueta="Cargar la caja de hoy" />
        </div>
      )}

      <FilaKpiAF4>
        <KpiAF4
          titulo="Caja hoy"
          tono={sinCaja ? "warning" : tono(kpis.cajaHoy, minimo)}
          valor={sinCaja ? "—" : dineroKpi(kpis.cajaHoy)}
          subtexto={datos.fuenteCaja === "manual" ? "Cargada a mano" : datos.fuenteCaja === "saldos" ? "Según el Flujo de caja" : undefined}
          href={datos.fuenteCaja === "saldos" ? "/flujo-caja/saldos" : undefined}
        />
        <KpiAF4
          titulo={`Caja al cierre de ${etiquetaSemana(activa.semanas.length - 1)}`}
          destacado
          tono={tono(cajaFinal, minimo)}
          valor={dineroKpi(cajaFinal)}
          serie={activa.cajaFinal}
          comparaciones={sinCaja ? [] : [{ v: calcularVariacion(cajaFinal, kpis.cajaHoy), contra: "hoy", modo: "dinero" }]}
        />
        <KpiAF4
          titulo="Caja mínima proyectada"
          tono={tono(kpis.cajaMinima, minimo)}
          valor={dineroKpi(kpis.cajaMinima)}
          comparaciones={[{ v: calcularVariacion(kpis.cajaMinima, minimo), contra: "el mínimo", modo: "dinero" }]}
          subtexto={`${etiquetaSemana(kpis.semanaMinima)} · semana del ${diaMes(activa.semanas[kpis.semanaMinima])}`}
        />
        <KpiAF4
          titulo="Caja negativa"
          tono={kpis.semanaNegativa === null ? "success" : "destructive"}
          valor={kpis.semanaNegativa === null ? "No en 13 semanas" : `En ${kpis.semanaNegativa + 1} ${kpis.semanaNegativa === 0 ? "semana" : "semanas"}`}
          subtexto={kpis.semanaNegativa === null ? undefined : `Semana del ${diaMes(activa.semanas[kpis.semanaNegativa])}`}
        />
        <KpiAF4
          titulo="Cobertura"
          valor={kpis.cobertura === null || sinCaja ? "—" : `${numero(kpis.cobertura)} semanas`}
          subtexto={`Salidas ${dinero(salidaSemanal)} por semana`}
        />
        <KpiAF4
          titulo="Bajo la caja mínima"
          tono={kpis.bajoMinimo.length ? "destructive" : "success"}
          valor={`${kpis.bajoMinimo.length} de ${activa.semanas.length} semanas`}
          subtexto={`Caja mínima ${dinero(minimo)}`}
        />
        {datos.supuestos.porPagarVencido > 0 && (
          <KpiAF4 titulo="Por pagar vencido" tono="warning" valor={dineroKpi(datos.supuestos.porPagarVencido)} href="/cuentas-por-pagar" />
        )}
      </FilaKpiAF4>

      <GraficaEscenariosAF4
        id="grafica-proyeccion"
        titulo="Caja al cierre de cada semana"
        detalle={rango}
        etiquetas={activa.semanas.map((s, i) => `${etiquetaSemana(i)} · ${diaMes(s)}`)}
        escenarios={ESCENARIOS.map((e) => ({
          clave: e.clave,
          nombre: e.etiqueta,
          valores: vista.porEscenario[e.clave].cajaFinal,
          color: ESTILO[e.clave].color,
          trazo: ESTILO[e.clave].trazo,
        }))}
        activo={escenario}
        minimo={minimo}
        referencias={[{ valor: minimo, etiqueta: "Caja mínima", tipo: "limite" }]}
      />

      <TablaFinanciera
        id="tabla-proyeccion"
        titulo="Semana a semana"
        detalle={`${ESCENARIOS.find((e) => e.clave === escenario)?.etiqueta ?? ""} · ${rango}`}
        etiquetaConcepto="Concepto"
        columnas={activa.semanas.map((s, i) => ({
          clave: s,
          etiqueta: etiquetaSemana(i),
          detalle: diaMes(s),
          marca: bajo.has(i) ? { tono: "destructive" as const, texto: "Por debajo de la caja mínima" } : undefined,
        }))}
        filas={desdeProyeccion(filasTabla(activa))}
        desplegado="nada"
        ariaLabel="Proyección de caja por semana"
      />

      <QuePasaSi
        lineas={conDividendos ? datos.lineas : datos.lineas.filter((l) => l.concepto !== "dividendos")}
        semanas={datos.semanas}
        cajaHoy={datos.cajaHoy}
        cajaMinima={minimo}
      />

      <TablaAjustes filas={datos.ajustes} semanas={datos.semanas} puedeEscribir={puedeEscribir} />
    </Pagina>
  );
}
