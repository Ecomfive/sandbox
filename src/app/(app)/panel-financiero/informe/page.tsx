import { ControlPeriodo } from "@/components/af4/control-periodo";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { EstiloImpresionAF4, PortadaInformeAF4, SeccionInformeAF4 } from "@/components/af4/informe-af4";
import { FilaKpiAF4, KpiAF4, type ComparacionKpi } from "@/components/af4/kpi-af4";
import { TablaComparacionAF4, type FilaComparacionAF4 } from "@/components/af4/tabla-comparacion-af4";
import { Variacion } from "@/components/af4/variacion";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import type { Tono } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { fechaCorta, hoyPanama, leerPeriodo, mesCorto, mesLargo, mesMedio } from "@/lib/af4/fecha";
import { dinero, dineroKpi, porcentaje, puntos } from "@/lib/af4/formato";
import type { PeriodoAF4 } from "@/lib/af4/periodo";
import { calcularVariacion, type Sentido, type Variacion as DatosVariacion } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { cargarEerr, unidadesEerr } from "@/lib/finanzas/cargar-eerr";
import { cargarPresupuestoVigente } from "@/lib/finanzas/cargar-presupuesto";
import { ultimosMeses, variacion, type Seccion } from "@/lib/finanzas/eerr";
import {
  accionesDelMes,
  causasPrincipales,
  cifrasDelMes,
  desempenoVsPresupuesto,
  desviosPorTipo,
  implicancias,
  tiendaDelMes,
  type TiendaMes,
} from "@/lib/finanzas/informe";
import { UNIDAD_SIN_ASIGNAR } from "@/lib/finanzas/libro-excel";
import { cargarValoracion } from "@/lib/finanzas/valoracion";
import { createServiceClient } from "@/lib/supabase/server";
import { CopiarInforme } from "./copiar-informe";
import { NotasMes } from "@/components/finanzas/notas-mes";
import { cargarNotaMes } from "@/lib/finanzas/cargar-notas";
import { ExplicacionInforme } from "./explicacion-informe";
import { configAnthropic } from "@/lib/finanzas/explicacion-ia";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";

export const metadata = { title: "Informe mensual" };

export const dynamic = "force-dynamic";

const TITULO = "Informe mensual";
const SECCIONES_INFORME = ["Desempeño", "Qué lo explica", "Qué significa", "Qué hacer"];

const usd = (v: number) => dinero(v);
const conSigno = (v: number) => dinero(v, "USD", { conSigno: true });
const pct = (v: number | null) => (v === null ? "—" : porcentaje(v, { conSigno: true }));
const pts = (a: number | null, b: number | null) => (a === null || b === null ? "—" : puntos(a - b));
const signoTono = (v: number): Tono => (v < 0 ? "destructive" : "neutral");
/** En ingresos y resultados, más es mejor; en costos y gastos, menos. */
const sentidoDe = (s: Seccion): Sentido => (s === "ingresos" ? "mas-es-mejor" : "menos-es-mejor");

/** Una variación con el juicio que ya trae el cálculo del informe (el presupuesto sabe si un desvío es favorable). */
const conJuicio = (v: DatosVariacion, favorable: boolean | null): DatosVariacion => ({ ...v, favorable });

function SinInforme({ mensaje, accion }: { mensaje: string; accion?: { href: string; etiqueta: string } }) {
  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoPagina titulo={TITULO} oculto />
      <EstadoVacioAF4 titulo={mensaje} accion={accion} />
    </Pagina>
  );
}

export default async function InformeMensualPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const usuario = await requireModulo("panel-financiero");
  if (!usuario.modulos.includes("estado-resultados")) {
    return <SinInforme mensaje="El informe se arma con el Estado de resultados: pide acceso a ese módulo." />;
  }
  if (!veTodaLaEmpresa(await cargarTiendasPermitidas())) {
    return <SinInforme mensaje="El informe es de toda la empresa: con tiendas limitadas, mira el Estado de resultados de tus tiendas." accion={{ href: "/estado-resultados", etiqueta: "Ir al Estado de resultados" }} />;
  }
  const supabase = createServiceClient();
  const puedeEditar = usuario.modulos.includes("estado-resultados") && !usuario.modulosSoloLectura.includes("estado-resultados");
  const hoy = hoyPanama();
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;
  const ventana = ultimosMeses(hoy, 13);
  const sp = await searchParams;
  const presupuestoPedido = sp.presupuesto;
  // El mes se elige con `?periodo=AAAA-MM` (como el resto del portal); `?mes=` sigue funcionando.
  const mesPedido = leerPeriodo(sp.periodo) ?? leerPeriodo(sp.mes);

  const [consolidado, unidadesR, valoracion, actualizado] = await Promise.all([
    cargarEerr(supabase, null, ventana),
    unidadesEerr(supabase),
    cargarValoracion(supabase),
    ultimaActualizacionLibro(supabase),
  ]);
  const multiplo = valoracion.supuestos.multiplo;
  if ("error" in consolidado) {
    return (
      <SinInforme
        mensaje="Todavía no hay un libro de movimientos para armar el informe"
        accion={{ href: "/libro-movimientos/importar", etiqueta: "Importar el libro" }}
      />
    );
  }
  const { eerr, conDatos } = consolidado;
  // Meses que se pueden informar: con datos y con un mes anterior con datos; el mes en curso no (está abierto).
  const informables = eerr.meses.filter((m, i) => m < mesEnCurso && conDatos.has(m) && i > 0 && conDatos.has(eerr.meses[i - 1]));
  if (!informables.length) {
    return <SinInforme mensaje="Hacen falta dos meses cerrados con movimientos para armar el informe" />;
  }
  // Sin pedir un mes, el último que ya tiene sus ingresos: un mes con los gastos cargados pero sin las ventas todavía
  // (el libro llega por partes) mostraría una caída que no es. Ese mes se puede elegir igual; sale como «sin ventas».
  const sinVentas = (m: string) => (eerr.ingresosNetos[m] ?? 0) <= 0;
  const mes = mesPedido && informables.includes(mesPedido) ? mesPedido : (informables.filter((m) => !sinVentas(m)).at(-1) ?? informables[informables.length - 1]);
  const nota = await cargarNotaMes(supabase, mes);
  const puedeNotas = usuario.modulos.includes("estado-resultados") && !usuario.modulosSoloLectura.includes("estado-resultados");
  const anterior = eerr.meses[eerr.meses.indexOf(mes) - 1];

  const tiendasR = "error" in unidadesR ? [] : unidadesR.unidades.filter((u) => u.clase === "tienda");
  const conPresupuesto = usuario.modulos.includes("presupuesto");
  const [porTienda, sinTipoR, sinTiendaR, repartoR, ppto, tiposR, explicacionR] = await Promise.all([
    Promise.all(tiendasR.map((u) => cargarEerr(supabase, u.id, [anterior, mes]).then((r) => ({ u, r })))),
    supabase.from("fin_movimientos_sin_tipo").select("movimientos").eq("periodo", mes),
    supabase
      .from("fin_movimientos")
      .select("id, fin_unidades!inner(nombre)", { count: "exact", head: true })
      .eq("fin_unidades.nombre", UNIDAD_SIN_ASIGNAR)
      .eq("periodo", mes),
    supabase.from("fin_reparto_pendiente").select("movimientos").eq("periodo", mes),
    conPresupuesto ? cargarPresupuestoVigente(supabase, Number(mes.slice(0, 4)), presupuestoPedido) : Promise.resolve(null),
    conPresupuesto ? supabase.from("fin_tipos").select("id, nombre") : Promise.resolve(null),
    supabase.from("fin_informes_explicacion").select("texto").eq("periodo", mes).maybeSingle(),
  ]);
  const explicacion = explicacionR.error ? null : ((explicacionR.data?.texto as string | undefined) ?? null);
  const nombresTipo = Object.fromEntries(((tiposR?.data ?? []) as { id: string; nombre: string }[]).map((t) => [t.id, t.nombre]));
  // Solo si el presupuesto tiene algo para ese mes (un presupuesto del año sin líneas no cuenta).
  const pptoMes = ppto && ppto.lineas.some((l) => l.periodo === mes) ? ppto : null;
  const desempeno = pptoMes ? desempenoVsPresupuesto(eerr, pptoMes.lineas, mes) : [];
  const desvios = pptoMes ? desviosPorTipo(eerr, pptoMes.lineas, nombresTipo, mes) : [];
  const desvioDe = (seccion: string, tipo: string) => desvios.find((d) => d.seccion === seccion && d.tipo === tipo);
  const desviosPrincipales = desvios.filter((d) => Math.abs(d.impacto) >= 0.5).slice(0, 6);

  const actual = cifrasDelMes(eerr, mes);
  const previo = cifrasDelMes(eerr, anterior);
  const causas = causasPrincipales(eerr, mes, anterior);
  const tiendas: TiendaMes[] = porTienda
    .filter(({ r }) => !("error" in r))
    .map(({ u, r }) => tiendaDelMes(u.nombre, (r as { eerr: typeof eerr }).eerr, mes, anterior))
    .filter((t) => t.ingresos !== 0 || t.ebitda !== 0)
    .sort((a, b) => b.ebitda - a.ebitda);
  const imp = implicancias(actual, previo, multiplo);
  const pendientes = [
    { titulo: "Movimientos sin tipo", cantidad: (sinTipoR.data ?? []).reduce((a, r) => a + Number(r.movimientos), 0) },
    { titulo: "Movimientos sin tienda", cantidad: sinTiendaR.count ?? 0 },
    { titulo: "Gastos a repartir sin base de envíos", cantidad: (repartoR.data ?? []).reduce((a, r) => a + Number(r.movimientos), 0) },
  ];
  const acciones = accionesDelMes(actual, previo, tiendas, pendientes, desvios);
  const varEbitda = variacion(actual.ebitda, previo.ebitda);
  const varIngresos = variacion(actual.ingresos, previo.ingresos);

  const texto = [
    `Informe financiero · ${mesCorto(mes)} (vs. ${mesCorto(anterior)}) · USD`,
    "",
    "1. Desempeño",
    `- Ingresos netos: ${usd(actual.ingresos)} (${pct(varIngresos)})`,
    `- Margen bruto: ${usd(actual.margenBruto)} · ${porcentaje(actual.margenBrutoPct)} (${pts(actual.margenBrutoPct, previo.margenBrutoPct)})`,
    `- EBITDA: ${usd(actual.ebitda)} · ${porcentaje(actual.margenEbitdaPct)} (${pct(varEbitda)})`,
    `- Resultado neto: ${usd(actual.resultadoNeto)}`,
    ...(explicacion ? ["", explicacion] : []),
    ...(pptoMes
      ? [
          `- Contra ${pptoMes.presupuesto.nombre}: ${desempeno
            .map((d) => `${d.etiqueta.replace(" (sin dividendos)", "")} ${usd(d.acumulado.presupuesto)} (${conSigno(d.acumulado.diferencia)}, ${pct(d.acumulado.pct)})`)
            .join(" · ")}`,
        ]
      : []),
    "",
    "2. Qué lo explica",
    ...causas.map((c) => {
      const d = desvioDe(c.seccion, c.tipo);
      return `- ${c.tipo} (${c.etiqueta}): ${usd(c.anterior)} → ${usd(c.actual)}, ${c.impacto >= 0 ? "suma" : "resta"} ${usd(Math.abs(c.impacto))}${d ? ` · presupuesto ${usd(d.presupuesto)} (${conSigno(d.diferencia)})` : ""}`;
    }),
    ...(desviosPrincipales.length
      ? ["", "Contra el presupuesto:", ...desviosPrincipales.map((d) => `- ${d.tipo} (${d.etiqueta}): ${usd(d.real)} vs ${usd(d.presupuesto)}, ${d.impacto >= 0 ? "suma" : "resta"} ${usd(Math.abs(d.impacto))}`)]
      : []),
    ...(tiendas.length ? ["", "Por tienda (EBITDA):", ...tiendas.map((t) => `- ${t.nombre}: ${usd(t.ebitda)} (antes ${usd(t.ebitdaAnterior)})`)] : []),
    "",
    "3. Qué significa",
    `- Al ritmo de este mes: EBITDA anual ${usd(imp.ebitdaAnualMes)}, valor de empresa ${usd(imp.valorEmpresaMes)} (${multiplo}×).`,
    `- Contra el ritmo del mes anterior: ${conSigno(imp.valorCreado)} de valor.`,
    "",
    "4. Qué hacer",
    ...(acciones.length ? acciones.map((a) => `- ${a.texto}`) : ["- Sin alertas este mes."]),
  ].join("\n");

  // Barra de contexto: solo meses (los informables, del más nuevo al más viejo).
  const conservar = typeof presupuestoPedido === "string" ? `&presupuesto=${encodeURIComponent(presupuestoPedido)}` : "";
  const periodo: PeriodoAF4 = { clave: mes.slice(0, 7), etiqueta: mesMedio(mes), meses: [mes], tipo: "mes" };
  const opciones = {
    rapidos: [],
    meses: [...informables].reverse().slice(0, 12).map((m) => ({ valor: m.slice(0, 7), etiqueta: `${mesMedio(m)}${sinVentas(m) ? " · sin ventas" : ""}` })),
  };

  // Comparaciones de los KPIs: contra el mes anterior y, si hay, contra el presupuesto del mes.
  const contraAnterior = mesCorto(anterior);
  const vsAnterior = (a: number, b: number, sentido: Sentido = "mas-es-mejor"): ComparacionKpi => ({ v: calcularVariacion(a, b, sentido), contra: contraAnterior });
  const vsPuntos = (a: number | null, b: number | null): ComparacionKpi[] =>
    a === null || b === null ? [] : [{ v: calcularVariacion(a, b), contra: contraAnterior, modo: "puntos" }];
  const filaPpto = (concepto: string) => desempeno.find((d) => d.concepto === concepto);
  const vsPresupuesto = (concepto: string): ComparacionKpi[] => {
    const d = filaPpto(concepto);
    return d ? [{ v: conJuicio(calcularVariacion(d.acumulado.real, d.acumulado.presupuesto), d.acumulado.favorable), contra: "presupuesto" }] : [];
  };

  // 1 · Contra el presupuesto
  const filasPresupuesto: FilaComparacionAF4[] = desempeno.map((d) => ({
    clave: d.concepto,
    etiqueta: d.etiqueta,
    peso: d.concepto === "resultado" ? "total" : d.concepto === "ingresos" ? undefined : "subtotal",
    celdas: [
      usd(d.acumulado.real),
      usd(d.acumulado.presupuesto),
      <Variacion
        key="d"
        enCelda
        modo="dinero"
        contra="presupuesto"
        v={conJuicio(calcularVariacion(d.acumulado.real, d.acumulado.presupuesto), d.acumulado.favorable)}
      />,
      pct(d.acumulado.pct),
    ],
  }));

  // 2 · Causas, desvíos y tiendas
  const filasCausas: FilaComparacionAF4[] = causas.map((c) => {
    const d = desvioDe(c.seccion, c.tipo);
    return {
      clave: `${c.seccion}-${c.tipo}`,
      etiqueta: (
        <>
          {c.tipo} <span className="text-muted-foreground">· {c.etiqueta}</span>
        </>
      ),
      celdas: [
        usd(c.anterior),
        usd(c.actual),
        <Variacion key="e" enCelda modo="dinero" contra={contraAnterior} v={calcularVariacion(c.impacto, 0)} />,
        ...(pptoMes
          ? [
              d ? usd(d.presupuesto) : "—",
              d ? (
                <Variacion
                  key="p"
                  enCelda
                  modo="dinero"
                  contra="presupuesto"
                  v={conJuicio(calcularVariacion(d.real, d.presupuesto, sentidoDe(d.seccion)), Math.abs(d.impacto) < 0.5 ? null : d.impacto > 0)}
                />
              ) : (
                "—"
              ),
            ]
          : []),
      ],
    };
  });
  const filasDesvios: FilaComparacionAF4[] = desviosPrincipales.map((d) => ({
    clave: `${d.seccion}-${d.tipo}`,
    etiqueta: (
      <>
        {d.tipo} <span className="text-muted-foreground">· {d.etiqueta}</span>
      </>
    ),
    celdas: [usd(d.presupuesto), usd(d.real), pct(d.pct), <Variacion key="i" enCelda modo="dinero" contra="presupuesto" v={calcularVariacion(d.impacto, 0)} />],
  }));
  const filasTiendas: FilaComparacionAF4[] = tiendas.map((t) => ({
    clave: t.nombre,
    etiqueta: t.nombre,
    celdas: [
      usd(t.ingresos),
      usd(t.ebitdaAnterior),
      <span key="e" className={t.ebitda < 0 ? "text-destructive" : ""}>
        {usd(t.ebitda)}
      </span>,
      porcentaje(t.margenEbitdaPct),
    ],
  }));

  const detalleMes = `${mesCorto(mes)} vs ${contraAnterior} · USD`;

  return (
    <Pagina ancho="media" className="informe-af4 flex flex-col gap-8">
      <EstiloImpresionAF4 pie={`Ecomfive · Portal AF4 360° · Informe financiero de ${mesLargo(mes)}`} />
      <PortadaInformeAF4
        titulo="Informe financiero mensual"
        periodo={mesLargo(mes)}
        comparacion={`Comparado con ${mesLargo(anterior)} · USD`}
        indice={SECCIONES_INFORME}
        preparado={fechaCorta(hoy)}
        datos={[
          ...(pptoMes ? [{ etiqueta: "Presupuesto", valor: pptoMes.presupuesto.nombre }] : []),
          { etiqueta: "Múltiplo de valoración", valor: `${multiplo}× EBITDA` },
        ]}
      />

      <div data-sin-imprimir>
        <EncabezadoAF4
          titulo={`${TITULO} · ${mesMedio(mes)}`}
          filtros={<ControlPeriodo periodo={periodo} opciones={opciones} href={(clave) => `/panel-financiero/informe?periodo=${clave}${conservar}`} />}
          datosHasta={mes}
          actualizado={actualizado}
          acciones={<CopiarInforme texto={texto} />}
        />
      </div>

      <SeccionInformeAF4 id="informe-desempeno" numero={1} titulo={SECCIONES_INFORME[0]} detalle={detalleMes}>
        <div className="break-inside-avoid">
          <FilaKpiAF4>
            <KpiAF4
              titulo="Ingresos netos"
              valor={dineroKpi(actual.ingresos)}
              comparaciones={[vsAnterior(actual.ingresos, previo.ingresos), ...vsPresupuesto("ingresos")]}
            />
            <KpiAF4 titulo="Margen bruto" valor={porcentaje(actual.margenBrutoPct)} subtexto={usd(actual.margenBruto)} comparaciones={vsPuntos(actual.margenBrutoPct, previo.margenBrutoPct)} />
            <KpiAF4
              titulo="EBITDA"
              destacado
              tono={signoTono(actual.ebitda)}
              valor={dineroKpi(actual.ebitda)}
              comparaciones={[vsAnterior(actual.ebitda, previo.ebitda), ...vsPresupuesto("ebitda")]}
            />
            <KpiAF4 titulo="Margen EBITDA" valor={porcentaje(actual.margenEbitdaPct)} comparaciones={vsPuntos(actual.margenEbitdaPct, previo.margenEbitdaPct)} />
            <KpiAF4
              titulo="Resultado neto"
              tono={signoTono(actual.resultadoNeto)}
              valor={dineroKpi(actual.resultadoNeto)}
              comparaciones={[vsAnterior(actual.resultadoNeto, previo.resultadoNeto)]}
            />
          </FilaKpiAF4>
        </div>

        {(explicacion || puedeEditar) && (
          <ExplicacionInforme key={mes} mes={mes} inicial={explicacion} iaDisponible={configAnthropic(process.env) !== null} puedeEditar={puedeEditar} />
        )}

        {pptoMes && filasPresupuesto.length > 0 && (
          <TablaComparacionAF4
            id="informe-vs-presupuesto"
            titulo={`Contra ${pptoMes.presupuesto.nombre}`}
            detalle={`${mesCorto(mes)} · USD`}
            ariaLabel="Desempeño del mes contra el presupuesto"
            columnas={[
              { clave: "real", etiqueta: "Real" },
              { clave: "ppto", etiqueta: "Presupuesto", atenuada: true },
              { clave: "desvio", etiqueta: "Desvío" },
              { clave: "pct", etiqueta: "%" },
            ]}
            filas={filasPresupuesto}
          />
        )}
      </SeccionInformeAF4>

      <SeccionInformeAF4 id="informe-causas" numero={2} titulo={SECCIONES_INFORME[1]} detalle={detalleMes}>
        {filasCausas.length > 0 ? (
          <TablaComparacionAF4
            id="informe-tabla-causas"
            titulo="Contra el mes anterior"
            detalle={detalleMes}
            ariaLabel="Líneas que más movieron el resultado"
            etiquetaConcepto="Línea"
            columnas={[
              { clave: "anterior", etiqueta: contraAnterior, atenuada: true },
              { clave: "actual", etiqueta: mesCorto(mes) },
              { clave: "efecto", etiqueta: "Efecto en el resultado" },
              ...(pptoMes
                ? [
                    { clave: "ppto", etiqueta: "Presupuesto", atenuada: true },
                    { clave: "desvio", etiqueta: "Desvío" },
                  ]
                : []),
            ]}
            filas={filasCausas}
          />
        ) : (
          <EstadoVacioAF4 compacto titulo={`Ninguna línea cambió contra ${contraAnterior}`} />
        )}

        {filasDesvios.length > 0 && (
          <TablaComparacionAF4
            id="informe-tabla-desvios"
            titulo="Contra el presupuesto"
            detalle={`${mesCorto(mes)} · USD`}
            ariaLabel="Tipos que más se apartaron del presupuesto"
            etiquetaConcepto="Línea"
            columnas={[
              { clave: "ppto", etiqueta: "Presupuesto", atenuada: true },
              { clave: "real", etiqueta: "Real" },
              { clave: "pct", etiqueta: "%" },
              { clave: "efecto", etiqueta: "Efecto en el resultado" },
            ]}
            filas={filasDesvios}
          />
        )}

        {filasTiendas.length > 0 && (
          <TablaComparacionAF4
            id="informe-tabla-tiendas"
            titulo="EBITDA por tienda"
            detalle={detalleMes}
            ariaLabel="EBITDA por tienda"
            etiquetaConcepto="Tienda"
            columnas={[
              { clave: "ingresos", etiqueta: "Ingresos" },
              { clave: "anterior", etiqueta: `EBITDA ${contraAnterior}`, atenuada: true },
              { clave: "actual", etiqueta: `EBITDA ${mesCorto(mes)}` },
              { clave: "margen", etiqueta: "Margen" },
            ]}
            filas={filasTiendas}
          />
        )}
      </SeccionInformeAF4>

      <SeccionInformeAF4 id="informe-implicancias" numero={3} titulo={SECCIONES_INFORME[2]} detalle={`Al ritmo de ${mesCorto(mes)} · USD`}>
        <div className="break-inside-avoid">
          <FilaKpiAF4>
            <KpiAF4 titulo="EBITDA anual" tono={signoTono(imp.ebitdaAnualMes)} valor={dineroKpi(imp.ebitdaAnualMes)} subtexto={`${usd(actual.ebitda)} × 12`} />
            <KpiAF4 titulo="Valor de empresa" destacado valor={dineroKpi(imp.valorEmpresaMes)} subtexto={`${multiplo}× EBITDA anual`} />
            <KpiAF4
              titulo="Valor creado en el mes"
              tono={imp.valorCreado < 0 ? "destructive" : imp.valorCreado > 0 ? "success" : "neutral"}
              valor={conSigno(imp.valorCreado)}
              subtexto={`Contra el ritmo de ${contraAnterior}`}
            />
          </FilaKpiAF4>
        </div>
      </SeccionInformeAF4>

      <SeccionInformeAF4 id="informe-acciones" numero={4} titulo={SECCIONES_INFORME[3]} detalle={acciones.length ? `${acciones.length} ${acciones.length === 1 ? "acción" : "acciones"}` : undefined}>
        <div className="break-inside-avoid rounded-xl border border-border bg-card">
          {acciones.length ? (
            <ol className="m-0 list-none p-0">
              {acciones.map((a, i) => (
                <li key={a.clave} className="flex items-start gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0">
                  <span className="w-4 shrink-0 text-right text-xs font-semibold text-muted-foreground tabular-nums">{i + 1}</span>
                  <span aria-hidden="true" className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${a.prioridad === 1 ? "bg-destructive" : "bg-warning"}`} />
                  <span className="min-w-0 text-pretty">
                    <span className="sr-only">{a.prioridad === 1 ? "Urgente: " : "Revisar: "}</span>
                    {a.texto}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="flex items-center gap-2 px-4 py-3 text-sm">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
              Sin alertas este mes.
            </p>
          )}
        </div>
      </SeccionInformeAF4>

      <NotasMes id="informe-notas" periodo={mes} texto={nota.texto} faltaMigracion={nota.faltaMigracion} puedeEscribir={puedeNotas} />
    </Pagina>
  );
}
