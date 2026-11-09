import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarMesesCierre, nombresDePersonas, primerMesDelLibro } from "@/lib/finanzas/cargar-cierre";
import { hoyPanama, mesEnCursoPanama, mesLargo, mesMedio } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { avance, colorDelMes, mesAnterior, rangoMeses } from "@/lib/finanzas/cierre";
import { cargarConfigCierre } from "@/lib/finanzas/cargar-cierre-control";
import { atrasoTarea, fechaObjetivo, textoPlazo } from "@/lib/finanzas/cierre-control";
import { createServiceClient } from "@/lib/supabase/server";
import { TablaCierres, type FilaCierreMes } from "./tabla-cierres";

export const metadata = { title: "Cierre de mes" };

export const dynamic = "force-dynamic";

/** Cuántos meses hacia atrás se listan. */
const MESES_LISTA = 12;

export default async function CierreMesPage() {
  await requireModulo("cierre-mes");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Cierre de mes" />;
  const supabase = createServiceClient();
  const ultimo = mesAnterior(mesEnCursoPanama());
  const primero = await primerMesDelLibro(supabase);
  const meses = primero ? rangoMeses(primero, ultimo).slice(-MESES_LISTA) : [];
  const [datos, { config }] = await Promise.all([cargarMesesCierre(supabase, meses), cargarConfigCierre(supabase)]);
  const hoy = hoyPanama();
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Cierre de mes" oculto />
        <EstadoVacioAF4 titulo="No se pudieron leer los cierres">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const nombres = await nombresDePersonas(supabase, datos.map((m) => m.cierre?.cerrado_por));
  const filas: FilaCierreMes[] = datos
    .map((m) => {
      const a = avance(m.tareas);
      const objetivo = fechaObjetivo(m.periodo, config.diaHabil);
      const plazo = atrasoTarea(m.estado === "cerrado", objetivo, hoy);
      return {
        objetivo,
        plazo: textoPlazo(plazo).replace("Atrasada", "Atrasado"),
        atrasado: plazo.atraso === "vencida",
        periodo: m.periodo,
        mes: mesLargo(m.periodo),
        estado: m.estado,
        listas: a.listas,
        total: a.total,
        porResolver: m.estado === "cerrado" ? 0 : m.tareas.filter((t) => t.bloquea).length,
        color: m.estado === "cerrado" ? ("verde" as const) : colorDelMes(m.tareas),
        cerradoEn: m.estado === "cerrado" ? (m.cierre?.cerrado_en ?? null) : null,
        cerradoPor: m.estado === "cerrado" && m.cierre?.cerrado_por ? (nombres.get(m.cierre.cerrado_por) ?? null) : null,
      };
    })
    .reverse();

  const cerrados = datos.filter((m) => m.estado === "cerrado");
  const ultimoCerrado = cerrados.at(-1)?.periodo;
  const sinCerrar = datos.filter((m) => m.estado !== "cerrado" && (!ultimoCerrado || m.periodo > ultimoCerrado));
  const enRevision = datos.filter((m) => m.estado === "en_revision").length;
  const atrasados = filas.filter((f) => f.atrasado).length;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Cierre de mes" datosHasta={ultimo} imprimir={false} />
      {meses.length > 0 && (
        <KpiGroup titulo={`Cierres · últimos ${entero(meses.length)} meses`}>
          <KpiGrid compacta>
            <KpiCard compacta titulo="Último mes cerrado" valor={ultimoCerrado ? mesMedio(ultimoCerrado) : "—"} href={ultimoCerrado ? `/cierre-mes/${ultimoCerrado.slice(0, 7)}` : undefined} />
            <KpiCard
              compacta
              titulo="Meses sin cerrar"
              tono={sinCerrar.length > 1 ? "warning" : "neutral"}
              valor={entero(sinCerrar.length)}
              subtexto={sinCerrar.length ? `Desde ${mesMedio(sinCerrar[0].periodo)}` : undefined}
              href={sinCerrar.length ? `/cierre-mes/${sinCerrar[0].periodo.slice(0, 7)}` : undefined}
            />
            <KpiCard compacta titulo="En revisión" tono={enRevision ? "warning" : "neutral"} valor={entero(enRevision)} />
            <KpiCard compacta titulo="Atrasados" tono={atrasados ? "destructive" : "neutral"} valor={entero(atrasados)} subtexto={`Objetivo: día hábil ${config.diaHabil}`} />
          </KpiGrid>
        </KpiGroup>
      )}
      <TablaCierres filas={filas} />
    </Pagina>
  );
}
