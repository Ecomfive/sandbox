import { notFound } from "next/navigation";
import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { FilaKpiAF4, KpiAF4, type ComparacionKpi } from "@/components/af4/kpi-af4";
import { EtiquetaMiga } from "@/components/migas/etiqueta-miga";
import { Badge } from "@/components/ui/badge";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { KpiGroup, type Tono } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { hoyPanama, rangoMeses as textoRango } from "@/lib/af4/fecha";
import { dinero, dineroKpi, porcentaje } from "@/lib/af4/formato";
import { calcularVariacion } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { RecordarTienda } from "@/components/tienda-global/recordar-tienda";
import { paramsConTienda } from "@/lib/finanzas/tienda-actual";
import { valorEmpresa } from "@/lib/finanzas/eerr";
import { cargarPresupuesto, cargarRealPorUnidad, unidadesPresupuesto } from "@/lib/finanzas/cargar-presupuesto";
import { cargarValoracion } from "@/lib/finanzas/valoracion";
import {
  ESCENARIOS,
  baseSensibilidad,
  comparar,
  compararConReal,
  compararPorTipo,
  detalleDeLineas,
  esEscenario,
  type RealTipo,
  matrizSensibilidad,
  mesesCerradosConReal,
  mesesDelAnio,
  rangoMeses,
  resumenAnual,
  serieDeLineas,
  serieVacia,
  sumaEn,
  sumarSeries,
  type Comparacion,
  type Escenario,
  type SerieSecciones,
} from "@/lib/finanzas/presupuesto";
import type { DatosGenerar } from "../campos-generar";
import { ETIQUETA_ESTADO, TONO_ESTADO } from "../tabla-presupuestos";
import { AccionesPresupuesto } from "./acciones-presupuesto";
import { ComparacionReal } from "./comparacion-real";
import { Sensibilidad } from "./sensibilidad";
import { TablaSupuestos } from "./supuestos";
import { TablaPresupuesto } from "./tabla-presupuesto";

export const metadata = { title: "Presupuesto" };

export const dynamic = "force-dynamic";

const TODAS = "todas";
const signoTono = (v: number): Tono => (v < 0 ? "destructive" : "neutral");

export default async function PresupuestoDetallePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const usuario = await requireModulo("presupuesto");
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const supabase = createServiceClient();
  const cargado = await cargarPresupuesto(supabase, id);
  if ("noExiste" in cargado) notFound();
  if ("error" in cargado) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Presupuesto" oculto />
        <EstadoVacioAF4 titulo="El presupuesto todavía no está instalado">Falta correr la migración 0913 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const { presupuesto: p, lineas } = cargado;
  const hoy = hoyPanama();
  const meses = mesesDelAnio(p.anio);
  // El real del año y los 24 meses anteriores al mes en curso (para «Rehacer»).
  const ventanaBase = rangoMeses(`${Number(hoy.slice(0, 4)) - 2}-${hoy.slice(5, 7)}-01`, `${hoy.slice(0, 7)}-01`).slice(-24);
  const ventana = [...new Set([...ventanaBase, ...meses])].sort();
  const [real, unidades, valoracion, actualizado] = await Promise.all([
    cargarRealPorUnidad(supabase, ventana),
    unidadesPresupuesto(supabase),
    cargarValoracion(supabase),
    ultimaActualizacionLibro(supabase),
  ]);
  const multiplo = valoracion.supuestos.multiplo;
  const porUnidad = "error" in real ? new Map<string, SerieSecciones>() : real.porUnidad;
  const conDatos = "error" in real ? new Set<string>() : real.conDatos;
  const realTipos: RealTipo[] = "error" in real ? [] : real.tipos;
  const nombresTipo = "error" in real ? {} : real.nombresTipo;

  const escenario: Escenario = esEscenario(sp.esc) ? sp.esc : "base";
  const conLineas = new Set(lineas.map((l) => l.unidad_id).filter((u): u is string => !!u));
  const tiendas = unidades.filter((u) => conLineas.has(u.id));
  // Sin `?ver=` un presupuesto por tienda arranca con la tienda global de la barra de arriba.
  const selTienda = await paramsConTienda(supabase, sp, "ver");
  const unidad = p.por_tienda ? (tiendas.find((u) => u.id === selTienda.params.ver)?.id ?? null) : null;
  const verTodas = p.por_tienda && unidad === null;

  const href = (cambios: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const actual: Record<string, string | null> = { esc: escenario === "base" ? null : escenario, ver: p.por_tienda ? (unidad ?? TODAS) : null, mes: typeof sp.mes === "string" ? sp.mes : null };
    for (const [k, v] of Object.entries({ ...actual, ...cambios })) if (v) q.set(k, v);
    const s = q.toString();
    return `/presupuesto/${p.id}${s ? `?${s}` : ""}`;
  };

  // Presupuesto de lo que se ve: una tienda, o todo (consolidado o la suma de las tiendas).
  const seriePpto = (e: Escenario) => serieDeLineas(lineas, e, meses, verTodas ? undefined : unidad);
  const ppto = seriePpto(escenario);
  const realSerie =
    unidad === null ? sumarSeries([...porUnidad.values()], meses) : (porUnidad.get(unidad) ?? serieVacia(meses));
  const mesesReales = mesesCerradosConReal(meses, conDatos, hoy);

  const detalle = detalleDeLineas(lineas, escenario, meses, verTodas ? undefined : unidad);
  const resumen = resumenAnual(ppto, meses, multiplo);
  const resumenes = Object.fromEntries(ESCENARIOS.map((e) => [e.clave, resumenAnual(seriePpto(e.clave), meses, multiplo)])) as Record<Escenario, ReturnType<typeof resumenAnual>>;
  const comparacion = mesesReales.length ? compararConReal(ppto, realSerie, mesesReales) : [];
  const comparacionTipos = mesesReales.length
    ? compararPorTipo(detalle, unidad === null ? realTipos : realTipos.filter((t) => t.unidad_id === unidad), mesesReales)
    : {};
  const fila = (c: string) => comparacion.find((f) => f.concepto === c);
  const mesElegido = typeof sp.mes === "string" && mesesReales.includes(sp.mes) ? sp.mes : mesesReales.at(-1);
  const realYtd = mesesReales.length ? resumenAnual(realSerie, mesesReales, multiplo) : null;
  const ebitdaRealAnual = realYtd ? (realYtd.ebitda / mesesReales.length) * 12 : 0;

  const supuestos = p.supuestos?.escenarios[escenario];
  const matriz = matrizSensibilidad(baseSensibilidad(ppto, meses, supuestos), undefined, undefined, multiplo);

  const puedeEscribir = !usuario.modulosSoloLectura.includes("presupuesto");
  const editable = puedeEscribir && p.estado === "borrador" && !verTodas;
  const mesesConDatos = ventanaBase.filter((m) => conDatos.has(m));
  const datos: DatosGenerar | null = mesesConDatos.length
    ? {
        serie: sumarSeries([...porUnidad.values()], mesesConDatos),
        meses: mesesConDatos,
        baseDesde: p.supuestos?.mesesBase[0] ?? mesesConDatos[0],
        baseHasta: p.supuestos?.mesesBase.at(-1) ?? mesesConDatos[mesesConDatos.length - 1],
        anio: p.anio,
      }
    : null;

  const etiquetaEsc = ESCENARIOS.find((e) => e.clave === escenario)!.etiqueta;
  const ytdTexto = mesesReales.length ? textoRango(mesesReales) : "";
  const versionTabla = `${escenario}|${unidad}|${ESCENARIOS.map((e) => Math.round(sumaEn(seriePpto(e.clave).ingresos, meses))).join(",")}|${lineas.length}`;
  const ebitdaYtd = fila("ebitda")?.acumulado;
  const ingresosYtd = fila("ingresos")?.acumulado;
  const margenPpto = ebitdaYtd && ingresosYtd && ingresosYtd.presupuesto > 0 ? (ebitdaYtd.presupuesto / ingresosYtd.presupuesto) * 100 : null;
  // Real contra presupuesto: la dirección sale de la diferencia; el juicio (favorable o no) lo trae el presupuesto.
  const vsPresupuesto = (c: Comparacion): ComparacionKpi[] => [
    { v: { ...calcularVariacion(c.real, c.presupuesto), favorable: c.favorable }, contra: "presupuesto", modo: "dinero" },
  ];
  const subtextoPpto = (c: Comparacion) => `Presupuesto ${dinero(c.presupuesto)} · ${c.pct === null ? "—" : porcentaje(c.pct, { conSigno: true })}`;
  const opcionesTienda = [{ id: TODAS, nombre: "Todas las tiendas" }, ...tiendas].map((o) => ({ valor: o.id, etiqueta: o.nombre, href: href({ ver: o.id }) }));
  const baseTexto = p.supuestos ? ` · base ${textoRango(p.supuestos.mesesBase)}` : "";

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EtiquetaMiga texto={p.nombre} />
      <EncabezadoAF4
        titulo={p.nombre}
        filtros={
          <>
            <ControlSegmentado
              etiqueta="Elegir escenario"
              opciones={ESCENARIOS.map((e) => ({ valor: e.clave, etiqueta: e.etiqueta, href: href({ esc: e.clave === "base" ? null : e.clave }) }))}
              elegido={escenario}
            />
            {p.por_tienda && <ControlSegmentado etiqueta="Ver por tienda" opciones={opcionesTienda} elegido={unidad ?? TODAS} />}
          </>
        }
        datosHasta={mesesReales.at(-1) ?? null}
        actualizado={actualizado}
        descarga={{ href: `/presupuesto/${p.id}/descargar${unidad ? `?ver=${unidad}` : ""}` }}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={TONO_ESTADO[p.estado]}>{ETIQUETA_ESTADO[p.estado]}</Badge>
          <span className="text-muted-foreground">
            {p.anio} · {p.por_tienda ? "por tienda" : "consolidado"}
            {baseTexto}
            {p.notas ? ` · ${p.notas}` : ""}
          </span>
        </p>
        {puedeEscribir && (
          <AccionesPresupuesto id={p.id} anio={p.anio} estado={p.estado} porTienda={p.por_tienda} puedeEscribir={puedeEscribir} datos={datos} supuestos={p.supuestos} />
        )}
      </div>

      {p.por_tienda && <RecordarTienda {...selTienda.recordar} />}

      <KpiGroup titulo={`${etiquetaEsc} · ${p.anio}${verTodas ? " · todas las tiendas" : ""} · USD`}>
        <FilaKpiAF4>
          <KpiAF4 titulo="Ingresos del año" valor={dineroKpi(resumen.ingresos)} />
          <KpiAF4 titulo="EBITDA del año" destacado tono={signoTono(resumen.ebitda)} valor={dineroKpi(resumen.ebitda)} subtexto={`Margen ${porcentaje(resumen.margenEbitda)}`} />
          <KpiAF4 titulo={`Valor de empresa (${multiplo}×)`} valor={dineroKpi(resumen.valorEmpresa)} />
          {ingresosYtd && (
            <KpiAF4 titulo={`Ingresos real · ${ytdTexto}`} valor={dineroKpi(ingresosYtd.real)} comparaciones={vsPresupuesto(ingresosYtd)} subtexto={subtextoPpto(ingresosYtd)} />
          )}
          {ebitdaYtd && (
            <KpiAF4
              titulo={`EBITDA real · ${ytdTexto}`}
              tono={signoTono(ebitdaYtd.real)}
              valor={dineroKpi(ebitdaYtd.real)}
              comparaciones={vsPresupuesto(ebitdaYtd)}
              subtexto={subtextoPpto(ebitdaYtd)}
            />
          )}
          {realYtd && margenPpto !== null && (
            <KpiAF4
              titulo="Margen EBITDA real"
              valor={porcentaje(realYtd.margenEbitda)}
              comparaciones={[
                {
                  v: { ...calcularVariacion(realYtd.margenEbitda ?? 0, margenPpto), favorable: comparar("ebitda", realYtd.margenEbitda ?? 0, margenPpto).favorable },
                  contra: "presupuesto",
                  modo: "puntos",
                },
              ]}
              subtexto={`Presupuesto ${porcentaje(margenPpto)}`}
            />
          )}
        </FilaKpiAF4>
      </KpiGroup>

      <KpiGroup titulo="Escenarios · EBITDA del año · USD">
        <FilaKpiAF4>
          {ESCENARIOS.map((e) => (
            <KpiAF4
              key={e.clave}
              href={href({ esc: e.clave === "base" ? null : e.clave })}
              activa={e.clave === escenario}
              titulo={e.etiqueta}
              tono={signoTono(resumenes[e.clave].ebitda)}
              valor={dineroKpi(resumenes[e.clave].ebitda)}
              subtexto={`Valor ${dinero(resumenes[e.clave].valorEmpresa)}`}
            />
          ))}
          {realYtd && (
            <KpiAF4
              titulo="Real anualizado"
              tono={signoTono(ebitdaRealAnual)}
              valor={dineroKpi(ebitdaRealAnual)}
              subtexto={`Valor ${dinero(valorEmpresa(ebitdaRealAnual, multiplo))}`}
            />
          )}
        </FilaKpiAF4>
      </KpiGroup>

      <TablaPresupuesto
        key={versionTabla}
        presupuestoId={p.id}
        escenario={escenario}
        unidad={unidad}
        meses={meses}
        detalle={detalle}
        nombresTipo={nombresTipo}
        editable={editable}
        titulo={`${etiquetaEsc} mes a mes`}
        detalleTitulo={`${verTodas ? "Todas las tiendas · " : ""}USD`}
      />

      {mesElegido && comparacion.length > 0 ? (
        <ComparacionReal
          filas={comparacion}
          tipos={comparacionTipos}
          nombresTipo={nombresTipo}
          meses={mesesReales}
          mes={mesElegido}
          hrefs={Object.fromEntries(mesesReales.map((m) => [m, href({ mes: m })]))}
        />
      ) : (
        <EstadoVacioAF4 compacto titulo={`Todavía no hay meses cerrados de ${p.anio} con real para comparar`} />
      )}

      <Sensibilidad matriz={matriz} multiplo={multiplo} />

      {p.supuestos && <TablaSupuestos supuestos={p.supuestos} />}
    </Pagina>
  );
}
