// Portal AF4 360° › Panel › Paquete bancario: lee todo lo que lleva el paquete para un corte y una entidad y lo deja como
// una «foto» serializable (`SnapshotPaquete`). La foto la dibuja la página (y su vista imprimible), la baja el Excel y se
// guarda tal cual como versión (`fin_paquetes_bancarios`, migración 0940). Reutiliza los cargadores de cada módulo; cada
// sección que no se puede armar queda en null y se anota en «Limitaciones». Solo lectura: los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { dinero } from "@/lib/af4/formato";
import { mesCorto, mesLargo, hoyPanama, inicioDeMes } from "@/lib/af4/fecha";
import type { FilaAF4 } from "@/lib/af4/tabla-financiera";
import { armarBalance } from "./balance";
import { cargarBalance } from "./cargar-balance";
import { cargarCartera } from "./cargar-cartera";
import { cargarEerr, unidadesEerr } from "./cargar-eerr";
import { cargarFlujo } from "./cargar-flujo";
import { cargarProyeccion } from "./cargar-proyeccion";
import { cargarDeuda } from "./cargar-tesoreria";
import { finDeMes } from "./cierre";
import { saldoAl, CLASES_PRESTAMO, cuotaFrancesa, proximoVencimientoCiclo, saldoCicloAl, tasaEfectivaAnualCiclo } from "./deuda";
import { armarEerr, type Eerr } from "./eerr";
import { filasEstado, type Fila } from "./eerr-filas";
import type { Entidad } from "./entidades";
import { filasEstadoFlujo, resumirFlujo, type FilaEstadoFlujo } from "./flujo";
import type { ResumenCartera } from "./cxc-cxp";
import { ESCENARIOS, aplicarEscenario, armarProyeccion, filasTabla, indicadores, type FilaTabla } from "./proyeccion-caja";
import {
  carteraAlCorte,
  concentracionVentas,
  cortesBalance,
  etiquetaSeccion,
  indicadoresBancarios,
  interesesDeFinanzas,
  limitacionesPaquete,
  mesesHasta,
  moverMes,
  posicionCorriente,
  totalesAnuales,
  type Concentracion,
  type IndicadoresBancarios,
  type InsumosIndicadores,
  type Limitacion,
  type SeccionPaquete,
  type TotalAnual,
} from "./paquete-bancario";

export const SIN_MIGRACION_PAQUETE = "Falta correr la migración 0940 (paquete bancario) en Supabase.";

export interface DeudaPaquete {
  prestamos: {
    nombre: string;
    acreedor: string | null;
    clase: string;
    monto: number;
    tasaAnual: number;
    plazoMeses: number;
    cuota: number;
    desembolso: string;
    saldo: number;
    corriente: number;
    noCorriente: number;
    proxima: string | null;
  }[];
  lineas: { nombre: string; banco: string | null; cupo: number; usado: number; usadoAl: string; tasaAnual: number; renovacion: string | null }[];
  total: number;
}

export interface SnapshotPaquete {
  version: 1;
  corte: string;
  /** «consolidado», «PA», «CR». */
  entidad: string;
  alcance: string;
  moneda: "USD";
  secciones: SeccionPaquete[];
  generado: string;
  empresa: { nombre: string; ruc: string | null };
  carta: string;
  meses: string[];
  indicadores: { insumos: InsumosIndicadores; valores: IndicadoresBancarios; serie: { mes: string; ventas: number; ebitda: number }[] } | null;
  eerr: { meses: string[]; filas: Fila[]; anual: TotalAnual[] } | null;
  balance: { cortes: string[]; filas: FilaAF4[]; diferencia: number[] } | null;
  flujo: { meses: string[]; filas: FilaEstadoFlujo[]; conSaldos: boolean } | null;
  cartera: { cobrar: ResumenCartera | null; pagar: ResumenCartera | null } | null;
  deuda: DeudaPaquete | null;
  proyeccion: {
    desde: string;
    semanas: string[];
    filas: FilaTabla[];
    escenarios: { clave: string; etiqueta: string; cajaFinal: number; cajaMinima: number }[];
    supuestos: { etiqueta: string; valor: string }[];
  } | null;
  concentracion: Concentracion | null;
  notas: { periodo: string; texto: string }[];
  limitaciones: Limitacion[];
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** El nombre comercial y el RUC: de las variables del servidor o de `fin_config` (nunca escritos en el código). */
export async function empresaDelPaquete(supabase: SupabaseClient): Promise<{ nombre: string; ruc: string | null }> {
  const envNombre = process.env.RECIBO_EMPRESA_NOMBRE?.trim();
  const envRuc = process.env.RECIBO_EMPRESA_RUC?.trim();
  if (envNombre && envRuc) return { nombre: envNombre, ruc: envRuc };
  const { data } = await supabase.from("fin_config").select("clave, valor").in("clave", ["empresa_nombre", "empresa_ruc"]);
  const valor = (c: string) => {
    const v = (data ?? []).find((f) => f.clave === c)?.valor;
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };
  return { nombre: envNombre || valor("empresa_nombre") || "Empresa", ruc: envRuc || valor("empresa_ruc") };
}

/** Los meses cerrados en Cierre de mes (vacío sin la migración). */
export async function mesesCerrados(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase.from("fin_cierres").select("periodo").eq("estado", "cerrado");
  return error ? [] : (data ?? []).map((f) => String(f.periodo).slice(0, 10));
}

export interface OpcionesPaquete {
  corte: string;
  entidad: Entidad | null;
  secciones: SeccionPaquete[];
  carta: string;
}

/** Arma la foto del paquete. Nunca lanza: lo que no se puede leer queda en null y va a «Limitaciones». */
export async function armarPaqueteBancario(supabase: SupabaseClient, o: OpcionesPaquete): Promise<SnapshotPaquete> {
  const { corte, entidad, secciones } = o;
  const incluye = (s: SeccionPaquete) => secciones.includes(s);
  const entidadId = entidad?.id ?? null;
  const meses = mesesHasta(corte, 12);
  const ventana36 = mesesHasta(corte, 36);
  const finCorte = finDeMes(corte);
  const hoy = hoyPanama();
  const mesEnCurso = inicioDeMes(hoy);
  const avisos: string[] = [];
  const sinDatos: string[] = [];

  const primero = await supabase.from("fin_movimientos").select("periodo").order("periodo").limit(1);
  const inicioLibro = primero.data?.[0]?.periodo ? String(primero.data[0].periodo).slice(0, 10) : null;
  const cortesB = cortesBalance(corte, inicioLibro);

  const [empresa, eerrR, unidadesR, balanceR, flujoR, cobrarR, pagarR, deudaR, proyR, cerrados, notasR, sinTipoR, sinTiendaR, unidadesEnt] = await Promise.all([
    empresaDelPaquete(supabase),
    cargarEerr(supabase, null, ventana36, { entidadId }),
    unidadesEerr(supabase, entidadId),
    cargarBalance(supabase, cortesB, entidad, mesEnCurso),
    incluye("flujo") ? cargarFlujo(supabase, { entidadId }) : Promise.resolve(null),
    incluye("cartera") ? cargarCartera(supabase, "cobrar", finCorte) : Promise.resolve(null),
    incluye("cartera") ? cargarCartera(supabase, "pagar", finCorte) : Promise.resolve(null),
    incluye("deuda") || incluye("indicadores") ? cargarDeuda(supabase) : Promise.resolve(null),
    incluye("proyeccion") && (!entidad || entidad.codigo === "PA") ? cargarProyeccion(supabase, hoy) : Promise.resolve(null),
    mesesCerrados(supabase),
    supabase.from("fin_notas_mes").select("periodo, texto").gte("periodo", meses[0]).lte("periodo", corte).order("periodo", { ascending: false }),
    supabase.from("fin_movimientos_sin_tipo").select("movimientos").gte("periodo", meses[0]).lte("periodo", corte),
    supabase.from("fin_movimientos").select("id, fin_unidades!inner(nombre)", { count: "exact", head: true }).like("fin_unidades.nombre", "SIN ASIGNAR%").gte("periodo", meses[0]).lte("periodo", corte),
    supabase.from("fin_unidades").select("id, entidad_id"),
  ]);

  // ---- EERR, indicadores y concentración
  let eerr12: Eerr | null = null;
  let eerrAnterior: Eerr | null = null;
  let conDatos = new Set<string>();
  let anual: TotalAnual[] = [];
  let concentracion: Concentracion | null = null;
  if ("error" in eerrR) {
    avisos.push("No se pudo leer el Estado de resultados (migración 0901).");
  } else {
    conDatos = eerrR.conDatos;
    eerr12 = armarEerr(eerrR.filas, meses);
    const previos = mesesHasta(moverMes(corte, -12), 12);
    if (previos.every((m) => conDatos.has(m))) eerrAnterior = armarEerr(eerrR.filas, previos);
    const todos = armarEerr(eerrR.filas, ventana36);
    anual = totalesAnuales(ventana36, conDatos, { ingresos: todos.ingresosNetos, margenBruto: todos.margenBruto, ebitda: todos.ebitda, resultadoNeto: todos.resultadoNeto });
    // Ventas de los 12 meses por tienda (la sección Ingresos de cada unidad).
    const nombres = new Map(("error" in unidadesR ? [] : unidadesR.unidades).map((u) => [u.id, u.nombre]));
    const porUnidad = new Map<string, number>();
    const enVentana = new Set(meses);
    for (const f of eerrR.filas) {
      if (f.seccion !== "ingresos" || !enVentana.has(f.periodo)) continue;
      const nombre = nombres.get(f.unidad_id) ?? "Sin tienda";
      porUnidad.set(nombre, (porUnidad.get(nombre) ?? 0) + f.monto * f.signo);
    }
    concentracion = concentracionVentas([...porUnidad].map(([nombre, ventas]) => ({ nombre, ventas })));
  }
  const suma = (pm: Record<string, number> | undefined) => Object.values(pm ?? {}).reduce((a, b) => a + b, 0);
  const mesesSinDatos = meses.filter((m) => !conDatos.has(m));

  // ---- Balance
  let balance: SnapshotPaquete["balance"] = null;
  let posicion: ReturnType<typeof posicionCorriente> | null = null;
  let sinInventario: string[] = [];
  let conSaldos = true;
  let sinCuadrar: { corte: string; diferencia: number }[] = [];
  if ("error" in balanceR) {
    avisos.push(balanceR.error);
  } else {
    avisos.push(...balanceR.avisos);
    const b = armarBalance(cortesB, balanceR.insumos);
    balance = { cortes: cortesB, filas: b.filas, diferencia: b.diferencia };
    if (balanceR.insumos[corte]) posicion = posicionCorriente(balanceR.insumos[corte]);
    sinInventario = balanceR.sinInventario;
    conSaldos = balanceR.conSaldos;
    sinCuadrar = cortesB.map((c, k) => ({ corte: c, diferencia: b.diferencia[k] })).filter((x) => Math.abs(x.diferencia) >= 0.005);
  }

  // ---- Indicadores
  let indicadoresSnap: SnapshotPaquete["indicadores"] = null;
  let interesesAproximados = false;
  let deudaNoSignificativa = false;
  if (eerr12) {
    const costo = -suma(eerr12.secciones.find((s) => s.seccion === "costo_ventas")?.efecto);
    const finanzas = eerr12.secciones.find((s) => s.seccion === "finanzas")?.tipos ?? [];
    const intereses = interesesDeFinanzas(finanzas);
    interesesAproximados = intereses.aproximado;
    const insumos: InsumosIndicadores = {
      ventas: r2(suma(eerr12.ingresosNetos)),
      ventasAnterior: eerrAnterior ? r2(suma(eerrAnterior.ingresosNetos)) : null,
      costoVentas: r2(costo),
      margenBruto: r2(suma(eerr12.margenBruto)),
      ebitda: r2(suma(eerr12.ebitda)),
      intereses: intereses.monto,
      cxc: posicion?.cxc ?? null,
      inventario: posicion?.inventario ?? null,
      cxp: posicion?.cxp ?? null,
      caja: posicion?.caja ?? 0,
      deudaFinanciera: posicion?.deudaFinanciera ?? 0,
      activoCorriente: posicion?.activoCorriente ?? null,
      pasivoCorriente: posicion?.pasivoCorriente ?? null,
      mesesConDatos: meses.filter((m) => conDatos.has(m)).length,
    };
    const valores = indicadoresBancarios(insumos);
    deudaNoSignificativa = valores.deudaEbitdaNoSignificativa;
    indicadoresSnap = { insumos, valores, serie: meses.map((m) => ({ mes: m, ventas: r2(eerr12!.ingresosNetos[m] ?? 0), ebitda: r2(eerr12!.ebitda[m] ?? 0) })) };
  } else if (incluye("indicadores")) sinDatos.push(etiquetaSeccion("indicadores"));

  // ---- Flujo
  let flujo: SnapshotPaquete["flujo"] = null;
  let cuentasSinSaldo = 0;
  if (flujoR && !("error" in flujoR)) {
    const r = resumirFlujo(flujoR.filas, flujoR.saldos, flujoR.cuentas, meses, flujoR.conversion);
    cuentasSinSaldo = r.cuentasSinSaldo;
    flujo = { meses, filas: filasEstadoFlujo(r.estado, r.conSaldos ? r.caja : undefined, r.diferenciaCambio), conSaldos: r.conSaldos };
  } else if (incluye("flujo")) sinDatos.push(etiquetaSeccion("flujo"));

  // ---- Cartera (de la entidad, a la fecha de corte)
  const entidadDe = new Map(((unidadesEnt.data ?? []) as { id: string; entidad_id?: string | null }[]).map((u) => [u.id, u.entidad_id ?? null]));
  const deLaEntidad = (unidadId: string | null) => !entidad || (unidadId ? entidadDe.get(unidadId) === entidad.id : entidad.codigo === "PA");
  const resumen = (r: Awaited<ReturnType<typeof cargarCartera>> | null) => {
    if (!r || "error" in r) return null;
    const docs = r.filas
      .filter((f) => deLaEntidad(f.unidadId))
      .map((f) => ({ contraparte: f.contraparte, monto: f.monto, fecha: f.fecha, vencimiento: f.vencimiento, estado_manual: f.estadoManual, abonos: f.abonos.map((a) => ({ fecha: a.fecha, monto: a.monto })) }));
    return carteraAlCorte(docs, finCorte);
  };
  const cartera = incluye("cartera") ? { cobrar: resumen(cobrarR), pagar: resumen(pagarR) } : null;
  if (cartera && !cartera.cobrar && !cartera.pagar) sinDatos.push(etiquetaSeccion("cartera"));

  // ---- Deuda (Panamá: los préstamos no llevan entidad)
  let deuda: DeudaPaquete | null = null;
  if (deudaR && (!entidad || entidad.codigo === "PA")) {
    const prestamos: DeudaPaquete["prestamos"] = deudaR.prestamos
      .map((p) => {
        const s = saldoAl(p, finCorte);
        return {
          nombre: p.nombre,
          acreedor: p.acreedor,
          clase: CLASES_PRESTAMO.find((c) => c.clave === p.clase)?.etiqueta ?? p.clase,
          monto: p.monto,
          tasaAnual: p.tasaAnual,
          plazoMeses: p.plazoMeses,
          cuota: cuotaFrancesa(p.monto, p.tasaAnual, p.plazoMeses),
          desembolso: p.fechaDesembolso,
          saldo: s.saldo,
          corriente: s.corriente,
          noCorriente: s.noCorriente,
          proxima: s.proxima?.fecha ?? null,
        };
      })
      .filter((p) => p.saldo > 0.005 || p.desembolso <= finCorte);
    // Los financiamientos por ciclo (migración 0946): todo corriente, con su tasa efectiva anual y el costo de un ciclo.
    for (const c of deudaR.ciclos ?? []) {
      const saldo = saldoCicloAl(c, finCorte);
      if (saldo <= 0.005) continue;
      prestamos.push({
        nombre: c.nombre,
        acreedor: c.acreedor,
        clase: "Financiamiento por ciclo",
        monto: c.monto,
        tasaAnual: tasaEfectivaAnualCiclo(c.tasaCiclo, c.diasCiclo),
        plazoMeses: Math.max(Math.round(c.diasCiclo / 30), 1),
        cuota: r2(c.monto * c.tasaCiclo),
        desembolso: c.fechaInicio,
        saldo,
        corriente: saldo,
        noCorriente: 0,
        proxima: proximoVencimientoCiclo(c, finCorte),
      });
    }
    const lineas = deudaR.lineas.map((l) => ({ nombre: l.nombre, banco: l.banco, cupo: l.cupo, usado: l.usado, usadoAl: l.usadoAl, tasaAnual: l.tasaAnual, renovacion: l.fechaRenovacion }));
    // El total es el mismo que el balance, los covenants y el comité (`fin_deuda_al`): una línea cuenta solo si lo usado
    // ya estaba al corte.
    const usadoAlCorte = lineas.reduce((a, l) => a + (!l.usadoAl || l.usadoAl <= finCorte ? l.usado : 0), 0);
    deuda = { prestamos, lineas, total: r2(prestamos.reduce((a, p) => a + p.saldo, 0) + usadoAlCorte) };
  } else if (incluye("deuda")) {
    if (!deudaR) avisos.push("Falta correr la migración 0932 (deuda): no hay detalle de préstamos y líneas.");
    sinDatos.push(etiquetaSeccion("deuda"));
  }

  // ---- Proyección de caja (13 semanas desde hoy)
  let proyeccion: SnapshotPaquete["proyeccion"] = null;
  if (proyR && !("error" in proyR)) {
    const por = ESCENARIOS.map((e) => ({ e, p: armarProyeccion(aplicarEscenario(proyR.lineas, e.clave), proyR.semanas, proyR.cajaHoy) }));
    const baseP = por[0].p;
    const s = proyR.supuestos;
    const ventasSemana = s.ventas.reduce((a, v) => a + v.cobroPorSemana, 0);
    proyeccion = {
      desde: proyR.hoy,
      semanas: proyR.semanas,
      filas: filasTabla(baseP),
      escenarios: por.map(({ e, p }) => ({ clave: e.clave, etiqueta: e.etiqueta, cajaFinal: p.cajaFinal.at(-1) ?? p.cajaInicial, cajaMinima: indicadores(p, proyR.config.cajaMinima).cajaMinima })),
      supuestos: [
        { etiqueta: "Caja inicial", valor: `${dinero(proyR.cajaHoy)} (${proyR.fuenteCaja === "saldos" ? "saldos bancarios" : proyR.fuenteCaja === "manual" ? "cargada a mano" : "sin dato de caja"})` },
        { etiqueta: "Cobro de ventas por semana", valor: `${dinero(ventasSemana)} (${s.ventas.length} tiendas, envíos × tasa de entrega × ticket − comisiones)` },
        { etiqueta: "Mercancía por semana", valor: dinero(s.mercanciaPorSemana) },
        { etiqueta: "Marketing por semana", valor: dinero(s.marketingPorSemana) },
        { etiqueta: "Envío por semana", valor: dinero(s.envioPorSemana) },
        { etiqueta: "Otros gastos por semana", valor: dinero(s.otrosPorSemana) },
        { etiqueta: "Cuotas e intereses de deuda (13 semanas)", valor: dinero(s.deuda) },
        { etiqueta: "Retiro de dividendos por semana", valor: dinero(s.dividendosPorSemana) },
        { etiqueta: "Escenarios", valor: ESCENARIOS.map((e) => `${e.etiqueta}: ventas × ${e.factorVentas.toLocaleString("es-PA")}${e.retrasoCobros ? `, cobros ${e.retrasoCobros} semana después` : ""}`).join(" · ") },
      ],
    };
  } else if (incluye("proyeccion")) {
    if (proyR && "error" in proyR) avisos.push(proyR.error);
    sinDatos.push(entidad && entidad.codigo !== "PA" ? `${etiquetaSeccion("proyeccion")} (solo Panamá)` : etiquetaSeccion("proyeccion"));
  }

  const notas = notasR.error ? [] : ((notasR.data ?? []) as { periodo: string; texto: string }[]).filter((n) => n.texto?.trim()).map((n) => ({ periodo: String(n.periodo).slice(0, 10), texto: n.texto }));

  const limitaciones = limitacionesPaquete(
    {
      balanceSinCuadrar: sinCuadrar,
      sinInventario,
      conSaldos,
      cuentasSinSaldo,
      mesesSinDatos,
      movimientosSinTipo: (sinTipoR.data ?? []).reduce((a, r) => a + Number((r as { movimientos: number }).movimientos), 0),
      movimientosSinTienda: sinTiendaR.count ?? 0,
      avisos,
      corteCerrado: cerrados.includes(corte),
      interesesAproximados,
      deudaEbitdaNoSignificativa: deudaNoSignificativa,
      sinRegistroGiros: !(deudaR?.prestamos ?? []).some((p) => p.clase === "financiamiento") && !(deudaR?.ciclos ?? []).length,
      proyeccionDesdeHoy: !!proyeccion,
      seccionesSinDatos: sinDatos,
    },
    (v) => dinero(v),
    mesLargo,
  );

  return {
    version: 1,
    corte,
    entidad: entidad?.codigo ?? "consolidado",
    alcance: entidad?.razon_social ?? "Consolidado, sin operaciones entre empresas del grupo",
    moneda: "USD",
    secciones,
    generado: new Date().toISOString(),
    empresa,
    carta: o.carta,
    meses,
    indicadores: indicadoresSnap,
    eerr: eerr12 ? { meses, filas: filasEstado(eerr12), anual } : null,
    balance,
    flujo,
    cartera,
    deuda,
    proyeccion,
    concentracion,
    notas,
    limitaciones,
  };
}

/** «sep 26» de cada mes, para encabezados de columnas. */
export const etiquetasMeses = (meses: string[]) => meses.map(mesCorto);

/** La foto guardada, si tiene la forma esperada (una versión vieja o rota se rechaza). */
export function leerSnapshot(v: unknown): SnapshotPaquete | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Partial<SnapshotPaquete>;
  if (s.version !== 1 || typeof s.corte !== "string" || !Array.isArray(s.secciones) || !Array.isArray(s.limitaciones)) return null;
  return s as SnapshotPaquete;
}

