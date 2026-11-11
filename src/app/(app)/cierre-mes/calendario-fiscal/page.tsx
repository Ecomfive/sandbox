import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { TablaComparacionAF4 } from "@/components/af4/tabla-comparacion-af4";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { fechaCorta, hoyPanama } from "@/lib/af4/fecha";
import { dinero, entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarCalendario } from "@/lib/finanzas/avisos-cierre";
import { ETIQUETA_ESTADO_OBLIGACION, filasCalendario, nombrePeriodoFiscal, type EstadoObligacion } from "@/lib/finanzas/calendario-fiscal";
import { createServiceClient } from "@/lib/supabase/server";
import { EditarObligacion, MarcaPresentada } from "./controles-fiscales";

export const metadata = { title: "Calendario fiscal" };

export const dynamic = "force-dynamic";

const PUNTO: Record<EstadoObligacion, string> = { presentada: "bg-success", vencida: "bg-destructive", por_vencer: "bg-warning", pendiente: "bg-muted-foreground" };

function Estado({ estado, dias }: { estado: EstadoObligacion; dias: number }) {
  const extra = estado === "vencida" ? ` hace ${Math.abs(dias)} d` : estado === "por_vencer" ? (dias === 0 ? " hoy" : ` en ${dias} d`) : "";
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[estado]}`} />
      {ETIQUETA_ESTADO_OBLIGACION[estado]}
      {extra}
    </span>
  );
}

export default async function CalendarioFiscalPage() {
  const usuario = await requireModulo("cierre-mes");
  if (await limitadoATiendas()) return <SoloTodaLaEmpresa titulo="Cierre de mes" />;
  const supabase = createServiceClient();
  const hoy = hoyPanama();
  const cal = await cargarCalendario(supabase);
  const titulo = "Calendario fiscal";
  if ("error" in cal) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo={titulo} imprimir={false} />
        <EstadoVacioAF4 titulo="Falta la migración">{cal.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const puedeEscribir = !usuario.modulosSoloLectura.includes("cierre-mes");
  const filas = filasCalendario(cal.obligaciones, cal.presentaciones, hoy);
  const cuenta = (e: EstadoObligacion) => filas.filter((f) => f.estado === e).length;
  const proxima = filas.find((f) => f.estado === "por_vencer" || f.estado === "pendiente");

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo={titulo} imprimir={false} />
      <KpiGroup titulo="Obligaciones">
        <KpiGrid compacta>
          <KpiCard compacta titulo="Vencidas sin presentar" tono={cuenta("vencida") ? "destructive" : "neutral"} valor={entero(cuenta("vencida"))} />
          <KpiCard compacta titulo="Por vencer" tono={cuenta("por_vencer") ? "warning" : "neutral"} valor={entero(cuenta("por_vencer"))} />
          <KpiCard compacta titulo="Próximo vencimiento" valor={proxima ? fechaCorta(proxima.vence) : "—"} subtexto={proxima?.obligacion.nombre} />
          <KpiCard compacta titulo="Presentadas" tono="success" valor={entero(cuenta("presentada"))} />
        </KpiGrid>
      </KpiGroup>

      <TablaComparacionAF4
        id="titulo-calendario"
        titulo="Vencimientos"
        detalle={`${entero(filas.length)} vencimientos`}
        ariaLabel="Vencimientos del calendario fiscal"
        etiquetaConcepto="Obligación"
        columnas={[
          { clave: "periodo", etiqueta: "Período", numerica: false },
          { clave: "vence", etiqueta: "Vence", numerica: false },
          { clave: "estado", etiqueta: "Estado", numerica: false },
          { clave: "presentada", etiqueta: "Presentada", numerica: false },
          { clave: "accion", etiqueta: <span className="sr-only">Acción</span>, numerica: false },
        ]}
        filas={
          filas.length
            ? filas.map((f) => ({
                clave: `${f.obligacion.id}|${f.periodo}`,
                etiqueta: (
                  <span className="flex flex-col font-normal">
                    <span className="font-medium">{f.obligacion.nombre}</span>
                    {f.obligacion.entidad && <span className="text-xs text-muted-foreground">{f.obligacion.entidad}</span>}
                  </span>
                ),
                celdas: [
                  <span key="p" className="first-letter:uppercase inline-block">{nombrePeriodoFiscal(f.obligacion, f.periodo)}</span>,
                  fechaCorta(f.vence),
                  <Estado key="e" estado={f.estado} dias={f.dias} />,
                  f.presentacion
                    ? `${fechaCorta(f.presentacion.presentadoEn)}${f.presentacion.referencia ? ` · ${f.presentacion.referencia}` : ""}${f.presentacion.monto !== null ? ` · ${dinero(f.presentacion.monto, "USD", { decimales: 2 })}` : ""}`
                    : "—",
                  puedeEscribir ? (
                    <MarcaPresentada key="m" obligacionId={f.obligacion.id} periodo={f.periodo} nombre={f.obligacion.nombre} presentada={Boolean(f.presentacion)} hoy={hoy} />
                  ) : (
                    ""
                  ),
                ],
              }))
            : [{ clave: "vacio", etiqueta: <span className="font-normal text-muted-foreground">Sin obligaciones activas</span>, celdas: ["", "", "", "", ""] }]
        }
      />

      {puedeEscribir && (
        <MarcoAF4 id="titulo-obligaciones" titulo="Obligaciones y avisos" sinRelleno>
          <ul className="m-0 list-none divide-y divide-border p-0">
            {cal.obligaciones.map((o) => (
              <li key={o.id} className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
                <span className="flex min-w-48 flex-col text-sm">
                  <span className="font-medium">{o.nombre}</span>
                  <span className="text-xs text-muted-foreground">
                    {o.periodicidad === "mensual" ? "Mensual, el mes siguiente" : o.anioSiguiente ? "Anual, el año siguiente" : "Anual, el mismo año"}
                  </span>
                </span>
                <EditarObligacion o={o} />
              </li>
            ))}
          </ul>
        </MarcoAF4>
      )}
    </Pagina>
  );
}
