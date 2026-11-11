import { ControlPeriodo } from "@/components/af4/control-periodo";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaBarrasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4, type ComparacionKpi } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { TablaFinanciera } from "@/components/af4/tabla-financiera";
import { SelectorEntidad } from "@/components/finanzas/selector-entidad";
import { KpiCard, KpiGrid, KpiGroup, type Tono } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { mesCorto, mesEnCursoPanama } from "@/lib/af4/fecha";
import { dinero, dineroKpi, esCero, numero } from "@/lib/af4/formato";
import { elegirPeriodoAF4, opcionesPeriodo, periodoAnterior, rangoPeriodo } from "@/lib/af4/periodo";
import { desdeTablaMensual } from "@/lib/af4/tabla-financiera";
import { calcularVariacion, type Sentido } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { cargarFlujo } from "@/lib/finanzas/cargar-flujo";
import { contextoEntidad } from "@/lib/finanzas/contexto-entidad";
import { conParametros, parametrosVista } from "@/lib/finanzas/entidades";
import { armarFlujo, filasEstadoFlujo, filasPorCuenta, resumirFlujo, total, ventanaPedida } from "@/lib/finanzas/flujo";
import { cargarInventarioCortes, cargarResultadosMes, cargarSaldosCartera, ENTIDAD_INVENTARIO } from "@/lib/finanzas/cargar-balance";
import { cargarTasasMes } from "@/lib/finanzas/cargar-entidades";
import { moverMes } from "@/lib/finanzas/eerr-analisis";
import { tasaDelMes } from "@/lib/finanzas/entidades";
import { flujoIndirecto } from "@/lib/finanzas/flujo-indirecto";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Flujo de caja" };

export const dynamic = "force-dynamic";

const RUTA = "/flujo-caja";
const PREDETERMINADO = "u12";
const tono = (v: number): Tono => (v < 0 ? "destructive" : "neutral");

export default async function FlujoCajaPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  await requireModulo("flujo-caja");
  const params = await searchParams;
  const supabase = createServiceClient();
  const ctx = await contextoEntidad(supabase, params);
  const { vista } = ctx;
  const MONEDA = vista.moneda;
  const conservar = ctx.opciones.length ? parametrosVista(vista) : {};
  const [datos, actualizado] = await Promise.all([
    cargarFlujo(supabase, { entidadId: vista.entidad?.id ?? null, monedaLocal: vista.local ? vista.moneda : null }),
    ultimaActualizacionLibro(supabase),
  ]);

  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Flujo de caja" imprimir={false} />
        <EstadoVacioAF4 titulo="No se pudo armar el flujo de caja">{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }

  // `disponibles` es la serie continua de meses del libro. El mes en curso cuenta (el flujo se ve al día); si el libro trae
  // meses posteriores (pagos con fecha futura), también: el período se elige entre todos los meses con datos.
  const disponibles = datos.disponibles;
  const tope = [mesEnCursoPanama(), disponibles.at(-1) ?? ""].sort().at(-1)!;
  const opcionesP = { predeterminado: PREDETERMINADO, ultimos: [3, 6, 12], incluirEnCurso: true };
  // Las direcciones viejas (`?desde=&hasta=`) siguen funcionando mientras no se elija un período.
  const legado = params.periodo === undefined && (typeof params.desde === "string" || typeof params.hasta === "string");
  const periodo = elegirPeriodoAF4(params.periodo, disponibles, tope, opcionesP);
  const meses = legado ? ventanaPedida(params.desde, params.hasta, disponibles) : periodo.meses;
  const periodoQuery = periodo.clave === PREDETERMINADO ? null : periodo.clave;
  const href = (clave: string) => conParametros(RUTA, { ...conservar, periodo: clave === PREDETERMINADO ? null : clave });
  const filtros = (
    <>
      <ControlPeriodo
        periodo={legado ? { ...periodo, clave: "", tipo: "ultimos" } : periodo}
        opciones={opcionesPeriodo(disponibles, tope, opcionesP)}
        href={href}
      />
      <SelectorEntidad ruta={RUTA} opciones={ctx.opciones} vista={vista} otros={{ periodo: periodoQuery }} />
    </>
  );

  if (!meses.length) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Flujo de caja" filtros={filtros} actualizado={actualizado} imprimir={false} />
        <EstadoVacioAF4
          titulo="Todavía no hay movimientos con «FLUJO = SI» en el libro"
          accion={{ href: "/libro-movimientos", etiqueta: "Ir al libro de movimientos" }}
        />
      </Pagina>
    );
  }

  const r = resumirFlujo(datos.filas, datos.saldos, datos.cuentas, meses, datos.conversion);
  const diferencia = total(r.diferenciaCambio);
  const entradas = total(r.estado.entradas);
  const salidas = total(r.estado.salidas);
  const neto = total(r.estado.neto);
  const operativo = r.estado.bloques.find((b) => b.bloque === "operativo");
  const sinClasificar = r.estado.bloques.find((b) => b.bloque === "sin_clasificar");
  const ultimo = meses[meses.length - 1];

  // El mismo cálculo sobre los meses anteriores comparables, solo para las variaciones de las tarjetas.
  const previos = periodoAnterior({ ...periodo, meses }, disponibles);
  const a = previos.length === meses.length ? armarFlujo(datos.filas, previos) : null;
  const operativoA = a?.bloques.find((b) => b.bloque === "operativo");
  const contra = previos.length === 1 ? mesCorto(previos[0]) : "período anterior";
  const comparar = (actual: number, previo: number | undefined, sentido: Sentido = "mas-es-mejor"): ComparacionKpi[] =>
    a && previo !== undefined ? [{ v: calcularVariacion(actual, previo, sentido), contra }] : [];
  const serie = (pm: Record<string, number>) => (meses.length > 1 ? meses.map((m) => pm[m] ?? 0) : undefined);

  const contexto = [vista.entidad?.razon_social ?? (ctx.opciones.length ? "Consolidado" : null), MONEDA].filter(Boolean).join(" · ");
  const detalle = `${contexto} · ${legado ? (meses.length === 1 ? mesCorto(meses[0]) : `${mesCorto(meses[0])} – ${mesCorto(ultimo)}`) : rangoPeriodo({ ...periodo, meses })}`;
  const descarga = conParametros("/api/exportar-flujo", { ...conservar, desde: meses[0].slice(0, 7), hasta: ultimo.slice(0, 7) });
  const cajaInicial = r.caja.inicial[meses[0]] ?? 0;

  // Método indirecto: de la utilidad neta al flujo operativo (cartera e inventario al cierre de cada mes y del anterior).
  const entidadId = vista.entidad?.id ?? null;
  const conCorte = [moverMes(meses[0], -1), ...meses];
  const conInventario = !vista.local && (!vista.entidad || vista.entidad.codigo === ENTIDAD_INVENTARIO);
  const [resultados, cartera, inventario, tasas] = await Promise.all([
    cargarResultadosMes(supabase, meses, entidadId, vista.local),
    cargarSaldosCartera(supabase, conCorte, entidadId),
    conInventario ? cargarInventarioCortes(supabase, conCorte, mesEnCursoPanama()) : Promise.resolve(null),
    vista.local ? cargarTasasMes(supabase, [MONEDA]) : Promise.resolve([]),
  ]);
  // La cartera viene en dólares: en la moneda de la entidad se valora con el cierre de cada mes.
  const enVista = (v: number | null | undefined, m: string) => {
    if (v === null || v === undefined) return null;
    if (!vista.local) return v;
    const t = tasaDelMes(tasas, MONEDA, m, "cierre");
    return t ? Math.round(v * t * 100) / 100 : null;
  };
  const indirecto = resultados
    ? flujoIndirecto({
        meses,
        utilidad: resultados.utilidad,
        depreciacion: resultados.depreciacion,
        dividendos: resultados.dividendos,
        altasBienes: resultados.altasBienes,
        cxc: Object.fromEntries(conCorte.map((m) => [m, enVista(cartera[m]?.cxc, m)])),
        cxp: Object.fromEntries(conCorte.map((m) => [m, enVista(cartera[m]?.cxp, m)])),
        inventario: inventario ? inventario.valores : Object.fromEntries(conCorte.map((m) => [m, 0])),
        operativoDirecto: operativo?.neto ?? {},
      })
    : null;

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4
        titulo="Flujo de caja"
        filtros={filtros}
        datosHasta={disponibles.filter((m) => m <= tope).at(-1) ?? null}
        actualizado={actualizado}
        descarga={{ href: descarga }}
      />

      <FilaKpiAF4>
        <KpiAF4
          titulo="Entradas"
          valor={dineroKpi(entradas, MONEDA)}
          comparaciones={comparar(entradas, a ? total(a.entradas) : undefined)}
          serie={serie(r.estado.entradas)}
          moneda={MONEDA}
        />
        <KpiAF4
          titulo="Salidas"
          valor={dineroKpi(salidas, MONEDA)}
          comparaciones={comparar(salidas, a ? total(a.salidas) : undefined, "menos-es-mejor")}
          serie={serie(r.estado.salidas)}
          moneda={MONEDA}
        />
        <KpiAF4
          titulo="Flujo neto"
          destacado
          tono={tono(neto)}
          valor={dineroKpi(neto, MONEDA)}
          comparaciones={comparar(neto, a ? total(a.neto) : undefined)}
          serie={serie(r.estado.neto)}
          moneda={MONEDA}
        />
        {operativo && (
          <KpiAF4
            titulo="Flujo operativo"
            tono={tono(total(operativo.neto))}
            valor={dineroKpi(total(operativo.neto), MONEDA)}
            comparaciones={comparar(total(operativo.neto), operativoA ? total(operativoA.neto) : undefined)}
            moneda={MONEDA}
          />
        )}
        <KpiAF4
          titulo={`Caja al cierre de ${mesCorto(ultimo)}`}
          tono={r.conSaldos ? tono(r.cajaFinal) : "warning"}
          valor={r.conSaldos ? dineroKpi(r.cajaFinal, MONEDA) : "—"}
          comparaciones={r.conSaldos ? [{ v: calcularVariacion(r.cajaFinal, cajaInicial), contra: `el inicio de ${mesCorto(meses[0])}`, modo: "dinero" }] : []}
          subtexto={
            !r.conSaldos
              ? "Faltan los saldos iniciales"
              : r.cuentasSinSaldo > 0
                ? `${r.cuentasSinSaldo} ${r.cuentasSinSaldo === 1 ? "cuenta parte" : "cuentas parten"} de cero`
                : undefined
          }
          href="/flujo-caja/saldos"
          moneda={MONEDA}
        />
        <KpiAF4
          titulo="Meses de caja"
          valor={r.conSaldos && r.mesesDeCaja !== null ? numero(r.mesesDeCaja) : "—"}
          subtexto={`Salida operativa ${dinero(r.salidaOperativaPromedio, MONEDA)} por mes`}
        />
      </FilaKpiAF4>

      {(!esCero(diferencia) || sinClasificar) && (
        <KpiGroup titulo="Para revisar">
          <KpiGrid compacta>
            {!esCero(diferencia) && <KpiCard compacta tono={tono(diferencia)} titulo="Diferencia de cambio" valor={dinero(diferencia, MONEDA)} />}
            {sinClasificar && (
              <KpiCard compacta tono="warning" titulo="Sin tipo" valor={dinero(total(sinClasificar.neto), MONEDA)} href="/libro-movimientos/pendientes" />
            )}
          </KpiGrid>
        </KpiGroup>
      )}

      <GraficaBarrasAF4
        id="grafica-flujo"
        titulo="Entradas, salidas y flujo neto por mes"
        detalle={detalle}
        moneda={MONEDA}
        datos={meses.map((m) => ({
          etiqueta: mesCorto(m),
          entradas: r.estado.entradas[m] ?? 0,
          salidas: -(r.estado.salidas[m] ?? 0),
          neto: r.estado.neto[m] ?? 0,
        }))}
        series={[
          { clave: "entradas", nombre: "Entradas", color: 1 },
          { clave: "salidas", nombre: "Salidas", color: 5 },
          { clave: "neto", nombre: "Flujo neto", color: 2, forma: "linea", trazo: "rayas" },
        ]}
      />

      <TablaFinanciera
        id="tabla-estado-flujo"
        titulo="Estado de flujo"
        detalle={detalle}
        columnas={meses.map((m) => ({ clave: m, etiqueta: mesCorto(m) }))}
        filas={desdeTablaMensual(filasEstadoFlujo(r.estado, r.conSaldos ? r.caja : undefined, r.diferenciaCambio), meses, {
          saldos: ["caja-inicial"],
          totalFinal: "caja-final",
        })}
        moneda={MONEDA}
        desplegado="nada"
        ariaLabel="Estado de flujo de caja por mes"
      />

      {indirecto ? (
        <TablaFinanciera
          id="tabla-flujo-indirecto"
          titulo="Método indirecto"
          detalle={detalle}
          columnas={meses.map((m) => ({
            clave: m,
            etiqueta: mesCorto(m),
            ...(conInventario && indirecto.sinInventario.includes(m) ? { marca: { tono: "warning" as const, texto: "Sin foto del inventario" } } : {}),
          }))}
          filas={indirecto.filas}
          moneda={MONEDA}
          desplegado="nada"
          ariaLabel="Flujo operativo por método indirecto, desde la utilidad neta"
          textoDesplegar="ajustes"
        />
      ) : (
        <MarcoAF4 id="tabla-flujo-indirecto" titulo="Método indirecto" detalle={detalle}>
          <EstadoVacioAF4 compacto titulo="Falta correr la migración 0929 (estados financieros) en Supabase" />
        </MarcoAF4>
      )}

      {/* Sin ningún saldo inicial, el saldo de cada cuenta sería solo lo acumulado desde cero: una pared de negativos que
          no son reales. Se pide cargar los saldos en vez de mostrarla. */}
      {r.conSaldos ? (
        <TablaFinanciera
          id="tabla-flujo-cuentas"
          titulo="Por cuenta"
          detalle={`Saldo al cierre de cada mes · ${MONEDA}`}
          columnas={meses.map((m) => ({ clave: m, etiqueta: mesCorto(m) }))}
          filas={desdeTablaMensual(filasPorCuenta(r.cuentas, meses), meses, { gruposPlegables: true })}
          moneda={MONEDA}
          desplegado="nada"
          ariaLabel="Saldo, entradas y salidas de cada cuenta por mes"
        />
      ) : (
        <MarcoAF4 id="tabla-flujo-cuentas" titulo="Por cuenta" detalle={`Saldo al cierre de cada mes · ${MONEDA}`}>
          <EstadoVacioAF4
            compacto
            titulo={r.cuentasSinSaldo > 0 ? `Faltan los saldos iniciales de ${r.cuentasSinSaldo} ${r.cuentasSinSaldo === 1 ? "cuenta" : "cuentas"}` : "Faltan los saldos iniciales"}
            accion={{ href: "/flujo-caja/saldos", etiqueta: "Cargar saldos iniciales" }}
          >
            Con el saldo de cada cuenta al empezar, aquí se ve su saldo al cierre de cada mes.
          </EstadoVacioAF4>
        </MarcoAF4>
      )}
    </Pagina>
  );
}
