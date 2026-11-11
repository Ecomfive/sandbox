// Lectura de la Proyección de caja desde Supabase (migración 0918 y las tablas de los demás módulos). La comparten la
// página /proyeccion-caja, su descarga en Excel y la página de precisión. Solo lectura, salvo `guardarFotoSiFalta`; los
// permisos los decide quien llama. La lógica está en `proyeccion-caja.ts`.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { cargarFlujo } from "./cargar-flujo";
import { cajaTotal, saldosPorCuenta } from "./flujo";
import { cargarDeuda, cargarTransitoDropi } from "./cargar-tesoreria";
import { pagosDeuda } from "./deuda";
import { ingresosTransito, supuestoTransito, type SupuestoTransito } from "./tesoreria";
import { lineasComprasPlanificadas } from "./cargar-compras-costos";
import {
  PROBABILIDADES_POR_DEFECTO,
  VENTANA_DIVIDENDOS,
  diasDeRetiro,
  etiquetaRecurrente,
  finDeMes,
  fotoDe,
  lineaPromedio,
  lineaRitmo,
  lineasAjustes,
  lineasFechadas,
  lineasCartera,
  lineasCompras,
  lineasNomina,
  lineasRecurrentes,
  lineasRetiros,
  lineasVentas,
  mesesHasta,
  partidasLibro,
  patronPagos,
  promedioSemanal,
  semanasProyeccion,
  sumarDias,
  supuestosVentas,
  ultimoMesCompleto,
  validarFoto,
  compararFotos,
  realPorSemana,
  rubroLibro,
  ventanaPromedio,
  type AjusteProyeccion,
  type CompraAbierta,
  type CostoNomina,
  type FotoProyeccion,
  type GastoRecurrente,
  type Linea,
  type MovimientoLibro,
  type PagoHabitual,
  type Probabilidades,
  type Proyeccion,
  type ResultadoPrecision,
  type SupuestoVentas,
} from "./proyeccion-caja";

export const SIN_MIGRACION_PROYECCION = "Falta correr la migración 0918 (proyección de caja) en Supabase.";

/** Etapas de una compra ya hecha (lo anterior es cotizar: todavía no hay nada que pagar). */
const ETAPAS_COMPROMETIDAS = ["compra_pago", "produccion", "tracking", "aviso_logistica", "arribo_mercancia"];

export const CLAVES_CONFIG = ["caja_minima", "proyeccion_caja_inicial", "proyeccion_probabilidades"] as const;

export interface ConfigProyeccion {
  cajaMinima: number;
  cajaManual: { monto: number; fecha: string } | null;
  probabilidades: Probabilidades;
}

const numero = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const fecha10 = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const entre01 = (v: unknown, d: number) => {
  const n = numero(v);
  return n !== null && n >= 0 && n <= 1 ? n : d;
};

export function leerConfig(filas: { clave: string; valor: unknown }[]): ConfigProyeccion {
  const de = (c: string) => filas.find((f) => f.clave === c)?.valor;
  const manual = de("proyeccion_caja_inicial") as { monto?: unknown; fecha?: unknown } | undefined;
  const monto = numero(manual?.monto);
  const fecha = fecha10(manual?.fecha);
  const p = (de("proyeccion_probabilidades") ?? {}) as Record<string, unknown>;
  return {
    cajaMinima: numero(de("caja_minima")) ?? 0,
    cajaManual: monto !== null && fecha ? { monto, fecha } : null,
    probabilidades: {
      cobroVencido: entre01(p.cobroVencido, PROBABILIDADES_POR_DEFECTO.cobroVencido),
      pagoVencido: entre01(p.pagoVencido, PROBABILIDADES_POR_DEFECTO.pagoVencido),
    },
  };
}

export type FuenteCaja = "saldos" | "manual" | "sin_caja";

export interface DatosProyeccion {
  hoy: string;
  semanas: string[];
  /** Todas las partidas (sin escenario aplicado), con dividendos. */
  lineas: Linea[];
  cajaHoy: number;
  fuenteCaja: FuenteCaja;
  config: ConfigProyeccion;
  ajustes: AjusteProyeccion[];
  supuestos: {
    ventas: (SupuestoVentas & { tienda: string })[];
    ventanaVentas: string[];
    ventanaLibro: string[];
    mesCompletoLibro: string | null;
    recurrentes: GastoRecurrente[];
    impuestos: GastoRecurrente[];
    diasRetiro: number;
    patrones: Record<string, PagoHabitual[]>;
    repartidoresPorSemana: number;
    envioPorSemana: number;
    ingresosOtros: { unidad: string; porSemana: number }[];
    tiendasDeTerceros: string[];
    marketingPorSemana: number;
    otrosPorSemana: number;
    mercanciaPorSemana: number;
    dividendosPorSemana: number;
    porCobrarVencido: number;
    porPagarVencido: number;
    /** Pedidos de Dropi despachados sin entregar que entran como ingreso esperado (null sin historia o sin la migración 0931). */
    transito: { pedidos: number; monto: number; esperado: number; supuesto: SupuestoTransito } | null;
    /** Cuotas de préstamos e intereses de líneas en las 13 semanas (sin la migración 0932, 0). */
    deuda: number;
  };
}

interface FilaLibro {
  id: string;
  fecha: string;
  unidad_id: string | null;
  tipo: string | null;
  seccion: string | null;
  signo: number;
  bloque: string | null;
  descripcion: string;
  monto: number | string;
  es_bien_de_uso: boolean;
}

const aMovimiento = (f: FilaLibro): MovimientoLibro => ({
  fecha: String(f.fecha).slice(0, 10),
  unidad_id: f.unidad_id,
  tipo: f.tipo,
  seccion: f.seccion,
  signo: Number(f.signo),
  bloque: f.bloque,
  descripcion: f.descripcion ?? "",
  monto: Number(f.monto),
  esBienDeUso: !!f.es_bien_de_uso,
});

/** Los movimientos del libro que mueven caja entre dos fechas (inclusive). */
export async function cargarLibro(supabase: SupabaseClient, desde: string, hasta: string): Promise<{ error: string } | MovimientoLibro[]> {
  const r = await traerTodasConError<FilaLibro>((a, b) => supabase.rpc("fin_proyeccion_libro", { p_desde: desde, p_hasta: hasta }).range(a, b));
  if (r.error) return { error: SIN_MIGRACION_PROYECCION };
  return (r.data ?? []).map(aMovimiento);
}

/** Todo lo que la proyección necesita, ya convertido en partidas por semana. `hoy` en hora de Panamá. */
export async function cargarProyeccion(supabase: SupabaseClient, hoy: string): Promise<{ error: string } | DatosProyeccion> {
  const semanas = semanasProyeccion(hoy);
  const ayer = sumarDias(hoy, -1);
  const mesDeHoy = `${hoy.slice(0, 7)}-01`;
  const ventanaVentas = ventanaPromedio(hoy, null);
  const finVentana = sumarDias(ventanaVentas[ventanaVentas.length - 1], 6);
  const desdeLibro = mesesHasta(mesDeHoy, 7)[0];

  const paisId: Promise<string | null> = Promise.resolve(supabase.from("paises").select("id").eq("codigo", "PA")).then(({ data }) => (data?.[0]?.id as string | undefined) ?? null);
  // Una consulta de Panamá (retiros y compras son por país); sin el país, nada.
  const delPais = async (consulta: (id: string) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<{ data: Record<string, unknown>[]; error: unknown }> => {
    const id = await paisId;
    if (!id) return { data: [], error: null };
    const r = await consulta(id);
    return { data: (r.data ?? []) as Record<string, unknown>[], error: r.error };
  };
  const [
    config,
    ajustes,
    flujo,
    ventas,
    comisiones,
    unidades,
    cartera,
    retiros,
    compras,
    costos,
    comisionesNomina,
    lineasNom,
    cierres,
    semanasDel,
    libro,
    meses,
    cerrados,
    transitoDropi,
    deudaTes,
  ] = await Promise.all([
    supabase.from("fin_config").select("clave, valor").in("clave", [...CLAVES_CONFIG]),
    supabase.from("fin_proyeccion_ajustes").select("id, semana, concepto, monto, nota").gte("semana", semanas[0]).order("semana").order("creado_en"),
    cargarFlujo(supabase),
    supabase.rpc("fin_proyeccion_ventas", { p_desde: ventanaVentas[0], p_hasta: finVentana }),
    supabase.rpc("fin_proyeccion_comisiones", { p_desde: sumarDias(hoy, -60), p_hasta: ayer }),
    supabase.from("fin_unidades").select("id, nombre"),
    supabase.from("fin_cartera_saldos").select("clase, saldo, vencimiento_efectivo, estado").in("estado", ["pendiente", "parcial"]),
    delPais(async (id) =>
      supabase
        .from("retiros")
        .select("numero_correlativo, fecha, estado, a_recibir, monto_neto, fecha_recibido, fecha_cierre")
        .eq("pais_id", id)
        .gte("fecha", sumarDias(hoy, -120)),
    ),
    delPais(async (id) =>
      supabase
        .from("wms_compras")
        .select("codigo, nombre, etapa, estado, anulada_en, monto_total, primer_pago, segundo_pago, pagado_a_proveedor, fecha_pago_1, fecha_pago_2, fecha_envio, fecha_limite, fecha_llegada")
        .eq("pais_id", id)
        .in("etapa", ETAPAS_COMPROMETIDAS)
        .neq("estado", "completado")
        .is("anulada_en", null),
    ),
    supabase.from("nom_costo_mensual").select("periodo, tipo, neto, retenciones").gte("periodo", mesesHasta(mesDeHoy, 4)[0]),
    supabase.from("nom_periodos").select("periodo, tipo, comision").gte("periodo", mesesHasta(mesDeHoy, 4)[0]),
    supabase.from("nom_lineas").select("periodo, tipo, fecha_pago, neto").gte("periodo", mesesHasta(mesDeHoy, 4)[0]).not("fecha_pago", "is", null),
    supabase.from("del_cierres").select("fecha_pago, a_pagar").eq("estado", "pagado").gte("fecha_pago", ventanaVentas[0]).lte("fecha_pago", finVentana),
    supabase.from("del_semanas").select("semana, tarifas, propinas, aparte").gte("semana", sumarDias(ventanaVentas[0], -3)).lte("semana", finVentana),
    cargarLibro(supabase, desdeLibro, ayer),
    supabase.rpc("fin_proyeccion_meses_libro", { p_desde: mesesHasta(mesDeHoy, 8)[0] }),
    supabase.from("fin_cierres").select("periodo").eq("estado", "cerrado"),
    cargarTransitoDropi(supabase),
    cargarDeuda(supabase),
  ]);

  if (ajustes.error || "error" in libro || ventas.error || meses.error) return { error: SIN_MIGRACION_PROYECCION };
  if ("error" in flujo) return { error: flujo.error };
  if (config.error) return { error: "Falta correr la migración 0917 (ajustes de Finanzas) en Supabase." };
  const cfg = leerConfig((config.data ?? []) as { clave: string; valor: unknown }[]);
  const nombres = new Map((unidades.data ?? []).map((u) => [u.id as string, u.nombre as string]));
  const lineas: Linea[] = [];

  // ---- Caja de hoy (al comenzar el día)
  let cajaHoy = 0;
  let fuenteCaja: FuenteCaja = "sin_caja";
  if (flujo.saldos.length) {
    const cuentas = saldosPorCuenta(flujo.filas, flujo.saldos, flujo.cuentas, [mesDeHoy]);
    const finMes = cajaTotal(cuentas, [mesDeHoy]).final[mesDeHoy];
    const { data: despues, error } = await supabase.rpc("fin_proyeccion_flujo_entre", { p_desde: ayer, p_hasta: finDeMes(hoy) });
    if (error) return { error: SIN_MIGRACION_PROYECCION };
    cajaHoy = Math.round((finMes - Number(despues ?? 0)) * 100) / 100;
    fuenteCaja = "saldos";
  } else if (cfg.cajaManual) {
    let movido = 0;
    if (cfg.cajaManual.fecha < hoy) {
      const { data, error } = await supabase.rpc("fin_proyeccion_flujo_entre", { p_desde: sumarDias(cfg.cajaManual.fecha, -1), p_hasta: ayer });
      if (error) return { error: SIN_MIGRACION_PROYECCION };
      movido = Number(data ?? 0);
    }
    cajaHoy = Math.round((cfg.cajaManual.monto + movido) * 100) / 100;
    fuenteCaja = "manual";
  }

  // ---- Libro: lo que va al ritmo de las últimas semanas (se usa en varias partidas)
  const conteos = new Map<string, number>(((meses.data ?? []) as Record<string, unknown>[]).map((m) => [String(m.mes).slice(0, 10), Number(m.movimientos)]));
  const mesCompleto = ultimoMesCompleto(conteos, hoy, (cerrados.data ?? []).map((c) => String(c.periodo).slice(0, 10)));
  const finLibro = mesCompleto ? finDeMes(mesCompleto) : null;
  const ventanaLibro = ventanaPromedio(hoy, finLibro);
  const ventanaDiv = ventanaPromedio(hoy, finLibro, VENTANA_DIVIDENDOS);
  const mesesCompletos = mesCompleto ? mesesHasta(mesCompleto, 4) : [];
  const filasVentas = ((ventas.data ?? []) as Record<string, unknown>[]).map((v) => ({
    unidad_id: v.unidad_id as string,
    semana: String(v.semana).slice(0, 10),
    metodo: (v.metodo as string | null) ?? null,
    enviadas: Number(v.enviadas),
    entregadas: Number(v.entregadas),
    devueltas: Number(v.devueltas),
    valor_entregadas: Number(v.valor_entregadas),
  }));
  const tiendasConVentas = new Set(filasVentas.map((v) => v.unidad_id));
  const delLibro = partidasLibro(libro, mesesCompletos, ventanaLibro, ventanaDiv, tiendasConVentas);

  // ---- Ventas por tienda (solo las tiendas propias: con ingresos en el libro)
  const comision: Record<string, number> = {};
  for (const c of (comisiones.data ?? []) as Record<string, unknown>[]) if (Number(c.bruto) > 0) comision[c.metodo as string] = Number(c.comision) / Number(c.bruto);
  const propias = delLibro.conIngresos.length ? new Set(delLibro.conIngresos) : undefined;
  const supVentas = supuestosVentas(filasVentas, ventanaVentas, comision, propias);
  lineas.push(...lineasVentas(supVentas, nombres, hoy));
  const tiendasDeTerceros = propias ? [...tiendasConVentas].filter((u) => !propias.has(u)).map((u) => nombres.get(u) ?? "Sin tienda") : [];

  // ---- Retiros de Dropi abiertos
  const filasRetiros = retiros.data as unknown as { numero_correlativo: number | null; fecha: string; estado: string; a_recibir: number | null; monto_neto: number | null; fecha_recibido: string | null; fecha_cierre: string | null }[];
  const dias = diasDeRetiro(
    filasRetiros
      .filter((r) => r.estado === "cerrado" && (r.fecha_recibido || r.fecha_cierre))
      .map((r) => ({ fecha: String(r.fecha).slice(0, 10), recibido: String(r.fecha_recibido ?? r.fecha_cierre).slice(0, 10) })),
  );
  const abiertos = filasRetiros
    .filter((r) => r.estado === "abierto")
    .map((r) => ({ etiqueta: r.numero_correlativo ? `#${String(r.numero_correlativo).padStart(4, "0")}` : "Retiro", monto: Number(r.a_recibir ?? r.monto_neto ?? 0), fecha: String(r.fecha).slice(0, 10) }))
    .filter((r) => r.monto > 0);
  const lineasDeRetiros = lineasRetiros(abiertos, dias, hoy, semanas);
  lineas.push(...lineasDeRetiros);
  // Pedidos de Dropi en tránsito: monto × tasa de entrega × neto, cuando Dropi suele acreditar más los días de un retiro.
  const supTransito = transitoDropi ? supuestoTransito(transitoDropi.historia) : null;
  const esperadosTransito = transitoDropi && supTransito ? ingresosTransito(transitoDropi.pedidos, supTransito, dias, hoy) : [];
  const lineasDeTransito = lineasFechadas(
    "dropi_transito",
    esperadosTransito.map((x) => ({ detalle: "Despachados sin entregar", fecha: x.fecha, monto: x.monto })),
    hoy,
    semanas,
  );
  lineas.push(...lineasDeTransito);
  // Ingresos de las demás unidades (lo que entra de Dropi) al ritmo del libro, sin contar dos veces los retiros abiertos
  // ni los pedidos en tránsito.
  delLibro.ingresosOtros.forEach((x, i) => {
    const l = lineaRitmo("otros_ingresos", nombres.get(x.unidad_id) ?? "Sin unidad", x.porSemana, i === 0 ? [...lineasDeRetiros, ...lineasDeTransito] : [], hoy);
    if (l) lineas.push(l);
  });

  // ---- Cartera
  const docs = (cartera.data ?? []).map((d) => ({
    clase: d.clase as "cobrar" | "pagar",
    saldo: Number(d.saldo),
    vencimiento: d.vencimiento_efectivo ? String(d.vencimiento_efectivo).slice(0, 10) : null,
  }));
  lineas.push(...lineasCartera(docs, hoy, semanas, cfg.probabilidades));
  const vencido = (clase: string) =>
    Math.round(docs.filter((d) => d.clase === clase && d.saldo > 0 && (!d.vencimiento || d.vencimiento < hoy)).reduce((a, d) => a + d.saldo, 0) * 100) / 100;

  // ---- Compras abiertas y reposición
  const filasCompras: CompraAbierta[] = compras.data
    .filter((c) => numero(c.monto_total) !== null)
    .map((c) => ({
      etiqueta: String(c.codigo ?? c.nombre ?? "Compra"),
      monto_total: Number(c.monto_total),
      primer_pago: numero(c.primer_pago),
      segundo_pago: numero(c.segundo_pago),
      pagado_a_proveedor: numero(c.pagado_a_proveedor),
      fecha_pago_1: fecha10(c.fecha_pago_1),
      fecha_pago_2: fecha10(c.fecha_pago_2),
      fecha_envio: fecha10(c.fecha_envio),
      fecha_limite: fecha10(c.fecha_limite),
      fecha_llegada: fecha10(c.fecha_llegada),
    }));
  const lineasDeCompras = lineasCompras(filasCompras, hoy, semanas);
  lineas.push(...lineasDeCompras);
  // Gastos de importación sin pagar y presupuesto de compras por mes (Rentabilidad › Compras y costos, migración 0935).
  const planificadas = await lineasComprasPlanificadas(supabase, hoy, semanas, lineasDeCompras);
  lineas.push(...planificadas);

  // ---- Nómina
  const comisionNom = new Map((comisionesNomina.data ?? []).map((p) => [`${String(p.periodo).slice(0, 10)}|${p.tipo}`, Number(p.comision ?? 0)]));
  const porMesTipo = new Map<string, number>();
  for (const c of costos.data ?? []) {
    const k = `${String(c.periodo).slice(0, 10)}|${c.tipo}`;
    porMesTipo.set(k, (porMesTipo.get(k) ?? 0) + Number(c.neto) + Number(c.retenciones ?? 0));
  }
  const costosNomina: CostoNomina[] = [...porMesTipo.entries()].map(([k, monto]) => {
    const [periodo, tipo] = k.split("|");
    return { periodo, tipo, monto: Math.round((monto + (comisionNom.get(k) ?? 0)) * 100) / 100 };
  });
  const patrones: Record<string, PagoHabitual[]> = {};
  for (const tipo of new Set(costosNomina.map((c) => c.tipo))) {
    patrones[tipo] = patronPagos(
      (lineasNom.data ?? [])
        .filter((l) => l.tipo === tipo)
        .map((l) => ({ periodo: String(l.periodo).slice(0, 10), fecha: l.fecha_pago ? String(l.fecha_pago).slice(0, 10) : null, monto: Number(l.neto) })),
    );
  }
  lineas.push(...lineasNomina(costosNomina, patrones, hoy, semanas));

  // ---- Repartidores (cierres pagados; sin cierres, lo que dejaron las entregas)
  let repartidores = promedioSemanal((cierres.data ?? []).map((c) => ({ fecha: String(c.fecha_pago).slice(0, 10), monto: Number(c.a_pagar ?? 0) })), ventanaVentas);
  if (!repartidores) {
    repartidores = promedioSemanal(
      (semanasDel.data ?? []).map((s) => ({ fecha: sumarDias(String(s.semana).slice(0, 10), 6), monto: Number(s.tarifas) + Number(s.propinas) + Number(s.aparte) })),
      ventanaVentas,
    );
  }
  const cierresLinea = repartidores > 0 ? lineaPromedio("repartidores", "Cierres de repartidores", repartidores, hoy) : null;
  if (cierresLinea) lineas.push(cierresLinea);
  const otrosEnvios = lineaRitmo("repartidores", "Otros envíos (ritmo del libro)", delLibro.envioPorSemana, cierresLinea ? [cierresLinea] : [], hoy);
  if (otrosEnvios) lineas.push(otrosEnvios);

  // ---- Libro: marketing, gastos recurrentes, impuestos, otros gastos, mercancía y dividendos
  for (const m of delLibro.marketing) lineas.push(lineaPromedio("marketing", m.tipo, m.porSemana, hoy));
  // Las cuotas de los préstamos cargados en Tesorería van como deuda: su tipo del libro deja de contarse como recurrente.
  const tiposDeuda = new Set((deudaTes?.prestamos ?? []).map((p) => p.tipoNombre).filter((t): t is string => !!t));
  const recurrentes = delLibro.recurrentes.filter((g) => !tiposDeuda.has(g.tipo));
  lineas.push(...lineasRecurrentes(recurrentes, "recurrentes", hoy, semanas, etiquetaRecurrente));
  const finSemanas = sumarDias(semanas[semanas.length - 1], 6);
  const cuotas = deudaTes ? pagosDeuda(deudaTes.prestamos, deudaTes.lineas, hoy, finSemanas, deudaTes.ciclos) : [];
  lineas.push(...lineasFechadas("deuda", cuotas.map((c) => ({ detalle: c.concepto.split(" · ")[0], fecha: c.fecha, monto: c.monto })), hoy, semanas));
  lineas.push(...lineasRecurrentes(delLibro.impuestos, "impuestos", hoy, semanas, (g) => g.tipo));
  if (delLibro.otrosPorSemana > 0) lineas.push(lineaPromedio("otros_gastos", "Promedio sin los recurrentes", delLibro.otrosPorSemana, hoy));
  const reposicion = lineaRitmo("mercancia", "Al ritmo de las últimas semanas", delLibro.mercanciaPorSemana, [...lineasDeCompras, ...planificadas], hoy);
  if (reposicion) lineas.push(reposicion);
  if (delLibro.dividendosPorSemana > 0) lineas.push(lineaPromedio("dividendos", "Promedio del último trimestre", delLibro.dividendosPorSemana, hoy));

  // ---- Ajustes
  const listaAjustes: AjusteProyeccion[] = (ajustes.data ?? []).map((a) => ({
    id: a.id as string,
    semana: String(a.semana).slice(0, 10),
    concepto: a.concepto as string,
    monto: Number(a.monto),
    nota: (a.nota as string | null) ?? null,
  }));
  lineas.push(...lineasAjustes(listaAjustes, semanas));

  return {
    hoy,
    semanas,
    lineas,
    cajaHoy,
    fuenteCaja,
    config: cfg,
    ajustes: listaAjustes,
    supuestos: {
      ventas: supVentas.map((s) => ({ ...s, tienda: nombres.get(s.unidad_id) ?? "Sin tienda" })),
      ventanaVentas,
      ventanaLibro,
      mesCompletoLibro: mesCompleto,
      recurrentes,
      impuestos: delLibro.impuestos,
      diasRetiro: dias,
      patrones,
      repartidoresPorSemana: repartidores,
      envioPorSemana: delLibro.envioPorSemana,
      ingresosOtros: delLibro.ingresosOtros.map((x) => ({ unidad: nombres.get(x.unidad_id) ?? "Sin unidad", porSemana: x.porSemana })),
      tiendasDeTerceros,
      marketingPorSemana: Math.round(delLibro.marketing.reduce((a, m) => a + m.porSemana, 0) * 100) / 100,
      otrosPorSemana: delLibro.otrosPorSemana,
      mercanciaPorSemana: delLibro.mercanciaPorSemana,
      dividendosPorSemana: delLibro.dividendosPorSemana,
      porCobrarVencido: vencido("cobrar"),
      porPagarVencido: vencido("pagar"),
      transito:
        transitoDropi && supTransito
          ? {
              pedidos: transitoDropi.pedidos.reduce((a, p) => a + p.pedidos, 0),
              monto: Math.round(transitoDropi.pedidos.reduce((a, p) => a + p.monto, 0) * 100) / 100,
              esperado: Math.round(esperadosTransito.reduce((a, p) => a + p.monto, 0) * 100) / 100,
              supuesto: supTransito,
            }
          : null,
      deuda: Math.round(cuotas.reduce((a, c) => a + c.monto, 0) * 100) / 100,
    },
  };
}

/** La caja final más baja de la proyección y el lunes de su semana (null sin semanas). */
export function minimoProyectado(p: Proyeccion): { saldo: number; semana: string } | null {
  if (!p.cajaFinal.length) return null;
  let i = 0;
  p.cajaFinal.forEach((v, k) => {
    if (v < p.cajaFinal[i]) i = k;
  });
  return { saldo: Math.round(p.cajaFinal[i] * 100) / 100, semana: p.semanas[i] };
}

/** Guarda la foto de la proyección base de esta semana si todavía no hay una (la primera que se abre manda). */
export async function guardarFotoSiFalta(supabase: SupabaseClient, p: Proyeccion, usuarioId: string | null): Promise<void> {
  const semana = p.semanas[0];
  const foto = fotoDe(p, semana);
  const minimo = minimoProyectado(p);
  const fila = { semana, caja_inicial: foto.cajaInicial, valores: foto.valores, creado_por: usuarioId };
  const r = await supabase
    .from("fin_proyeccion_fotos")
    .upsert({ ...fila, saldo_minimo: minimo?.saldo ?? null, fecha_minimo: minimo?.semana ?? null }, { onConflict: "semana", ignoreDuplicates: true });
  // Sin la migración 0924 todavía no existen saldo_minimo ni fecha_minimo: se guarda la foto igual.
  if (r.error && /saldo_minimo|fecha_minimo/.test(r.error.message)) {
    await supabase.from("fin_proyeccion_fotos").upsert(fila, { onConflict: "semana", ignoreDuplicates: true });
  }
}

/** Semanas de fotos que mira la precisión (medio año). */
export const SEMANAS_PRECISION = 26;

/** Las fotos del último medio año contra lo real: el libro por fecha de pago y el cobro de ventas de Ventas por tienda. */
export async function cargarPrecision(supabase: SupabaseClient, hoy: string): Promise<{ error: string } | ResultadoPrecision> {
  const desde = sumarDias(semanasProyeccion(hoy)[0], -7 * SEMANAS_PRECISION);
  const fotos = await cargarFotos(supabase, desde);
  if ("error" in fotos) return fotos;
  if (!fotos.length) return compararFotos([], {}, hoy);
  const inicio = fotos[0].semana;
  const ayer = sumarDias(hoy, -1);
  // El libro desde unos meses antes, para saber qué tiendas son propias (las que tienen ingresos).
  const [libro, ventas] = await Promise.all([
    cargarLibro(supabase, mesesHasta(`${inicio.slice(0, 7)}-01`, 4)[0], ayer),
    supabase.rpc("fin_proyeccion_ventas", { p_desde: inicio, p_hasta: ayer }),
  ]);
  if ("error" in libro) return libro;
  if (ventas.error) return { error: SIN_MIGRACION_PROYECCION };
  const tiendas = new Set(libro.filter((m) => rubroLibro(m) === "ingresos" && m.signo === 1 && m.monto > 0 && m.unidad_id).map((m) => m.unidad_id!));
  const porSemana: Record<string, number> = {};
  for (const v of (ventas.data ?? []) as Record<string, unknown>[]) {
    if (!tiendas.has(v.unidad_id as string)) continue;
    const s = String(v.semana).slice(0, 10);
    porSemana[s] = (porSemana[s] ?? 0) + Number(v.valor_entregadas);
  }
  const real = realPorSemana(
    libro.filter((m) => m.fecha >= inicio),
    { tiendas, ventas: porSemana },
  );
  return compararFotos(fotos, real, hoy);
}

export async function cargarFotos(supabase: SupabaseClient, desde: string): Promise<{ error: string } | FotoProyeccion[]> {
  const { data, error } = await supabase.from("fin_proyeccion_fotos").select("semana, caja_inicial, valores").gte("semana", desde).order("semana");
  if (error) return { error: SIN_MIGRACION_PROYECCION };
  return (data ?? [])
    .map((f) => validarFoto({ semana: String(f.semana).slice(0, 10), cajaInicial: Number(f.caja_inicial), valores: f.valores }))
    .filter((f): f is FotoProyeccion => f !== null);
}
