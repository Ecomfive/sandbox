import { Suspense } from "react";
import { ColaAtencion } from "@/components/hoy/cola-atencion";
import { PosicionCajaPanel } from "@/components/finanzas/posicion-caja-panel";
import { ResumenComitePanel } from "@/components/finanzas/resumen-comite-panel";
import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaBarrasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4, type ComparacionKpi } from "@/components/af4/kpi-af4";
import { KpiGroup, type Tono } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { hoyPanama, mesCorto, rangoMeses } from "@/lib/af4/fecha";
import { dinero, dineroKpi, numero, porcentaje } from "@/lib/af4/formato";
import { calcularVariacion } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { situacion, type Bien } from "@/lib/finanzas/bienes-uso";
import { cargarEerr } from "@/lib/finanzas/cargar-eerr";
import { cargarMesesCierre } from "@/lib/finanzas/cargar-cierre";
import { ReaperturasCierre } from "@/components/finanzas/reaperturas-cierre";
import { cargarAlertasPanel } from "@/lib/tareas/alertas";
import { cargarFlujo } from "@/lib/finanzas/cargar-flujo";
import { cargarTasasMes } from "@/lib/finanzas/cargar-entidades";
import { contextoEntidad } from "@/lib/finanzas/contexto-entidad";
import { ENTIDAD_BASE, conParametros, parametrosVista, tasaDelMes } from "@/lib/finanzas/entidades";
import { SelectorEntidad } from "@/components/finanzas/selector-entidad";
import { filaPanel, mesAnterior, nombreMes } from "@/lib/finanzas/cierre";
import { cargarPresupuestoVigente } from "@/lib/finanzas/cargar-presupuesto";
import { sobre, ultimosMeses } from "@/lib/finanzas/eerr";
import { resumirFlujo } from "@/lib/finanzas/flujo";
import { UNIDAD_SIN_ASIGNAR } from "@/lib/finanzas/libro-excel";
import {
  colaCierre,
  pesoNomina,
  resumirCartera,
  resumirResultados,
  vsPresupuestoAcumulado,
  type PendienteCierre,
  type TotalCartera,
} from "@/lib/finanzas/panel";
import { cargarValoracion } from "@/lib/finanzas/valoracion";
import { createServiceClient } from "@/lib/supabase/server";
import { BotonComentarioCifra } from "@/components/finanzas/comentarios/boton-comentario";
import { cargarHilos } from "@/lib/finanzas/cargar-comentarios";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";

export const metadata = { title: "Panel financiero" };

export const dynamic = "force-dynamic";


/** Los totales de las carteras (de una entidad, en dólares, o de todo). */
async function leerCartera(supabase: ReturnType<typeof createServiceClient>, entidadId: string | null): Promise<{ error: unknown; data: TotalCartera[] }> {
  if (!entidadId) {
    const r = await supabase.from("fin_cartera_totales").select("clase, saldo, vencido, tramo_90_mas, documentos");
    return { error: r.error, data: (r.data ?? []) as TotalCartera[] };
  }
  const r = await supabase.rpc("fin_cartera_entidad_al", { p_corte: null });
  return { error: r.error, data: ((r.data ?? []) as (TotalCartera & { entidad_id: string })[]).filter((f) => f.entidad_id === entidadId) };
}

/** Una consulta que solo se hace si la persona puede abrir ese módulo (si no, ni se pide). */
const si = <T,>(puede: boolean, consulta: () => PromiseLike<T>): Promise<T | null> =>
  puede ? Promise.resolve(consulta()) : Promise.resolve(null);

export default async function PanelFinancieroPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const usuario = await requireModulo("panel-financiero");
  // Permisos por tienda: con tiendas limitadas solo se ve el resultado de esas tiendas (caja, cartera, nómina y activo
  // son de toda la empresa).
  const permitidas = await cargarTiendasPermitidas();
  const todaLaEmpresa = veTodaLaEmpresa(permitidas);
  const modulosVisibles = todaLaEmpresa ? usuario.modulos : usuario.modulos.filter((m) => m === "estado-resultados" || m === "panel-financiero");
  const puede = (m: string) => modulosVisibles.includes(m);
  const supabase = createServiceClient();
  const hoy = hoyPanama();
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;
  const ventana = ultimosMeses(hoy, 12);
  const mesCierre = mesAnterior(mesEnCurso);
  const sp = await searchParams;
  const { presupuesto: presupuestoPedido } = sp;
  const ctx = await contextoEntidad(supabase, sp);
  const { vista } = ctx;
  const entidadId = vista.entidad?.id ?? null;
  // Nómina y bienes de uso son de Panamá: no se muestran en otra entidad.
  const conPanama = !vista.entidad || vista.entidad.codigo === ENTIDAD_BASE;
  const etiquetaVista = [vista.entidad?.razon_social ?? (ctx.opciones.length ? "Consolidado" : null), vista.moneda].filter(Boolean).join(" · ");

  const [eerrR, flujoR, carteraR, nominaR, bienesR, sinTipoR, sinTiendaR, repartoR, mapeoR, vencidosR, cierreR, valoracion, pptoR, alertasR, hilos, actualizado] = await Promise.all([
    si(puede("estado-resultados"), () => cargarEerr(supabase, null, ventana, { entidadId, local: vista.local, unidades: permitidas })),
    si(puede("flujo-caja"), () => cargarFlujo(supabase, { entidadId, monedaLocal: vista.local ? vista.moneda : null })),
    si(puede("cuentas-por-cobrar") || puede("cuentas-por-pagar"), () => leerCartera(supabase, entidadId)),
    si(puede("nomina") && conPanama, () => supabase.from("nom_costo_mensual").select("periodo, bruto").gte("periodo", ventana[0])),
    si(puede("bienes-de-uso") && conPanama, () =>
      supabase.from("fin_bienes_uso").select("fecha_alta, importe, meses_vida, valor_residual, fecha_baja"),
    ),
    si(puede("libro-movimientos"), () => supabase.from("fin_movimientos_sin_tipo").select("movimientos")),
    si(puede("libro-movimientos"), () =>
      supabase
        .from("fin_movimientos")
        .select("id, fin_unidades!inner(nombre)", { count: "exact", head: true })
        .eq("fin_unidades.nombre", UNIDAD_SIN_ASIGNAR),
    ),
    si(puede("estado-resultados"), () =>
      entidadId
        ? supabase.from("fin_reparto_pendiente").select("periodo").eq("entidad_id", entidadId).gte("periodo", ventana[0])
        : supabase.from("fin_reparto_pendiente").select("periodo").gte("periodo", ventana[0]),
    ),
    si(puede("costos-mercancia"), () =>
      supabase.from("fin_costos_mapeo").select("id", { count: "exact", head: true }).neq("estado", "mapeado"),
    ),
    si(puede("cuentas-por-cobrar"), () =>
      supabase.from("fin_cartera_saldos").select("id", { count: "exact", head: true }).eq("clase", "cobrar").eq("vencido", true),
    ),
    si(puede("cierre-mes"), () => cargarMesesCierre(supabase, [mesCierre])),
    cargarValoracion(supabase),
    si(puede("estado-resultados") && puede("presupuesto"), () => cargarPresupuestoVigente(supabase, Number(hoy.slice(0, 4)), presupuestoPedido)),
    cargarAlertasPanel(supabase, modulosVisibles),
    cargarHilos(supabase, "panel-financiero", mesEnCurso.slice(0, 7)),
    ultimaActualizacionLibro(supabase),
  ]);
  const multiplo = valoracion.supuestos.multiplo;

  // Resultados
  const eerr = eerrR && !("error" in eerrR) ? eerrR : null;
  const res = eerr ? resumirResultados(eerr.eerr, eerr.conDatos, mesEnCurso, multiplo) : null;
  const vsPpto = eerr && pptoR ? vsPresupuestoAcumulado(eerr.eerr, eerr.conDatos, mesEnCurso, pptoR.lineas) : null;
  const puntos = eerr
    ? eerr.eerr.meses.map((m) => ({ periodo: m, ingresos: eerr.eerr.ingresosNetos[m] ?? 0, ebitda: eerr.eerr.ebitda[m] ?? 0 }))
    : [];

  // Caja
  const flujo = flujoR && !("error" in flujoR) ? flujoR : null;
  const mesesFlujo = flujo ? flujo.disponibles.filter((m) => m <= mesEnCurso).slice(-12) : [];
  const caja = flujo && mesesFlujo.length ? resumirFlujo(flujo.filas, flujo.saldos, flujo.cuentas, mesesFlujo, flujo.conversion) : null;
  const operativo = caja?.estado.bloques.find((b) => b.bloque === "operativo");
  const flujoOperativo = operativo ? Object.values(operativo.neto).reduce((a, b) => a + b, 0) : 0;

  // Carteras
  const carteraUsd = carteraR && !carteraR.error ? resumirCartera(carteraR.data) : null;
  // En la moneda de la entidad: los dólares de la cartera, al cierre de este mes (o el último que haya).
  const tasaCartera = vista.local ? tasaDelMes(await cargarTasasMes(supabase, [vista.moneda]), vista.moneda, mesEnCurso, "cierre") : 1;
  const cartera =
    carteraUsd && tasaCartera
      ? (Object.fromEntries(Object.entries(carteraUsd).map(([k, v]) => [k, k === "documentosCobrar" ? v : v * tasaCartera])) as typeof carteraUsd)
      : null;

  // Nómina del último mes cerrado
  const nominaPorMes = new Map<string, number>();
  for (const f of nominaR && !nominaR.error ? (nominaR.data ?? []) : []) {
    const m = String(f.periodo).slice(0, 10);
    nominaPorMes.set(m, (nominaPorMes.get(m) ?? 0) + Number(f.bruto));
  }
  const mesNomina = res?.ultimoMes && nominaPorMes.has(res.ultimoMes) ? res.ultimoMes : [...nominaPorMes.keys()].filter((m) => m < mesEnCurso).sort().pop();
  const costoNomina = mesNomina ? (nominaPorMes.get(mesNomina) ?? 0) : null;
  const ingresosMesNomina = mesNomina && eerr ? (eerr.eerr.ingresosNetos[mesNomina] ?? 0) : 0;

  // Bienes de uso al cierre del mes en curso
  const bienes = bienesR && !bienesR.error ? ((bienesR.data ?? []) as Record<string, unknown>[]) : null;
  const activo = bienes
    ? bienes.reduce<{ neto: number; delMes: number }>(
        (a, b) => {
          const s = situacion(
            {
              fecha_alta: String(b.fecha_alta),
              importe: Number(b.importe),
              meses_vida: Number(b.meses_vida),
              valor_residual: Number(b.valor_residual ?? 0),
              fecha_baja: (b.fecha_baja as string | null) ?? null,
            } satisfies Bien,
            mesEnCurso,
          );
          return { neto: a.neto + s.neto, delMes: a.delMes + s.delMes };
        },
        { neto: 0, delMes: 0 },
      )
    : null;

  const cierre = cierreR && !("error" in cierreR) ? cierreR[0] : null;
  const filaCierre = cierre ? filaPanel(cierre.estado, cierre.tareas) : null;
  const pendientes: PendienteCierre[] = [
    ...(filaCierre
      ? [
          {
            clave: "cierre-mes",
            modulo: "cierre-mes",
            titulo: `Cierre de ${nombreMes(mesCierre)}`,
            descripcion: filaCierre.descripcion,
            cantidad: filaCierre.cantidad,
            href: `/cierre-mes/${mesCierre.slice(0, 7)}`,
            accion: filaCierre.accion,
          },
        ]
      : []),
    ...alertasR,
    {
      clave: "sin-tipo",
      modulo: "libro-movimientos",
      titulo: "Movimientos sin tipo",
      descripcion: "No entran al Estado de resultados hasta clasificarlos",
      cantidad: (sinTipoR?.data ?? []).reduce((a, r) => a + Number(r.movimientos), 0),
      href: "/libro-movimientos/pendientes",
      accion: "Clasificar",
    },
    {
      clave: "sin-tienda",
      modulo: "libro-movimientos",
      titulo: "Movimientos sin tienda",
      descripcion: "Cargados a «SIN ASIGNAR»",
      cantidad: sinTiendaR?.count ?? 0,
      href: "/libro-movimientos/pendientes",
      accion: "Asignar",
    },
    {
      clave: "reparto",
      modulo: "estado-resultados",
      titulo: "Meses sin base de reparto",
      descripcion: "Lo cargado a A DISTRIBUIR no llega a las tiendas",
      cantidad: new Set((repartoR?.data ?? []).map((r) => String(r.periodo))).size,
      href: "/estado-resultados",
      accion: "Revisar",
    },
    {
      clave: "saldos",
      modulo: "flujo-caja",
      titulo: "Cuentas sin saldo inicial",
      descripcion: "Sin saldo no se puede calcular la caja de esa cuenta",
      cantidad: caja?.cuentasSinSaldo ?? 0,
      href: "/flujo-caja/saldos",
      accion: "Cargar saldo",
    },
    {
      clave: "cobrar-vencido",
      modulo: "cuentas-por-cobrar",
      titulo: "Documentos por cobrar vencidos",
      descripcion: cartera ? `${dinero(cartera.cobrarVencido, vista.moneda)} vencidos` : "",
      cantidad: vencidosR?.count ?? 0,
      href: "/cuentas-por-cobrar",
      accion: "Cobrar",
    },
    {
      clave: "mapeo",
      modulo: "costos-mercancia",
      titulo: "Productos de Dropi sin costo confirmado",
      descripcion: "Sus márgenes salen del costo puesto a mano",
      cantidad: mapeoR?.count ?? 0,
      href: "/costos-mercancia/mapeo",
      accion: "Mapear",
    },
  ];
  const cola = colaCierre(pendientes, modulosVisibles);
  // Comentarios del Panel: un hilo por bloque de indicadores, del mes en curso.
  const periodoComentarios = mesEnCurso.slice(0, 7);
  const comentar = (clave: string, etiqueta: string) => (
    <BotonComentarioCifra pagina="panel-financiero" periodo={periodoComentarios} clave={clave} etiqueta={etiqueta} cantidad={hilos[clave] ?? 0} />
  );

  const nada = !res && !caja && !cartera && costoNomina === null && !activo;

  // Lo que muestra la barra de contexto y las comparaciones del último mes cerrado.
  const mesesConMov = eerr ? eerr.eerr.meses.filter((m) => eerr.conDatos.has(m)) : [];
  const cerrados = mesesConMov.filter((m) => m < mesEnCurso);
  const mesPrevio = res?.ultimoMes ? mesesConMov[mesesConMov.indexOf(res.ultimoMes) - 1] : undefined;
  const serie = (pm: Record<string, number>) => (cerrados.length > 1 ? cerrados.map((m) => pm[m] ?? 0) : undefined);
  const datosHasta = mesesConMov.filter((m) => m <= mesEnCurso).at(-1) ?? null;
  const vsMesPrevio = (actual: number, de: Record<string, number>): ComparacionKpi[] =>
    eerr && mesPrevio ? [{ v: calcularVariacion(actual, de[mesPrevio] ?? 0), contra: mesCorto(mesPrevio) }] : [];
  const vsPresupuesto = (c: { real: number; presupuesto: number }): ComparacionKpi[] => [{ v: calcularVariacion(c.real, c.presupuesto), contra: "presupuesto" }];
  const signoTono = (v: number): Tono => (v < 0 ? "destructive" : "neutral");

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Panel financiero"
        filtros={
          <>
            <SelectorEntidad ruta="/panel-financiero" opciones={ctx.opciones} vista={vista} otros={{ presupuesto: typeof presupuestoPedido === "string" ? presupuestoPedido : undefined }} />
            {pptoR && pptoR.opciones.length > 1 && (
              <ControlSegmentado
                etiqueta="Elegir presupuesto"
                opciones={pptoR.opciones.map((o) => ({
                  valor: o.id,
                  etiqueta: o.nombre,
                  href: conParametros("/panel-financiero", { ...(ctx.opciones.length ? parametrosVista(vista) : {}), presupuesto: o.id }),
                }))}
                elegido={pptoR.presupuesto.id}
              />
            )}
          </>
        }
        datosHasta={datosHasta}
        actualizado={actualizado}
      />

      {nada && (
        <EstadoVacioAF4 titulo="Todavía no hay datos financieros cargados" accion={{ href: "/libro-movimientos/importar", etiqueta: "Importar el libro" }}>
          Correr las migraciones 0900–0908 y cargar los Excel del libro.
        </EstadoVacioAF4>
      )}

      {res && res.meses > 0 && (
        <KpiGroup titulo={`Resultados · últimos ${res.meses} meses · ${etiquetaVista}`} accion={comentar(`resultados-${entidadId ?? "todo"}`, "Resultados")}>
          <FilaKpiAF4>
            <KpiAF4 titulo="Ingresos netos" valor={dineroKpi(res.ingresos, vista.moneda)} serie={eerr ? serie(eerr.eerr.ingresosNetos) : undefined} href="/estado-resultados" moneda={vista.moneda} />
            <KpiAF4
              titulo="EBITDA"
              destacado
              tono={signoTono(res.ebitda)}
              valor={dineroKpi(res.ebitda, vista.moneda)}
              serie={eerr ? serie(eerr.eerr.ebitda) : undefined}
              subtexto={`Margen ${porcentaje(res.margenEbitda)}`}
              href="/estado-resultados"
              moneda={vista.moneda}
            />
            {res.ultimoMes && eerr && (
              <KpiAF4
                titulo={`EBITDA ${mesCorto(res.ultimoMes)}`}
                tono={signoTono(res.ebitdaUltimoMes)}
                valor={dineroKpi(res.ebitdaUltimoMes, vista.moneda)}
                comparaciones={vsMesPrevio(res.ebitdaUltimoMes, eerr.eerr.ebitda)}
                moneda={vista.moneda}
              />
            )}
            <KpiAF4 titulo="Resultado neto" tono={signoTono(res.resultadoNeto)} valor={dineroKpi(res.resultadoNeto, vista.moneda)} moneda={vista.moneda} />
            <KpiAF4
              titulo="Valor de empresa"
              valor={dineroKpi(res.valorEmpresa, vista.moneda)}
              subtexto={`EBITDA anual ${dinero(res.ebitdaAnual, vista.moneda)} × ${multiplo}`}
              href={puede("estado-resultados") ? "/panel-financiero/valoracion" : undefined}
              moneda={vista.moneda}
            />
          </FilaKpiAF4>
        </KpiGroup>
      )}

      {vsPpto && pptoR && (
        <KpiGroup titulo={`Año a la fecha vs ${pptoR.presupuesto.nombre} · ${rangoMeses(vsPpto.meses)} · USD`} accion={comentar("presupuesto", "Año a la fecha vs presupuesto")}>
          <FilaKpiAF4>
            <KpiAF4
              titulo="Ingresos"
              valor={dineroKpi(vsPpto.ingresos.real)}
              comparaciones={vsPresupuesto(vsPpto.ingresos)}
              subtexto={`Presupuesto ${dinero(vsPpto.ingresos.presupuesto)}`}
              href={`/presupuesto/${pptoR.presupuesto.id}`}
            />
            <KpiAF4
              titulo="EBITDA"
              tono={signoTono(vsPpto.ebitda.real)}
              valor={dineroKpi(vsPpto.ebitda.real)}
              comparaciones={vsPresupuesto(vsPpto.ebitda)}
              subtexto={`Presupuesto ${dinero(vsPpto.ebitda.presupuesto)}`}
              href={`/presupuesto/${pptoR.presupuesto.id}`}
            />
          </FilaKpiAF4>
        </KpiGroup>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        {eerr && puntos.some((p) => p.ingresos || p.ebitda) && (
          <GraficaBarrasAF4
            id="grafica-panel"
            titulo="Ingresos y EBITDA por mes"
            detalle={etiquetaVista}
            moneda={vista.moneda}
            alto={340}
            formatoDerecha="porcentaje"
            datos={puntos.map((p) => ({ etiqueta: mesCorto(p.periodo), ingresos: p.ingresos, ebitda: p.ebitda, margen: sobre(p.ebitda, p.ingresos) }))}
            series={[
              { clave: "ingresos", nombre: "Ingresos netos", color: 1 },
              { clave: "ebitda", nombre: "EBITDA", color: 2 },
              { clave: "margen", nombre: "Margen EBITDA", color: 3, forma: "linea", trazo: "rayas", derecha: true },
            ]}
          />
        )}
        <div className="flex min-w-0 flex-col gap-6">
          <ColaAtencion filas={cola} />
          {puede("tesoreria") && (
            <Suspense fallback={null}>
              <PosicionCajaPanel />
            </Suspense>
          )}
        </div>
      </div>

      {todaLaEmpresa && (
        <Suspense fallback={null}>
          <ResumenComitePanel />
        </Suspense>
      )}

      {(caja || cartera) && (
        <KpiGroup titulo={`Caja y capital de trabajo · ${etiquetaVista}`} accion={comentar(`caja-${entidadId ?? "todo"}`, "Caja y capital de trabajo")}>
          <FilaKpiAF4>
            {caja && (
              <>
                <KpiAF4
                  titulo="Caja al cierre"
                  valor={caja.conSaldos ? dineroKpi(caja.cajaFinal, vista.moneda) : "—"}
                  subtexto={caja.conSaldos ? (mesesFlujo.length ? mesCorto(mesesFlujo[mesesFlujo.length - 1]) : undefined) : "Faltan saldos iniciales"}
                  tono={caja.conSaldos ? signoTono(caja.cajaFinal) : "warning"}
                  href={caja.conSaldos ? "/flujo-caja" : "/flujo-caja/saldos"}
                  moneda={vista.moneda}
                />
                <KpiAF4 titulo="Meses de caja" valor={caja.mesesDeCaja === null ? "—" : numero(caja.mesesDeCaja)} />
                <KpiAF4
                  titulo={`Flujo operativo · ${mesesFlujo.length} meses`}
                  tono={signoTono(flujoOperativo)}
                  valor={dineroKpi(flujoOperativo, vista.moneda)}
                  href="/flujo-caja"
                  moneda={vista.moneda}
                />
              </>
            )}
            {cartera && (
              <>
                {puede("cuentas-por-cobrar") && (
                  <KpiAF4
                    titulo="Por cobrar"
                    valor={dineroKpi(cartera.porCobrar, vista.moneda)}
                    subtexto={`${dinero(cartera.cobrarVencido, vista.moneda)} vencido`}
                    tono={cartera.cobrarVencido > 0 ? "warning" : "neutral"}
                    href="/cuentas-por-cobrar"
                    moneda={vista.moneda}
                  />
                )}
                {puede("cuentas-por-pagar") && (
                  <KpiAF4
                    titulo="Por pagar"
                    valor={dineroKpi(cartera.porPagar, vista.moneda)}
                    subtexto={`${dinero(cartera.pagarVencido, vista.moneda)} vencido`}
                    tono={cartera.pagarVencido > 0 ? "warning" : "neutral"}
                    href="/cuentas-por-pagar"
                    moneda={vista.moneda}
                  />
                )}
                {puede("cuentas-por-cobrar") && puede("cuentas-por-pagar") && (
                  <KpiAF4 titulo="Cobrar − pagar" tono={signoTono(cartera.neto)} valor={dineroKpi(cartera.neto, vista.moneda)} moneda={vista.moneda} />
                )}
              </>
            )}
          </FilaKpiAF4>
        </KpiGroup>
      )}

      {(costoNomina !== null || activo) && (
        <KpiGroup titulo="Personas y activo fijo · USD" accion={comentar("personas-activo", "Personas y activo fijo")}>
          <FilaKpiAF4>
            {costoNomina !== null && mesNomina && (
              <KpiAF4
                titulo={`Nómina ${mesCorto(mesNomina)}`}
                valor={dineroKpi(costoNomina)}
                subtexto={ingresosMesNomina > 0 ? `${porcentaje(pesoNomina(costoNomina, ingresosMesNomina))} de los ingresos` : undefined}
                href="/nomina"
              />
            )}
            {activo && (
              <>
                <KpiAF4 titulo="Activo fijo neto" valor={dineroKpi(activo.neto)} href="/bienes-de-uso" />
                <KpiAF4 titulo={`Depreciación ${mesCorto(mesEnCurso)}`} valor={dineroKpi(activo.delMes)} />
              </>
            )}
          </FilaKpiAF4>
        </KpiGroup>
      )}
      {puede("cierre-mes") && <ReaperturasCierre />}
    </Pagina>
  );
}
