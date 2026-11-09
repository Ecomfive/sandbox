import Link from "next/link";
import type { ReactNode } from "react";
import { ControlPeriodo } from "@/components/af4/control-periodo";
import { ControlSegmentado } from "@/components/af4/control-segmentado";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { GraficaBarrasAF4 } from "@/components/af4/graficas-af4";
import { FilaKpiAF4, KpiAF4, type ComparacionKpi } from "@/components/af4/kpi-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { NotasMes } from "@/components/finanzas/notas-mes";
import { SelectorEntidad } from "@/components/finanzas/selector-entidad";
import { RecordarTienda } from "@/components/tienda-global/recordar-tienda";
import { KpiCard, KpiGrid, KpiGroup, type Tono } from "@/components/ui/kpi-card";
import { Pagina } from "@/components/ui/pagina";
import { ultimaActualizacionLibro } from "@/lib/af4/cargar-contexto";
import { eerrDelPeriodo, totalesEerr, VENTANA_EERR } from "@/lib/af4/eerr-periodo";
import { hoyPanama, inicioDeMes, mesCorto, ultimosMeses } from "@/lib/af4/fecha";
import { dinero, dineroKpi, entero, porcentaje } from "@/lib/af4/formato";
import { rangoPeriodo } from "@/lib/af4/periodo";
import { desdeEerr, type ColumnaAF4, type FilaAF4 } from "@/lib/af4/tabla-financiera";
import { calcularVariacion, type Sentido } from "@/lib/af4/variacion";
import { requireModulo } from "@/lib/auth";
import { COLUMNAS_CANAL, ETIQUETA_CANAL, canalDe } from "@/lib/finanzas/canales";
import { cargarEerr, unidadesEerr } from "@/lib/finanzas/cargar-eerr";
import { cargarNotaMes } from "@/lib/finanzas/cargar-notas";
import { cargarPartes } from "@/lib/finanzas/cargar-partes";
import type { FilaEerr } from "@/lib/finanzas/eerr";
import {
  eerrInteranual,
  eerrMovil,
  eerrPorGrupo,
  filasDosMonedas,
  filasInteranual,
  gruposConDatos,
  resultadoConReparto,
} from "@/lib/finanzas/eerr-analisis";
import { BASES_REPARTO, esBaseReparto, etiquetaBase, pesosReparto, repartirEerr, type EerrRepartido } from "@/lib/finanzas/reparto";
import { contextoEntidad } from "@/lib/finanzas/contexto-entidad";
import { sobre, valorEmpresa } from "@/lib/finanzas/eerr";
import { filasEstado } from "@/lib/finanzas/eerr-filas";
import { conParametros, parametrosVista } from "@/lib/finanzas/entidades";
import { getTiendaActual } from "@/lib/finanzas/tienda-actual";
import { conTiendaGlobal, valorExplicito } from "@/lib/finanzas/tienda-elegida";
import { cargarValoracion } from "@/lib/finanzas/valoracion";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { filtrarUnidades, veTodaLaEmpresa } from "@/lib/finanzas/tiendas-permitidas";
import { cargarHilos } from "@/lib/finanzas/cargar-comentarios";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarPrecioTransferencia } from "@/lib/finanzas/cargar-precio-transferencia";
import { UNIDAD_ELIMINACIONES, ajustesTP, totalesTP } from "@/lib/finanzas/precio-transferencia";
import { CapitalDeTrabajo, type FilaCapital } from "./capital-trabajo";
import { TablaEerr, type ComentariosTabla } from "./tabla-eerr";

/** Las vistas del EERR (`?vista=`). */
const VISTAS = [
  { valor: "mensual", etiqueta: "Por mes" },
  { valor: "interanual", etiqueta: "Año anterior" },
  { valor: "ttm", etiqueta: "12 meses móviles" },
  { valor: "tiendas", etiqueta: "Por tienda" },
  { valor: "canal", etiqueta: "Por canal" },
  { valor: "moneda", etiqueta: "Moneda local y USD" },
  { valor: "transferencia", etiqueta: "Precio de transferencia" },
] as const;
type Vista = (typeof VISTAS)[number]["valor"];
const esVista = (v: unknown): v is Vista => VISTAS.some((x) => x.valor === v);

/** Las filas del resultado antes y después del reparto, al pie de la tabla por tienda o por canal. */
function filasReparto(r: ReturnType<typeof resultadoConReparto>, grupos: string[]): FilaAF4[] {
  const v = (o: Record<string, number>) => grupos.map((g) => o[g] ?? 0);
  return [
    { clave: "g-reparto", etiqueta: "Reparto de A DISTRIBUIR", tipo: "grupo", valores: grupos.map(() => null), total: null },
    { clave: "antes-reparto", etiqueta: "Resultado antes del reparto", tipo: "subtotal", valores: v(r.antes) },
    { clave: "recibido-reparto", etiqueta: "Gastos comunes recibidos", tipo: "detalle", valores: v(r.recibido) },
    { clave: "despues-reparto", etiqueta: "Resultado después del reparto", tipo: "total", valores: v(r.despues) },
  ];
}

export const metadata = { title: "Estado de resultados" };

export const dynamic = "force-dynamic";

const TODAS = "todas";
const RUTA = "/estado-resultados";

const tonoSigno = (v: number): Tono => (v < 0 ? "destructive" : "neutral");

export default async function EstadoResultadosPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const usuario = await requireModulo("estado-resultados");
  const puedeEscribir = !usuario.modulosSoloLectura.includes("estado-resultados");
  const puedeMarcar = usuario.modulos.includes("libro-movimientos") && !usuario.modulosSoloLectura.includes("libro-movimientos");
  const supabase = createServiceClient();
  const params = await searchParams;
  const tiendaGlobal = (await getTiendaActual(supabase))?.id ?? null;
  // Sin `?ver=` arranca con la tienda global de la barra de arriba.
  const { ver } = conTiendaGlobal(params, "ver", tiendaGlobal);

  const hoy = hoyPanama();
  const mesEnCurso = inicioDeMes(hoy);
  const ventana = ultimosMeses(hoy, VENTANA_EERR);
  const ctx = await contextoEntidad(supabase, params);
  const { vista } = ctx;
  const entidadId = vista.entidad?.id ?? null;
  const MONEDA = vista.moneda;
  const conEntidad = ctx.opciones.length > 0;
  const vistaQuery = conEntidad ? parametrosVista(vista) : {};

  const [unidadesR, pendienteR, sinTipoR, sinAsignarR, capitalR, paisesR, sinTasaR, valoracion, actualizado, partesR] = await Promise.all([
    unidadesEerr(supabase, entidadId),
    conEntidad
      ? supabase.from("fin_reparto_pendiente").select("periodo, monto, movimientos, entidad_id").gte("periodo", ventana[12])
      : supabase.from("fin_reparto_pendiente").select("periodo, monto, movimientos").gte("periodo", ventana[12]),
    supabase.from("fin_movimientos_sin_tipo").select("movimientos, monto").gte("periodo", ventana[12]),
    supabase
      .from("fin_movimientos")
      .select("monto, fin_unidades!inner(nombre)", { count: "exact", head: false })
      .eq("fin_unidades.nombre", "SIN ASIGNAR")
      .gte("periodo", ventana[12])
      .limit(1),
    supabase.from("af4_capital_trabajo").select("*"),
    supabase.from("paises").select("id, codigo, nombre"),
    conEntidad ? supabase.from("fin_movimientos_sin_tasa").select("movimientos").gte("periodo", ventana[12]) : Promise.resolve({ data: [] }),
    cargarValoracion(supabase),
    ultimaActualizacionLibro(supabase),
    cargarPartes(supabase, ventana, entidadId),
  ]);
  const multiplo = valoracion.supuestos.multiplo;

  if ("error" in unidadesR) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo="Estado de resultados" imprimir={false} />
        <EstadoVacioAF4 titulo="Falta el libro de movimientos">
          Correr la migración 0901 en Supabase y cargar el libro con scripts/finanzas/importar-libro.ts.
        </EstadoVacioAF4>
      </Pagina>
    );
  }

  // Permisos por tienda: solo las suyas; «Todas» es la suma de las que puede ver.
  const permitidas = await cargarTiendasPermitidas();
  const elegibles = filtrarUnidades(permitidas, unidadesR.unidades);
  const verTexto = typeof ver === "string" ? ver : TODAS;
  const unidadElegida = elegibles.find((u) => u.id === verTexto) ?? null;

  const idsElegibles = new Set(elegibles.map((u) => u.id));
  const hilos = await cargarHilos(supabase, "estado-resultados", "");
  const ambitoComentarios = [vista.entidad?.codigo ?? "todo", vista.local ? vista.moneda : "usd", unidadElegida?.id ?? "todas"].join("-");
  // Partes del EERR (migración 0929): repartir A DISTRIBUIR con otra base y el consolidado sin intercompañía.
  const hayPartes = !("error" in partesR);
  const basePredeterminada = hayPartes ? partesR.basePredeterminada : "envios";
  const base = hayPartes && esBaseReparto(params.base) ? params.base : basePredeterminada;
  const consolidado = conEntidad && !vista.entidad;
  const vistaPedida: Vista = esVista(params.vista) ? params.vista : "mensual";
  const conMonedaLocal = !!vista.entidad && vista.entidad.moneda !== "USD";
  // Precio de transferencia: en dólares, de toda la empresa (la importadora y las tiendas juntas) y para quien la ve entera.
  const conTransferencia = hayPartes && !vista.local && !vista.entidad && veTodaLaEmpresa(permitidas);
  const vistaEerr: Vista =
    (vistaPedida === "moneda" && !conMonedaLocal) ||
    (!hayPartes && (vistaPedida === "tiendas" || vistaPedida === "canal")) ||
    (vistaPedida === "transferencia" && !conTransferencia)
      ? "mensual"
      : vistaPedida;
  const repartir = (local: boolean): EerrRepartido | null =>
    hayPartes
      ? repartirEerr(partesR.partes, pesosReparto(base, partesR.partes, partesR.envios, partesR.unidades), { local, sinIntercompania: consolidado })
      : null;
  const repartido = repartir(vista.local);
  const hayEliminado = hayPartes && Object.values(repartido!.eliminado).some((v) => v !== 0);
  // Con la base guardada y sin nada que eliminar, la vista de la base (`fin_eerr_mensual`) tal cual; si no, lo repartido aquí.
  const usarPartes = hayPartes && (base !== basePredeterminada || hayEliminado);

  const cargado = usarPartes ? null : await cargarEerr(supabase, unidadElegida?.id ?? null, ventana, {
        entidadId,
        local: vista.local,
        unidades: !unidadElegida && permitidas ? elegibles.map((u) => u.id) : null,
      });
  const filasBase: FilaEerr[] = usarPartes
    ? repartido!.filas.filter((f) => (!unidadElegida || f.unidad_id === unidadElegida.id) && (!permitidas || idsElegibles.has(f.unidad_id)))
    : !cargado || "error" in cargado
      ? []
      : cargado.filas;
  const conDatos = usarPartes ? [...new Set(partesR.partes.map((p) => p.periodo))] : !cargado || "error" in cargado ? [] : [...cargado.conDatos];
  const { periodo, eerr, anterior, opciones } = eerrDelPeriodo(filasBase, conDatos, params.periodo, mesEnCurso);
  const meses = eerr.meses;
  const hayDatos = meses.length > 0;
  const nota = hayDatos ? await cargarNotaMes(supabase, meses[meses.length - 1]) : null;

  const t = totalesEerr(eerr);
  const a = anterior ? totalesEerr(anterior) : null;
  const margenBrutoPct = sobre(t.margenBruto, t.ingresos);
  const margenEbitdaPct = sobre(t.ebitda, t.ingresos);
  const ebitdaAnual = meses.length ? (t.ebitda / meses.length) * 12 : 0;
  const contraAnterior = anterior?.meses.length === 1 ? mesCorto(anterior.meses[0]) : "período anterior";
  const comparar = (actual: number, previo: number | undefined, sentido: Sentido = "mas-es-mejor"): ComparacionKpi[] =>
    a && previo !== undefined ? [{ v: calcularVariacion(actual, previo, sentido), contra: contraAnterior }] : [];
  const compararMargen = (actual: number | null, previo: number | null): ComparacionKpi[] =>
    a && actual !== null && previo !== null ? [{ v: calcularVariacion(actual, previo), contra: contraAnterior, modo: "puntos" }] : [];
  const serie = (pm: Record<string, number>) => (meses.length > 1 ? meses.map((m) => pm[m] ?? 0) : undefined);

  const pendienteBase = usarPartes
    ? repartido!.pendiente.filter((p) => p.periodo >= ventana[12]).map((p) => ({ periodo: p.periodo, monto: p.monto, entidad_id: p.entidad_id ?? undefined }))
    : ((pendienteR.data ?? []) as { periodo: string; monto: number | string; entidad_id?: string }[]);
  const repartoPendiente = pendienteBase.filter(
    (p) => (!unidadElegida || unidadElegida.clase === "tienda") && (!entidadId || p.entidad_id === entidadId),
  );
  const mesesPendientes = new Set(repartoPendiente.map((p) => p.periodo)).size;
  const sinTasa = ((sinTasaR.data ?? []) as { movimientos: number | string }[]).reduce((s, r) => s + Number(r.movimientos), 0);
  const sinTipo = (sinTipoR.data ?? []).reduce((s, r) => s + Number(r.movimientos), 0);
  const sinAsignar = sinAsignarR.count ?? 0;
  const hayPendientes = repartoPendiente.length > 0 || sinTasa > 0 || sinTipo > 0 || sinAsignar > 0;

  const paises = paisesR.data ?? [];
  const filasCapital: FilaCapital[] = (capitalR.data ?? []).map((c: Record<string, unknown>) => {
    const pais = paises.find((p) => p.id === c.pais_id);
    return {
      pais: pais?.nombre ?? "—",
      moneda: pais?.codigo === "CR" ? "CRC" : "USD",
      cxcPlataformas: Number(c.cxc_plataformas ?? 0),
      retirosEnTransito: Number(c.retiros_en_transito ?? 0),
      cxpProveedores: Number(c.cxp_proveedores ?? 0),
      dso: c.dso_dias === null || c.dso_dias === undefined ? null : Number(c.dso_dias),
      dpo: c.dpo_dias === null || c.dpo_dias === undefined ? null : Number(c.dpo_dias),
    };
  });

  const elegido = unidadElegida?.id ?? TODAS;
  const periodoQuery = periodo.clave === "u12" ? null : periodo.clave;
  const vistaQueryEerr = vistaEerr === "mensual" ? null : vistaEerr;
  const baseQuery = base === basePredeterminada ? null : base;
  const href = (cambios: Record<string, string | null | undefined>) =>
    conParametros(RUTA, { ...vistaQuery, ver: unidadElegida?.id, periodo: periodoQuery, vista: vistaQueryEerr, base: baseQuery, ...cambios });
  const opcionesVista = VISTAS.filter(
    (v) => (v.valor !== "moneda" || conMonedaLocal) && (hayPartes || (v.valor !== "tiendas" && v.valor !== "canal")) && (v.valor !== "transferencia" || conTransferencia),
  ).map((v) => ({
    valor: v.valor,
    etiqueta: v.valor === "moneda" && vista.entidad ? `${vista.entidad.moneda} y USD` : v.etiqueta,
    href: href({ vista: v.valor === "mensual" ? null : v.valor }),
  }));
  const opcionesBase = BASES_REPARTO.map((b) => ({
    valor: b.clave,
    etiqueta: b.clave === basePredeterminada ? `${b.etiqueta} (guardada)` : b.etiqueta,
    href: href({ base: b.clave === basePredeterminada ? null : b.clave }),
  }));
  const conBase = hayPartes && vistaEerr !== "moneda";
  const opcionesTienda = [{ id: TODAS, nombre: "Todas las tiendas" }, ...elegibles.map((u) => ({ id: u.id, nombre: u.nombre }))].map((o) => ({
    valor: o.id,
    etiqueta: o.nombre,
    href: href({ ver: o.id === TODAS ? null : o.id }),
  }));
  const contexto = [vista.entidad?.razon_social ?? (conEntidad ? "Consolidado" : null), unidadElegida?.nombre, MONEDA].filter(Boolean).join(" · ");

  const eliminadoPeriodo = repartido ? meses.reduce((a, m) => a + (repartido.eliminado[m] ?? 0), 0) : 0;
  const detalleTabla = `${contexto}${conBase && vistaEerr !== "interanual" ? ` · reparto por ${etiquetaBase(base).toLowerCase()}` : ""} · ${rangoPeriodo(periodo)}`;
  const desgloseBase = { entidadId, base, sinIntercompania: consolidado, local: vista.local, moneda: MONEDA, puedeMarcar };
  const columnasMes: ColumnaAF4[] = meses.map((m) => ({ clave: m, etiqueta: mesCorto(m), ...(m >= mesEnCurso ? { detalle: "parcial" } : {}) }));
  const unidadesPartes = hayPartes ? partesR.unidades : [];
  const nombreUnidad = new Map(unidadesPartes.map((u) => [u.id, u.nombre]));

  // Comentarios por cifra en todas las vistas. Las columnas de mes (Por mes, 12 meses móviles, moneda local y USD) valen
  // para cualquier período; las que dependen del período elegido (año anterior, por tienda, por canal) lo llevan en el ámbito.
  const ambitoVista =
    vistaEerr === "mensual"
      ? ambitoComentarios
      : vistaEerr === "ttm" || vistaEerr === "moneda"
        ? `${ambitoComentarios}-${vistaEerr}`
        : `${ambitoComentarios}-${vistaEerr}-${periodo.clave}-${base}`;
  const comentarios: ComentariosTabla = { pagina: "estado-resultados", periodo: "", ambito: ambitoVista, periodoTotal: periodo.clave, hilos };

  let tabla: ReactNode;
  if (vistaEerr === "interanual") {
    const ia = eerrInteranual(filasBase, meses, conDatos);
    tabla = ia.conAnterior.length ? (
      <TablaEerr
        key={`${ambitoVista}-${periodo.clave}`}
        comentarios={comentarios}
        id="tabla-pyl"
        titulo="Contra el mismo período del año anterior"
        detalle={detalleTabla}
        columnas={[
          { clave: "actual", etiqueta: rangoPeriodo(periodo) },
          {
            clave: "anterior",
            etiqueta: "Año anterior",
            ...(ia.conAnterior.length < meses.length ? { marca: { tono: "warning" as const, texto: `Solo ${ia.conAnterior.length} de ${meses.length} meses con datos` } } : {}),
          },
          { clave: "variacion", etiqueta: "Variación" },
          { clave: "variacion-pct", etiqueta: "Var. %" },
        ]}
        filas={filasInteranual(filasBase, meses)}
        moneda={MONEDA}
        conTotal={false}
        formatos={[{ moneda: MONEDA }, { moneda: MONEDA }, { moneda: MONEDA, variacion: true }, "porcentaje"]}
        ariaLabel="Estado de resultados contra el mismo período del año anterior"
      />
    ) : (
      <MarcoAF4 id="tabla-pyl" titulo="Contra el mismo período del año anterior" detalle={detalleTabla}>
        <EstadoVacioAF4 compacto titulo="Todavía no hay datos del mismo período del año anterior" />
      </MarcoAF4>
    );
  } else if (vistaEerr === "ttm") {
    const movil = eerrMovil(filasBase, meses, conDatos);
    tabla = (
      <TablaEerr
        key={`${ambitoVista}-${periodo.clave}`}
        comentarios={comentarios}
        id="tabla-pyl"
        titulo="Últimos 12 meses (total móvil)"
        detalle={detalleTabla}
        columnas={meses.map((m) => ({
          clave: m,
          etiqueta: mesCorto(m),
          ...(movil.completos.has(m) ? {} : { marca: { tono: "warning" as const, texto: "Menos de 12 meses de historia" } }),
        }))}
        filas={desdeEerr(filasEstado(movil.eerr), meses)}
        moneda={MONEDA}
        conTotal={false}
        ariaLabel="Estado de resultados de los últimos 12 meses en total móvil"
      />
    );
  } else if ((vistaEerr === "tiendas" || vistaEerr === "canal") && repartido) {
    const porTienda = vistaEerr === "tiendas";
    const canalDeUnidad = new Map(unidadesPartes.map((u) => [u.id, canalDe(u.canal)]));
    const grupoDe = (id: string) => (porTienda ? id : (canalDeUnidad.get(id) ?? canalDe(null)));
    const candidatos: string[] = porTienda ? unidadesPartes.map((u) => u.id) : COLUMNAS_CANAL;
    const e = eerrPorGrupo(repartido.filas, meses, grupoDe, candidatos);
    const grupos = gruposConDatos(e, candidatos);
    const eg = eerrPorGrupo(repartido.filas, meses, grupoDe, grupos);
    const r = resultadoConReparto(repartido.directas, repartido.repartidas, meses, grupoDe, grupos);
    const etiqueta = (g: string) => (porTienda ? (nombreUnidad.get(g) ?? "—") : ETIQUETA_CANAL[g as keyof typeof ETIQUETA_CANAL]);
    tabla = grupos.length ? (
      <TablaEerr
        key={`${ambitoVista}-${periodo.clave}`}
        comentarios={comentarios}
        id="tabla-pyl"
        titulo={porTienda ? "Estado de resultados por tienda" : "Estado de resultados por canal de venta"}
        detalle={detalleTabla}
        columnas={grupos.map((g) => ({
          clave: g,
          etiqueta: etiqueta(g),
          ...(r.quedanEnPerdida.includes(g) ? { marca: { tono: "warning" as const, texto: "Queda en pérdida por el reparto" } } : {}),
        }))}
        filas={[...desdeEerr(filasEstado(eg), grupos), ...filasReparto(r, grupos)]}
        moneda={MONEDA}
        ventas={grupos.map((g) => eg.ingresosNetos[g] ?? 0)}
        ariaLabel={porTienda ? "Estado de resultados por tienda" : "Estado de resultados por canal de venta"}
        desglose={
          porTienda
            ? { ...desgloseBase, columnas: grupos.map((g) => ({ meses, unidadId: g })), total: { meses, unidadId: null } }
            : undefined
        }
      />
    ) : (
      <EstadoVacioAF4 titulo="Todavía no hay movimientos en el libro para este período" />
    );
  } else if (vistaEerr === "transferencia" && hayPartes) {
    const tp = meses.length ? await cargarPrecioTransferencia(supabase, meses[0], meses[meses.length - 1]) : { error: "Sin meses." };
    if ("error" in tp) {
      tabla = (
        <MarcoAF4 id="tabla-pyl" titulo="Estado de resultados con precio de transferencia" detalle={detalleTabla}>
          <EstadoVacioAF4 compacto titulo="El precio de transferencia todavía no está instalado">{tp.error}</EstadoVacioAF4>
        </MarcoAF4>
      );
    } else {
      const unidadesTP = unidadesPartes.map((u) => ({ id: u.id, nombre: u.nombre, clase: u.clase }));
      // Como el consolidado: sin lo intercompañía del libro (las ventas a precio de transferencia se eliminan aparte).
      const baseTP = repartirEerr(partesR.partes, pesosReparto(base, partesR.partes, partesR.envios, partesR.unidades), { sinIntercompania: true }).filas;
      const r = ajustesTP({ filas: baseTP, ventas: tp.ventas, reglas: tp.reglas, politica: tp.politica, unidades: unidadesTP, meses });
      const todas = [...baseTP, ...r.ajustes, ...r.eliminaciones];
      const candidatos = [...unidadesPartes.map((u) => u.id), UNIDAD_ELIMINACIONES];
      const grupos = gruposConDatos(eerrPorGrupo(todas, meses, (id) => id, candidatos), candidatos);
      const eg = eerrPorGrupo(todas, meses, (id) => id, grupos);
      const tt = totalesTP(r.diferencias);
      tabla = !r.proveedora ? (
        <MarcoAF4 id="tabla-pyl" titulo="Estado de resultados con precio de transferencia" detalle={detalleTabla}>
          <EstadoVacioAF4 compacto titulo="Falta elegir la importadora" accion={{ href: "/estado-resultados/precio-transferencia", etiqueta: "Configurar el precio de transferencia" }} />
        </MarcoAF4>
      ) : (
        <>
          <KpiGroup titulo="Precio de transferencia" accion={<Link href={conParametros("/estado-resultados/precio-transferencia", { periodo: periodoQuery })} className="text-xs font-medium underline-offset-2 hover:underline">Ver las diferencias por tienda</Link>}>
            <KpiGrid compacta>
              <KpiCard compacta titulo="Ventas intercompañía de la importadora" valor={dinero(tt.esperado, MONEDA)} />
              <KpiCard compacta titulo="Mercancía que el libro ya cargó a las tiendas" valor={dinero(tt.registrado, MONEDA)} subtexto={tt.pctRegistrado === null ? undefined : `${porcentaje(tt.pctRegistrado)} de sus ventas`} />
              <KpiCard compacta tono={tt.costoNoCargado > 0 ? "warning" : "neutral"} titulo="Costo que no se les cargaba" valor={dinero(tt.costoNoCargado, MONEDA)} />
              <KpiCard compacta titulo="Margen de la importadora" valor={dinero(tt.margenImportadora, MONEDA)} />
              {tt.sinCosto > 0 && <KpiCard compacta tono="warning" titulo="Unidades entregadas sin costo" valor={entero(tt.sinCosto)} href="/costos-mercancia" />}
            </KpiGrid>
          </KpiGroup>
          <TablaEerr
            key={`${ambitoVista}-${periodo.clave}`}
            comentarios={comentarios}
            id="tabla-pyl"
            titulo="Estado de resultados por tienda con precio de transferencia"
            detalle={`${detalleTabla} · el total es el consolidado sin intercompañía`}
            columnas={grupos.map((g) => ({
              clave: g,
              etiqueta: g === UNIDAD_ELIMINACIONES ? "Eliminaciones" : (nombreUnidad.get(g) ?? "—"),
              ...(g === r.proveedora ? { detalle: "importadora" } : {}),
            }))}
            filas={desdeEerr(filasEstado(eg), grupos)}
            moneda={MONEDA}
            ventas={grupos.map((g) => eg.ingresosNetos[g] ?? 0)}
            ariaLabel="Estado de resultados por tienda con precio de transferencia"
          />
        </>
      );
    }
  } else if (vistaEerr === "moneda" && vista.entidad) {
    const local = hayPartes ? repartir(true)!.filas : null;
    const usd = hayPartes ? repartir(false)!.filas : null;
    const [filasLocal, filasUsd] =
      local && usd
        ? [local, usd].map((l) => l.filter((f) => !unidadElegida || f.unidad_id === unidadElegida.id))
        : await Promise.all(
            [true, false].map(async (l) => {
              const c = await cargarEerr(supabase, unidadElegida?.id ?? null, ventana, { entidadId, local: l });
              return "error" in c ? [] : c.filas;
            }),
          );
    const dos = filasDosMonedas(filasLocal, filasUsd, meses);
    const ml = vista.entidad.moneda;
    tabla = (
      <TablaEerr
        key={`${ambitoVista}-${periodo.clave}`}
        comentarios={comentarios}
        id="tabla-pyl"
        titulo={`Estado de resultados en ${ml} y USD`}
        detalle={`${vista.entidad.razon_social}${unidadElegida ? ` · ${unidadElegida.nombre}` : ""} · ${rangoPeriodo(periodo)}`}
        columnas={dos.claves.map((k) => {
          const [m, mon] = k.split("|");
          return { clave: k, etiqueta: m === "total" ? "Total" : mesCorto(m), detalle: mon === "local" ? ml : "USD" };
        })}
        filas={dos.filas}
        moneda={ml}
        conTotal={false}
        formatos={dos.claves.map((k) => ({ moneda: k.endsWith("|local") ? ml : "USD" }))}
        ariaLabel={`Estado de resultados en ${ml} y en dólares`}
      />
    );
  } else {
    tabla = (
      <TablaEerr
        key={`${ambitoVista}-${periodo.clave}`}
        comentarios={comentarios}
        id="tabla-pyl"
        titulo="Estado de resultados"
        detalle={detalleTabla}
        columnas={columnasMes}
        filas={desdeEerr(filasEstado(eerr), meses)}
        moneda={MONEDA}
        ventas={meses.map((m) => eerr.ingresosNetos[m] ?? 0)}
        ariaLabel="Estado de resultados por mes"
        desglose={{ ...desgloseBase, columnas: meses.map((m) => ({ meses: [m], unidadId: unidadElegida?.id ?? null })), total: { meses, unidadId: unidadElegida?.id ?? null } }}
      />
    );
  }

  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <RecordarTienda explicito={valorExplicito(params, "ver")} global={tiendaGlobal} />
      <EncabezadoAF4
        titulo="Estado de resultados"
        filtros={
          <>
            <ControlPeriodo periodo={periodo} opciones={opciones} href={(p) => href({ periodo: p === "u12" ? null : p })} />
            <SelectorEntidad ruta={RUTA} opciones={ctx.opciones} vista={vista} otros={{ ver: unidadElegida?.id, periodo: periodoQuery, vista: vistaQueryEerr, base: baseQuery }} />
            {vistaEerr !== "tiendas" && vistaEerr !== "canal" && vistaEerr !== "transferencia" && <ControlSegmentado etiqueta="Ver por tienda" opciones={opcionesTienda} elegido={elegido} maxBotones={5} />}
            <ControlSegmentado etiqueta="Elegir vista" opciones={opcionesVista} elegido={vistaEerr} maxBotones={3} />
            {conBase && <ControlSegmentado etiqueta="Base de reparto" opciones={opcionesBase} elegido={base} />}
          </>
        }
        datosHasta={conDatos.filter((m) => m <= mesEnCurso).sort().at(-1) ?? null}
        actualizado={actualizado}
        descarga={hayDatos ? { href: conParametros("/api/exportar-eerr", { ...vistaQuery, ver: unidadElegida?.id, periodo: periodoQuery }) } : null}
      />

      {!hayDatos ? (
        <EstadoVacioAF4 titulo="Todavía no hay movimientos en el libro para este período" accion={{ href: "/libro-movimientos", etiqueta: "Ir al libro de movimientos" }} />
      ) : (
        <>
          <FilaKpiAF4>
            <KpiAF4
              titulo="Ingresos netos"
              valor={dineroKpi(t.ingresos, MONEDA)}
              comparaciones={comparar(t.ingresos, a?.ingresos)}
              serie={serie(eerr.ingresosNetos)}
              moneda={MONEDA}
            />
            <KpiAF4
              titulo="Margen bruto"
              tono={tonoSigno(t.margenBruto)}
              valor={dineroKpi(t.margenBruto, MONEDA)}
              comparaciones={compararMargen(margenBrutoPct, a ? sobre(a.margenBruto, a.ingresos) : null)}
              subtexto={`${porcentaje(margenBrutoPct)} de los ingresos`}
              moneda={MONEDA}
            />
            <KpiAF4
              titulo="EBITDA"
              destacado
              tono={tonoSigno(t.ebitda)}
              valor={dineroKpi(t.ebitda, MONEDA)}
              comparaciones={comparar(t.ebitda, a?.ebitda)}
              serie={serie(eerr.ebitda)}
              subtexto={`Margen ${porcentaje(margenEbitdaPct)}`}
              moneda={MONEDA}
            />
            <KpiAF4
              titulo="Resultado neto"
              tono={tonoSigno(t.resultadoNeto)}
              valor={dineroKpi(t.resultadoNeto, MONEDA)}
              comparaciones={comparar(t.resultadoNeto, a?.resultadoNeto)}
              subtexto={t.dividendos > 0 ? `Incluye ${dinero(t.dividendos, MONEDA)} de retiros de dividendos` : undefined}
              moneda={MONEDA}
            />
            <KpiAF4
              titulo="Valor de empresa"
              valor={dineroKpi(valorEmpresa(ebitdaAnual, multiplo), MONEDA)}
              subtexto={`EBITDA anualizado ${dinero(ebitdaAnual, MONEDA)} × ${multiplo}`}
              href="/panel-financiero/valoracion"
              moneda={MONEDA}
            />
          </FilaKpiAF4>

          {hayPendientes && veTodaLaEmpresa(permitidas) && (
            <KpiGroup titulo="Pendientes de datos">
              <KpiGrid compacta>
                {repartoPendiente.length > 0 && (
                  <KpiCard
                    compacta
                    tono="warning"
                    titulo="Gastos sin repartir"
                    valor={dinero(repartoPendiente.reduce((s, p) => s + Number(p.monto), 0), MONEDA)}
                    subtexto={`Sin base (${etiquetaBase(base).toLowerCase()}) en ${mesesPendientes === 1 ? "1 mes" : `${mesesPendientes} meses`}`}
                  />
                )}
                {sinTasa > 0 && (
                  <KpiCard compacta tono="warning" titulo="Movimientos sin tipo de cambio" valor={entero(sinTasa)} href="/estado-resultados/tipos-cambio" />
                )}
                {sinTipo > 0 && <KpiCard compacta tono="warning" titulo="Movimientos sin tipo" valor={entero(sinTipo)} href="/libro-movimientos/pendientes" />}
                {sinAsignar > 0 && (
                  <KpiCard compacta tono="warning" titulo="Movimientos sin tienda" valor={entero(sinAsignar)} href="/libro-movimientos/pendientes" />
                )}
              </KpiGrid>
            </KpiGroup>
          )}

          <GraficaBarrasAF4
            id="grafica-resultados"
            titulo="Ingresos y EBITDA por mes"
            detalle={`${contexto} · ${rangoPeriodo(periodo)}`}
            moneda={MONEDA}
            formatoDerecha="porcentaje"
            datos={meses.map((m) => ({
              etiqueta: mesCorto(m),
              ingresos: eerr.ingresosNetos[m] ?? 0,
              ebitda: eerr.ebitda[m] ?? 0,
              margen: sobre(eerr.ebitda[m] ?? 0, eerr.ingresosNetos[m] ?? 0),
            }))}
            series={[
              { clave: "ingresos", nombre: "Ingresos netos", color: 1 },
              { clave: "ebitda", nombre: "EBITDA", color: 2 },
              { clave: "margen", nombre: "Margen EBITDA", color: 3, forma: "linea", trazo: "rayas", derecha: true },
            ]}
          />

          {consolidado && eliminadoPeriodo !== 0 && (
            <KpiGroup titulo="Consolidación">
              <KpiGrid compacta>
                <KpiCard compacta titulo="Eliminaciones intercompañía (efecto en el resultado)" valor={dinero(-eliminadoPeriodo, MONEDA)} href="/estado-resultados/ajustes" />
              </KpiGrid>
            </KpiGroup>
          )}

          {tabla}

          {nota && <NotasMes id="notas-eerr" periodo={meses[meses.length - 1]} texto={nota.texto} faltaMigracion={nota.faltaMigracion} puedeEscribir={puedeEscribir} />}
        </>
      )}

      {veTodaLaEmpresa(permitidas) && <CapitalDeTrabajo filas={filasCapital} />}
    </Pagina>
  );
}
