import { limitadoATiendas, SoloTodaLaEmpresa } from "@/components/finanzas/solo-toda-la-empresa";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { TablaComparacionAF4 } from "@/components/af4/tabla-comparacion-af4";
import { KpiCard, KpiGrid, KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { fechaCorta, hoyPanama, mesLargo } from "@/lib/af4/fecha";
import { anilloFoco } from "@/components/ui/field";
import { cargarLibroContador } from "@/lib/finanzas/cargar-libro-contador";
import { mesAnterior } from "@/lib/finanzas/cierre";
import { liquidacionItbms } from "@/lib/finanzas/libro-contador";
import { dinero, entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarCalendario } from "@/lib/finanzas/avisos-cierre";
import { ETIQUETA_ESTADO_OBLIGACION, filasCalendario, nombrePeriodoFiscal, type EstadoObligacion } from "@/lib/finanzas/calendario-fiscal";
import { createServiceClient } from "@/lib/supabase/server";
import { EditarObligacion, MarcaPresentada } from "./controles-fiscales";
import { cargarEerr } from "@/lib/finanzas/cargar-eerr";
import { total as totalMeses } from "@/lib/finanzas/eerr";
import { estimarRenta, TARIFA_RENTA, UMBRAL_CAIR } from "@/lib/finanzas/inventario-contable";
import { fraccion } from "@/lib/af4/formato";

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
  // El ITBMS que vence este mes es el del mes anterior (Formulario 430, el día 15).
  const mesItbms = mesAnterior(`${hoy.slice(0, 7)}-01`);
  // Renta del año (mejora 86): los meses cerrados del año en curso de la entidad de Panamá.
  const anio = hoy.slice(0, 4);
  const mesesRenta = Array.from({ length: Number(hoy.slice(5, 7)) - 1 }, (_, i) => `${anio}-${String(i + 1).padStart(2, "0")}-01`);
  const entidadPa = mesesRenta.length ? await supabase.from("fin_entidades").select("id").eq("codigo", "PA").maybeSingle() : null;
  const [cal, libro, eerrRenta] = await Promise.all([
    cargarCalendario(supabase),
    cargarLibroContador(supabase, mesItbms, null),
    mesesRenta.length ? cargarEerr(supabase, null, mesesRenta, { entidadId: (entidadPa?.data?.id as string | undefined) ?? null }) : Promise.resolve(null),
  ]);
  const renta = (() => {
    if (!eerrRenta || "error" in eerrRenta || !eerrRenta.eerr.meses.length) return null;
    const e = eerrRenta.eerr;
    const impuesto = e.secciones.find((x) => x.seccion === "impuesto_ganancias")?.efectoTotal ?? 0;
    const r = estimarRenta({
      meses: e.meses.length,
      ingresos: totalMeses(e.ingresosNetos),
      utilidadAntesImpuesto: totalMeses(e.resultadoNeto) + totalMeses(e.dividendos) - impuesto,
      registrado: -impuesto,
    });
    return r ? { ...r, meses: e.meses.length, registrado: -impuesto } : null;
  })();
  const itbms = "error" in libro ? null : liquidacionItbms(libro.movimientos, libro.ventas);
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

      {itbms && (
        <KpiGroup
          titulo={`ITBMS de ${mesLargo(mesItbms)} · estimado`}
          accion={
            <a href={`/api/exportar-libro-contador?periodo=${mesItbms.slice(0, 7)}`} className={`rounded text-xs font-medium underline-offset-2 hover:underline ${anilloFoco}`}>
              Libro para el contador
            </a>
          }
        >
          <KpiGrid compacta>
            <KpiCard compacta titulo="Débito (ventas facturadas)" valor={dinero(itbms.debito, "USD", { decimales: 2 })} subtexto={`${entero(itbms.ventas)} ventas con ITBMS`} />
            <KpiCard compacta titulo="Crédito (compras)" valor={dinero(itbms.credito, "USD", { decimales: 2 })} subtexto={`${entero(itbms.comprasConItbms)} documentos con ITBMS cargado`} />
            {itbms.aFavor > 0 ? (
              <KpiCard compacta titulo="Saldo a favor" tono="success" valor={dinero(itbms.aFavor, "USD", { decimales: 2 })} subtexto="Pasa al mes siguiente" />
            ) : (
              <KpiCard compacta titulo="A pagar" valor={dinero(itbms.aPagar, "USD", { decimales: 2 })} subtexto="Débito − crédito" />
            )}
            <KpiCard
              compacta
              titulo="Compras sin ITBMS cargado"
              tono={itbms.comprasSinItbms ? "warning" : "neutral"}
              valor={entero(itbms.comprasSinItbms)}
              subtexto={itbms.comprasSinItbms ? `${dinero(itbms.montoSinItbms)} que no suman crédito` : "Todo con su ITBMS"}
            />
          </KpiGrid>
        </KpiGroup>
      )}

      {renta && (
        <KpiGroup titulo={`Impuesto sobre la renta ${anio} · estimado con ${entero(renta.meses)} ${renta.meses === 1 ? "mes" : "meses"} cerrados · Panamá`}>
          <KpiGrid compacta>
            <KpiCard compacta titulo="Utilidad anualizada" valor={dinero(renta.utilidadAnual)} subtexto={`Ingresos anualizados ${dinero(renta.ingresosAnual)}`} />
            <KpiCard compacta titulo={`Tradicional (${fraccion(TARIFA_RENTA, { decimales: 0 })})`} valor={dinero(renta.tradicional)} subtexto="Sobre la utilidad antes del impuesto" />
            <KpiCard
              compacta
              titulo="CAIR"
              valor={renta.cair === null ? "No aplica" : dinero(renta.cair)}
              subtexto={renta.cair === null ? `Ingresos bajo ${dinero(UMBRAL_CAIR)}` : "4.67 % de los ingresos × 25 %"}
            />
            <KpiCard
              compacta
              titulo="Renta estimada del año"
              tono={renta.porRegistrar > 0 ? "warning" : "neutral"}
              valor={dinero(renta.estimado)}
              subtexto={`${renta.metodo === "cair" ? "Por el CAIR (el mayor)" : "Por el método tradicional"}${renta.tasaEfectiva !== null ? ` · ${fraccion(renta.tasaEfectiva, { decimales: 1 })} de la utilidad` : ""}`}
            />
            <KpiCard compacta titulo="Ya en el libro" valor={dinero(renta.registrado)} subtexto={renta.porRegistrar > 0 ? `Faltan ${dinero(renta.porRegistrar)}` : "Cubre el estimado"} />
          </KpiGrid>
          <p className="px-1 pt-2 text-xs text-muted-foreground">
            Lo que va del año anualizado; no es una declaración. Con ingresos sobre {dinero(UMBRAL_CAIR)} se paga el mayor entre el tradicional y el CAIR, salvo que la DGI autorice no aplicarlo. Confírmalo con el contador.
          </p>
        </KpiGroup>
      )}

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
