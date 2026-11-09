import Link from "next/link";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { CLASE_FILA_AF4, claseCeldaAF4, claseNumeroAF4 } from "@/components/af4/estilos-af4";
import { EstiloImpresionAF4 } from "@/components/af4/informe-af4";
import { FilaKpiAF4, KpiAF4 } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { SelectorEnlace } from "@/components/af4/selector-enlace";
import { TablaMetas } from "@/components/finanzas/metas-plan";
import { TablaTechoPauta } from "@/components/finanzas/techo-pauta";
import { cargarMetasMes } from "@/lib/finanzas/cargar-planificacion";
import { claseEncabezadoColumna, claseFilaEncabezado } from "@/components/tabla/estilos-tabla";
import { DesplazableX } from "@/components/ui/desplazable-x";
import { anilloFoco } from "@/components/ui/field";
import { KpiGroup } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { fechaCorta, hoyPanama, leerPeriodo, mesCorto, mesLargo, sumarMeses } from "@/lib/af4/fecha";
import { dias, dinero, porcentaje } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { cargarDatosComite, puedeEditarComite } from "@/lib/finanzas/cargar-comite";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import {
  ETIQUETA_SEMAFORO,
  INDICADORES,
  TONO_SEMAFORO,
  costoFinanciero,
  decisionesDelComite,
  diaDeCierre,
  estadoCierre,
  interesesPorMes,
  progreso,
  semaforo,
  serieCostoFinanciero,
  serieDio,
  serieEntrega,
  serieMargenEbitda,
  seriePauta,
  serieSinEstado,
  tasaContractual,
  type ClaveIndicador,
  type DefIndicador,
  type EstadoCierre,
  type PuntoSerie,
  type Semaforo,
} from "@/lib/finanzas/comite";
import { pautaPorTienda, sobreTecho } from "@/lib/finanzas/pauta";
import { veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDespachos } from "@/lib/monday/cargar";
import { resumenPorMes, type ResumenMes } from "@/lib/monday/causas";
import { cargarConciliacionQbo } from "@/lib/quickbooks/cargar";
import { TOLERANCIA_PCT, type Semaforo as SemaforoQbo } from "@/lib/quickbooks/conciliacion";
import { ActaComite } from "./acta-comite";
import { MetasComite, TechoPautaAjuste } from "./ajustes-comite";

export const metadata = { title: "Comité de dirección" };

export const dynamic = "force-dynamic";

const TITULO = "Comité de dirección";
const MESES_TABLA = 6;

interface Indicador {
  def: DefIndicador;
  meta: number;
  partida: number | null;
  serie: PuntoSerie[];
  valor: number | null;
  /** El valor ya escrito (el cierre se lee como «Sí · día 8»). */
  texto: string;
  estado: Semaforo;
  /** Qué falta para calcularlo, o una precisión del dato. */
  nota: string | null;
}

const PUNTO: Record<Semaforo, string> = { cumple: "bg-success", mejora: "bg-warning", lejos: "bg-destructive", sin_datos: "bg-muted-foreground" };

function formatear(d: DefIndicador, v: number | null): string {
  if (v === null) return "—";
  if (d.formato === "dias") return dias(v);
  if (d.formato === "dia") return `Día ${Math.round(v)}`;
  return porcentaje(v);
}

function textoMeta(d: DefIndicador, meta: number): string {
  if (d.formato === "dia") return `Publicado el día ${meta}`;
  const signo = d.sentido === "minimo" ? "≥" : d.estricto ? "<" : "≤";
  return `${signo} ${formatear(d, meta)}`;
}

const TEXTO_CIERRE: Record<EstadoCierre, (dia: number | null) => string> = {
  a_tiempo: (dia) => `Sí · día ${dia}`,
  tarde: (dia) => `No · día ${dia}`,
  pendiente: () => "Pendiente",
  vencido: () => "No publicado",
};

/** Reemplaza los valores de una serie por los de Monday en los meses que los tienen (`undefined` = sin datos de Monday). */
function mezclarMonday(serie: PuntoSerie[] | null, meses: string[], monday: (m: string) => number | null | undefined): PuntoSerie[] | null {
  const hay = meses.some((m) => monday(m) !== undefined);
  if (!hay) return serie;
  return meses.map((m) => {
    const v = monday(m);
    return { periodo: m, valor: v !== undefined ? v : (serie?.find((p) => p.periodo === m)?.valor ?? null) };
  });
}

const PUNTO_QBO: Record<SemaforoQbo, string> = { verde: "bg-success", ambar: "bg-warning", rojo: "bg-destructive", sin_datos: "bg-muted-foreground" };

function SinComite({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo={TITULO} imprimir={false} />
      <EstadoVacioAF4 titulo={titulo}>{children}</EstadoVacioAF4>
    </Pagina>
  );
}

export default async function ComitePage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("panel-financiero");
  if (!veTodaLaEmpresa(await cargarTiendasPermitidas())) return <SinComite titulo="El comité de dirección es de toda la empresa" />;
  const supabase = createServiceClient();
  const hoy = hoyPanama();
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;
  const mesCerrado = sumarMeses(mesEnCurso, -1);
  const opcionesMes = Array.from({ length: 13 }, (_, i) => sumarMeses(mesEnCurso, -i));
  const pedido = leerPeriodo((await searchParams).mes);
  const mes = pedido && opcionesMes.includes(pedido) ? pedido : mesCerrado;
  const mesesComite = Array.from({ length: 12 }, (_, i) => sumarMeses(mes, i - 11));
  const [datos, puedeEditar, metas, despachosMonday, qbo] = await Promise.all([
    cargarDatosComite(supabase, mes, mesEnCurso, hoy),
    puedeEditarComite(usuario),
    // Metas por tienda del plan anual aprobado (Planificación, mejora 16).
    cargarMetasMes(supabase, null, mes),
    cargarDespachos(supabase, mesesComite[0], mes, null),
    cargarConciliacionQbo(supabase, mesesComite),
  ]);
  const despachos = "error" in despachosMonday ? [] : despachosMonday;
  const { meses, config } = datos;
  const cfg = config.config;
  const base = "error" in datos.base ? null : datos.base;

  const armar = (clave: ClaveIndicador, serie: PuntoSerie[] | null, falta: string | null, aviso: string | null = null, valorPropio?: number | null): Indicador => {
    const def = INDICADORES.find((d) => d.clave === clave)!;
    const s = serie ?? meses.map((m) => ({ periodo: m, valor: null }));
    const valor = valorPropio !== undefined ? valorPropio : (s.find((p) => p.periodo === mes)?.valor ?? null);
    const meta = cfg.metas[clave];
    const partida = cfg.partida[clave];
    return { def, meta, partida, serie: s, valor, texto: formatear(def, valor), estado: semaforo(def, valor, meta, partida), nota: valor === null ? falta : aviso };
  };

  // 1. Margen EBITDA ajustado
  const margen = armar(
    "margen_ebitda",
    datos.eerr ? serieMargenEbitda(datos.eerr.eerr, meses) : null,
    "Falta el libro de movimientos",
    datos.eerr && !datos.eerr.sinIntercompania ? "Sin la migración 0929 no se pueden sacar las partidas intercompañía" : null,
  );

  // 2–3 y 6. Tiendas: pauta, entrega y pedidos sin estado
  const faltaTiendas = "error" in datos.base ? datos.base.error : base && !base.propias.length ? "Elegí las tiendas propias en Ajustes del comité" : null;
  const pauta = armar("pauta_ventas", base && base.propias.length ? seriePauta(base.filas, meses, base.propias) : null, faltaTiendas);
  // Tasa de entrega y pedidos sin estado: de Monday en los meses que tienen despachos; si no, de Ventas por tienda.
  const mondayPropias = base && base.propias.length ? resumenPorMes(despachos, hoy, new Set(base.propias)) : new Map<string, ResumenMes>();
  const mondayTodas = resumenPorMes(despachos, hoy);
  const serieEntregaBase = base && base.propias.length ? serieEntrega(base.filas, meses, base.propias) : null;
  const serieEntregaFinal = mezclarMonday(serieEntregaBase, meses, (m) => (mondayPropias.get(m)?.despachados ? mondayPropias.get(m)!.tasaEntrega : undefined));
  const entrega = armar("tasa_entrega", serieEntregaFinal, faltaTiendas, mondayPropias.get(mes)?.despachados ? "Fuente: Monday" : null);
  const sinEstado = base ? serieSinEstado(base.filas, meses) : null;
  const serieSinEstadoFinal = mezclarMonday(sinEstado?.serie ?? null, meses, (m) => (mondayTodas.get(m)?.elegibles ? mondayTodas.get(m)!.pctSinEstado : undefined));
  const pedidos = armar("pedidos_sin_estado", serieSinEstadoFinal, "error" in datos.base ? datos.base.error : "Sin pedidos enviados hace más de 10 días", mondayTodas.get(mes)?.elegibles ? "Fuente: Monday (despachados con estado a los 10 días)" : null);
  const ventasQbo = "error" in qbo ? null : qbo.comparaciones.filter((c) => c.concepto === "ventas" && qbo.mesesConQbo.has(c.periodo));

  // 4. Días de inventario
  const inv = { ...datos.inventario.valores };
  let notaDio: string | null = null;
  if (inv[mes] == null && mes === mesCerrado && datos.inventario.vivo !== null) {
    inv[mes] = datos.inventario.vivo;
    notaDio = "Con el inventario de hoy: falta la foto al cierre del mes";
  }
  if (mes === mesEnCurso) notaDio = "Mes en curso: el costo de lo vendido todavía es parcial";
  const dio = armar(
    "dio",
    datos.costoVendido ? serieDio(meses, inv, datos.costoVendido) : null,
    !datos.costoVendido ? "Falta la rentabilidad (migración 0915)" : datos.inventario.faltaMigracion ? "Falta el inventario al cierre (migración 0930)" : "Sin inventario valorizado de ese mes",
    notaDio,
  );

  // 5. Costo financiero mezclado (los últimos 3 meses hasta el del comité)
  const intereses = datos.eerr ? interesesPorMes(datos.eerr.eerr) : {};
  const tramo = meses.slice(-3);
  const cf = datos.eerr ? costoFinanciero(tramo, intereses, datos.deuda?.porMes ?? null) : { valor: null, falta: "Falta el libro de movimientos", intereses: 0, deudaPromedio: 0 };
  const costo = armar("costo_financiero", datos.eerr ? serieCostoFinanciero(meses, intereses, datos.deuda?.porMes ?? null) : null, cf.falta, null, cf.valor);
  const contractual = datos.deuda ? tasaContractual(datos.deuda.lineas) : null;

  // 7. Cierre publicado el día 10
  const diaLimite = cfg.metas.cierre_dia;
  const serieCierre: PuntoSerie[] = meses.map((m) => ({ periodo: m, valor: datos.cierres ? diaDeCierre(m, datos.cierres[m] ?? null) : null }));
  const estadoMes = datos.cierres ? estadoCierre(mes, datos.cierres[mes] ?? null, diaLimite, hoy) : null;
  const cierreDef = INDICADORES.find((d) => d.clave === "cierre_dia")!;
  const diaMes = serieCierre.find((p) => p.periodo === mes)?.valor ?? null;
  const cierre: Indicador = {
    def: cierreDef,
    meta: diaLimite,
    partida: null,
    serie: serieCierre,
    valor: diaMes,
    texto: estadoMes ? TEXTO_CIERRE[estadoMes](diaMes) : "—",
    estado: !estadoMes ? "sin_datos" : estadoMes === "a_tiempo" ? "cumple" : estadoMes === "pendiente" ? "sin_datos" : "lejos",
    nota: datos.cierres ? null : "Falta el cierre de mes (migración 0914)",
  };

  const indicadores = [margen, pauta, entrega, dio, costo, pedidos, cierre];
  const enMeta = indicadores.filter((i) => i.estado === "cumple").length;
  const mesesTabla = meses.slice(-MESES_TABLA);

  // Techo de pauta
  const nombres = base ? Object.fromEntries(base.unidades.map((u) => [u.id, u.nombre])) : {};
  const techoMes = base ? pautaPorTienda(base.filas, [mes], base.propias, base.techo, hoy) : [];
  const techoCurso = base && mes !== mesEnCurso ? pautaPorTienda(base.filas, [mesEnCurso], base.propias, base.techo, hoy) : [];
  const sobreMes = techoMes.filter(sobreTecho);
  const acta = datos.acta ? decisionesDelComite(datos.acta, mes) : null;
  const tiendasAjuste = base
    ? base.unidades
        .filter((u) => u.clase === "tienda" && !u.nombre.toUpperCase().startsWith("SIN ASIGNAR"))
        .map((u) => ({ id: u.id, nombre: u.nombre, propia: base.propias.includes(u.id), techo: base.techo.porTienda[u.id] ?? null }))
    : [];
  const unidad = (d: DefIndicador) => (d.formato === "porcentaje" ? "%" : d.formato === "dias" ? "días" : "día del mes");
  const enlace = `underline underline-offset-2 ${anilloFoco}`;

  return (
    <Pagina ancho="ancha" className="informe-af4 flex flex-col gap-6">
      <EstiloImpresionAF4 pie={`${TITULO} · ${mesLargo(mes)}`} />
      <EncabezadoAF4
        titulo={TITULO}
        filtros={
          <SelectorEnlace
            etiqueta="Elegir el mes del comité"
            opciones={opcionesMes.map((m) => ({ valor: m, etiqueta: m === mesEnCurso ? `${mesCorto(m)} (en curso)` : mesCorto(m), href: `/panel-financiero/comite?mes=${m.slice(0, 7)}` }))}
            elegido={mes}
          />
        }
        datosHasta={mes}
        actualizado={config.actualizadoEn}
      />

      <KpiGroup titulo={`Indicadores del comité · ${mesLargo(mes)} · ${enMeta} de ${indicadores.length} en meta`}>
        <FilaKpiAF4>
          {indicadores.map((i) => (
            <KpiAF4
              key={i.def.clave}
              titulo={i.def.etiqueta}
              valor={i.texto}
              tono={TONO_SEMAFORO[i.estado]}
              serie={i.def.formato === "dia" ? undefined : i.serie.some((p) => p.valor !== null) ? i.serie.map((p) => p.valor ?? Number.NaN) : undefined}
              subtexto={`Meta ${textoMeta(i.def, i.meta)}${i.partida !== null ? ` · partida ${formatear(i.def, i.partida)}` : ""}`}
              href={i.def.href}
            />
          ))}
        </FilaKpiAF4>
      </KpiGroup>

      <MarcoAF4 id="titulo-tablero" titulo="Tablero" detalle={`Últimos ${MESES_TABLA} meses · meta a 6 meses`} sinRelleno>
        <DesplazableX ariaLabel="Tablero del comité" className="rounded-b-xl">
          <table className="tabla-datos w-full text-[13px]">
            <caption className="sr-only">Los 7 indicadores del comité por mes, con su meta, la partida, el avance y de dónde sale cada uno</caption>
            <thead>
              <tr className={claseFilaEncabezado}>
                <th scope="col" className={`${claseEncabezadoColumna} text-left`}>
                  Indicador
                </th>
                {mesesTabla.map((m) => (
                  <th key={m} scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                    {mesCorto(m)}
                  </th>
                ))}
                <th scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                  Meta
                </th>
                <th scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                  Partida
                </th>
                <th scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                  Avance
                </th>
                <th scope="col" className={`${claseEncabezadoColumna} text-left whitespace-nowrap`}>
                  Estado
                </th>
                <th scope="col" className={`${claseEncabezadoColumna} text-left`}>
                  De dónde sale
                </th>
              </tr>
            </thead>
            <tbody>
              {indicadores.map((i) => {
                const av = i.def.formato === "dia" ? null : progreso(i.def, i.valor, i.meta, i.partida);
                return (
                  <tr key={i.def.clave} className={CLASE_FILA_AF4.seccion}>
                    <th scope="row" className={`${claseCeldaAF4} text-left font-medium`}>
                      <span className="flex items-center gap-2">
                        <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[i.estado]}`} />
                        {i.def.etiqueta}
                      </span>
                    </th>
                    {mesesTabla.map((m) => {
                      const v = i.serie.find((p) => p.periodo === m)?.valor ?? null;
                      const texto = i.def.formato === "dia" ? (v === null ? (m === mes ? i.texto : "—") : `Día ${v}`) : formatear(i.def, v);
                      return (
                        <td key={m} className={`${claseNumeroAF4} ${m === mes ? "font-semibold" : "font-normal"}`}>
                          {texto}
                        </td>
                      );
                    })}
                    <td className={claseNumeroAF4}>{textoMeta(i.def, i.meta).replace(/^Publicado el día /, "Día ")}</td>
                    <td className={claseNumeroAF4}>{formatear(i.def, i.partida)}</td>
                    <td className={claseNumeroAF4}>{av === null ? "—" : porcentaje(Math.max(-999, Math.min(999, av)), { decimales: 0 })}</td>
                    <td className={`${claseCeldaAF4} text-left`}>{ETIQUETA_SEMAFORO[i.estado]}</td>
                    <td className={`${claseCeldaAF4} min-w-64 text-left whitespace-normal text-muted-foreground`}>
                      <Link href={i.def.href} className={enlace}>
                        {i.def.fuente}
                      </Link>
                      {i.nota && (
                        <span className="mt-0.5 flex items-center gap-1.5 text-foreground-soft">
                          <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                          {i.nota}
                        </span>
                      )}
                      {i.def.clave === "costo_financiero" && (cf.deudaPromedio > 0 || contractual !== null) && (
                        <span className="mt-0.5 block">
                          {[cf.deudaPromedio > 0 ? `Últimos 3 meses: intereses ${dinero(cf.intereses)} sobre deuda promedio ${dinero(cf.deudaPromedio)}` : null, contractual !== null ? `tasa contractual ${porcentaje(contractual)}` : null]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </DesplazableX>
      </MarcoAF4>

      {ventasQbo && ventasQbo.length > 0 && (
        <MarcoAF4 id="titulo-comite-qbo" titulo="Ventas contra QuickBooks" detalle={`Desviación < ${TOLERANCIA_PCT} % en cada mes cerrado`} sinRelleno>
          <DesplazableX ariaLabel="Ventas netas del portal contra QuickBooks por mes" className="rounded-b-xl">
            <table className="tabla-datos w-full text-[13px]">
              <caption className="sr-only">Ventas netas del portal contra QuickBooks por mes, con la desviación</caption>
              <thead>
                <tr className={claseFilaEncabezado}>
                  <th scope="col" className={`${claseEncabezadoColumna} text-left`}>
                    Concepto
                  </th>
                  {mesesTabla.map((m) => (
                    <th key={m} scope="col" className={`${claseEncabezadoColumna} text-right whitespace-nowrap`}>
                      {mesCorto(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className={CLASE_FILA_AF4.seccion}>
                  <th scope="row" className={`${claseCeldaAF4} text-left font-medium`}>
                    <Link href="/cierre-mes/quickbooks" className={enlace}>
                      Desviación ventas portal vs QuickBooks
                    </Link>
                  </th>
                  {mesesTabla.map((m) => {
                    const c = ventasQbo.find((x) => x.periodo === m);
                    return (
                      <td key={m} className={`${claseNumeroAF4} ${m === mes ? "font-semibold" : "font-normal"}`}>
                        {c ? (
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO_QBO[c.semaforo]}`} />
                            {porcentaje(c.desviacion, { decimales: 2, conSigno: true })}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </DesplazableX>
        </MarcoAF4>
      )}

      {base ? (
        <div className="grid gap-6 2xl:grid-cols-2">
          <TablaTechoPauta
            id="titulo-techo-mes"
            titulo={`Techo de pauta por tienda · ${mesCorto(mes)}${mes === mesEnCurso ? " (proyectado)" : ""}`}
            detalle={`${sobreMes.length} sobre el techo · USD`}
            filas={techoMes}
            nombres={nombres}
          />
          {techoCurso.length > 0 && (
            <TablaTechoPauta
              id="titulo-techo-curso"
              titulo={`Techo de pauta por tienda · ${mesCorto(mesEnCurso)} (proyectado)`}
              detalle={`Al ${fechaCorta(hoy)} · USD`}
              filas={techoCurso}
              nombres={nombres}
            />
          )}
        </div>
      ) : (
        <EstadoVacioAF4 titulo="Sin el techo de pauta por tienda">{"error" in datos.base ? datos.base.error : null}</EstadoVacioAF4>
      )}

      {metas && !("error" in metas) && !("sinPlan" in metas) ? (
        <TablaMetas
          id="titulo-metas-comite"
          titulo={`Metas por tienda · ${mesCorto(mes)}`}
          detalle={`Plan «${metas.version.nombre}» · real · meta`}
          filas={metas.delMes}
          total={metas.totalMes}
          nombres={metas.nombres}
          accion={usuario.modulos.includes("planificacion") ? { href: `/planificacion/metas?mes=${mes.slice(0, 7)}`, etiqueta: "Ver metas" } : undefined}
        />
      ) : (
        usuario.modulos.includes("planificacion") && (
          <EstadoVacioAF4 titulo={`Sin metas por tienda para ${mes.slice(0, 4)}`} accion={{ href: `/planificacion/plan-anual?anio=${mes.slice(0, 4)}`, etiqueta: "Aprobar el plan anual" }} compacto />
        )
      )}

      <MarcoAF4 id="titulo-acta" titulo="Acta del comité" detalle={mesLargo(mes)}>
        {acta ? (
          <ActaComite periodo={mes} delMes={acta.delMes} seguimiento={acta.seguimiento} puedeEditar={puedeEditar} />
        ) : (
          <p className="text-sm text-muted-foreground">Falta correr la migración 0942 (comité de dirección) en Supabase.</p>
        )}
      </MarcoAF4>

      {puedeEditar && (
        <div className="grid gap-6 xl:grid-cols-2 print:hidden">
          <MarcoAF4
            id="titulo-metas"
            titulo="Metas y tiendas propias"
            detalle={config.actualizadoEn ? `Guardadas el ${fechaCorta(config.actualizadoEn.slice(0, 10))}` : undefined}
          >
            <MetasComite
              indicadores={INDICADORES.map((d) => ({ clave: d.clave, etiqueta: d.etiqueta, unidad: unidad(d), meta: cfg.metas[d.clave], partida: cfg.partida[d.clave], conPartida: d.conPartida }))}
              tiendas={tiendasAjuste}
            />
          </MarcoAF4>
          {base && (
            <MarcoAF4 id="titulo-techo-ajuste" titulo="Techo de pauta">
              <TechoPautaAjuste general={base.techo.general} tiendas={tiendasAjuste} />
            </MarcoAF4>
          )}
        </div>
      )}
    </Pagina>
  );
}
