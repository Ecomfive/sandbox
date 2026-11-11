// Lectura de lo que arma el Balance general (migración 0930) y el flujo de caja indirecto: saldos de cartera al cierre de
// cada mes, fotos del inventario, bienes de uso, aportes y retiros, partidas manuales y la caja del flujo. Solo lectura;
// los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { bienesAlCorte, esRubroPartida, gastosImportacionAl, partidasSinDuplicar, partidasVigentes, type InsumosBalance, type LineaDeuda, type Partida } from "./balance";
import { mesDe, situacion } from "./bienes-uso";
import { cargarFlujo } from "./cargar-flujo";
import { cargarPartes } from "./cargar-partes";
import { finDeMes } from "./cierre";
import type { Entidad } from "./entidades";
import { rangoMeses, resumirFlujo } from "./flujo";

export const SIN_MIGRACION_BALANCE = "Falta correr la migración 0930 (balance general) en Supabase.";
/** El inventario valorizado es el de Panamá (el país de Finanzas). */
export const ENTIDAD_INVENTARIO = "PA";

const num = (v: unknown) => Number(v ?? 0) || 0;
const r2 = (v: number) => Math.round(v * 100) / 100;

/** Por cobrar y por pagar en dólares al cierre de cada mes (null si no se pudo leer). */
export async function cargarSaldosCartera(
  supabase: SupabaseClient,
  meses: string[],
  entidadId: string | null,
): Promise<Record<string, { cxc: number | null; cxp: number | null }>> {
  const salida: Record<string, { cxc: number | null; cxp: number | null }> = {};
  await Promise.all(
    meses.map(async (m) => {
      const corte = finDeMes(m);
      const r = entidadId
        ? await supabase.rpc("fin_cartera_entidad_al", { p_corte: corte })
        : await supabase.rpc("fin_cartera_al", { p_corte: corte });
      if (r.error) {
        salida[m] = { cxc: null, cxp: null };
        return;
      }
      const filas = ((r.data ?? []) as { clase: string; saldo: number | string; entidad_id?: string }[]).filter((f) => !entidadId || f.entidad_id === entidadId);
      const suma = (clase: string) => r2(filas.filter((f) => f.clase === clase).reduce((a, f) => a + num(f.saldo), 0));
      salida[m] = { cxc: suma("cobrar"), cxp: suma("pagar") };
    }),
  );
  return salida;
}

/** El valor del inventario al cierre de cada mes: la foto guardada o, en el mes en curso, el valor de hoy. */
export async function cargarInventarioCortes(
  supabase: SupabaseClient,
  meses: string[],
  mesEnCurso: string,
): Promise<{ valores: Record<string, number | null>; vivo: number | null; faltaMigracion: boolean }> {
  const valores: Record<string, number | null> = Object.fromEntries(meses.map((m) => [m, null]));
  const [fotos, vivo] = await Promise.all([
    supabase.from("fin_inventario_cortes").select("periodo, valor").in("periodo", meses),
    meses.includes(mesEnCurso) ? valorInventarioHoy(supabase) : Promise.resolve(null),
  ]);
  for (const f of fotos.error ? [] : (fotos.data ?? [])) valores[String(f.periodo).slice(0, 10)] = num(f.valor);
  if (vivo !== null && valores[mesEnCurso] === null) valores[mesEnCurso] = vivo;
  return { valores, vivo, faltaMigracion: !!fotos.error };
}

/** El valor de hoy del inventario valorizado de Panamá, o null sin la migración 0921. */
export async function valorInventarioHoy(supabase: SupabaseClient): Promise<number | null> {
  const r = await traerTodasConError<{ valor: number | string }>((a, b) =>
    supabase.from("fin_inventario_valorizado").select("valor").eq("pais", ENTIDAD_INVENTARIO).order("sku_maestro_id").order("bodega_id").order("lote_id").range(a, b),
  );
  if (r.error) return null;
  return r2((r.data ?? []).reduce((a, f) => a + num(f.valor), 0));
}

/** Préstamos y líneas de crédito de Tesorería › Deuda al cierre de cada mes (null sin la migración 0932). */
export async function cargarDeudaCortes(supabase: SupabaseClient, meses: string[]): Promise<Record<string, LineaDeuda[]> | null> {
  const salida: Record<string, LineaDeuda[]> = {};
  let falta = false;
  await Promise.all(
    meses.map(async (m) => {
      const r = await supabase.rpc("fin_deuda_al", { p_corte: finDeMes(m) });
      if (r.error) {
        falta = true;
        return;
      }
      salida[m] = ((r.data ?? []) as { id: string; nombre: string; saldo: number | string; corriente: number | string }[]).map((d) => ({
        id: String(d.id),
        nombre: String(d.nombre),
        saldo: r2(num(d.saldo)),
        corriente: r2(num(d.corriente)),
      }));
    }),
  );
  return falta ? null : salida;
}

/** Anticipos a proveedores al cierre de cada mes (null sin la migración 0935). */
export async function cargarAnticiposCortes(supabase: SupabaseClient, meses: string[]): Promise<Record<string, number> | null> {
  const salida: Record<string, number> = {};
  let falta = false;
  await Promise.all(
    meses.map(async (m) => {
      const r = await supabase.rpc("fin_anticipos_proveedores_al", { p_corte: finDeMes(m) });
      if (r.error) {
        falta = true;
        return;
      }
      salida[m] = r2(((r.data ?? []) as { anticipo: number | string }[]).reduce((a, f) => a + num(f.anticipo), 0));
    }),
  );
  return falta ? null : salida;
}

/** Los gastos de importación de las compras de Panamá con la llegada de su compra (null sin la migración 0935). */
export async function cargarGastosImportacion(
  supabase: SupabaseClient,
): Promise<{ monto: number; pagado: boolean; fecha: string | null; llegada: string | null }[] | null> {
  const [g, pais] = await Promise.all([
    traerTodasConError<{ monto: number | string; pagado: boolean; fecha: string | null; compra_id: string; wms_compras: { fecha_llegada: string | null; pais_id: string | null } | { fecha_llegada: string | null; pais_id: string | null }[] | null }>(
      (a, b) =>
        supabase
          .from("fin_compras_gastos")
          .select("monto, pagado, fecha, compra_id, wms_compras(fecha_llegada, pais_id)")
          .order("id")
          .range(a, b) as unknown as PromiseLike<{ data: never[] | null; error: unknown }>,
    ),
    supabase.from("paises").select("id").eq("codigo", ENTIDAD_INVENTARIO).maybeSingle(),
  ]);
  if (g.error) return null;
  const paId = (pais.data?.id as string | undefined) ?? null;
  return (g.data ?? [])
    .map((x) => ({ ...x, compra: Array.isArray(x.wms_compras) ? (x.wms_compras[0] ?? null) : x.wms_compras }))
    .filter((x) => !paId || x.compra?.pais_id === paId)
    .map((x) => ({
      monto: num(x.monto),
      pagado: !!x.pagado,
      fecha: x.fecha ? String(x.fecha).slice(0, 10) : null,
      llegada: x.compra?.fecha_llegada ? String(x.compra.fecha_llegada).slice(0, 10) : null,
    }));
}

/** Resultado del EERR por mes (todo lo que entra, también lo de A DISTRIBUIR sin repartir) y sus partes que no son caja. */
export interface ResultadosMes {
  utilidad: Record<string, number>;
  dividendos: Record<string, number>;
  depreciacion: Record<string, number>;
  altasBienes: Record<string, number>;
}

/** Los resultados de cada mes desde `fin_eerr_partes`; null sin la migración 0929. */
export async function cargarResultadosMes(
  supabase: SupabaseClient,
  ventana: string[],
  entidadId: string | null,
  local = false,
): Promise<ResultadosMes | null> {
  const d = await cargarPartes(supabase, ventana, entidadId);
  if ("error" in d) return null;
  const r: ResultadosMes = { utilidad: {}, dividendos: {}, depreciacion: {}, altasBienes: {} };
  const sumar = (o: Record<string, number>, m: string, v: number) => (o[m] = r2((o[m] ?? 0) + v));
  for (const p of d.partes) {
    const monto = local ? p.monto_local : p.monto;
    sumar(r.utilidad, p.periodo, monto * p.signo);
    if (p.seccion === "otros" && /dividendo/i.test(p.tipo)) sumar(r.dividendos, p.periodo, monto);
    if (p.seccion === "depreciacion") sumar(r.depreciacion, p.periodo, monto);
    if (p.tipo === "Alta Bien de Uso") sumar(r.altasBienes, p.periodo, monto);
  }
  return r;
}

const deEntidad = (entidad: Entidad | null) => (entidadId: string | null | undefined) =>
  !entidad || entidadId === entidad.id || (!entidadId && entidad.codigo === ENTIDAD_INVENTARIO);

export interface DatosBalance {
  insumos: Record<string, InsumosBalance>;
  /** Meses sin valor de inventario. */
  sinInventario: string[];
  /** Si hay saldos iniciales de caja (sin ellos la caja es solo el flujo acumulado). */
  conSaldos: boolean;
  /** La 0142 o la 0143 no se corrieron: falta parte del balance. */
  avisos: string[];
  partidas: (Partida & { id: string; nota: string | null })[];
  /** El primer mes del libro. */
  inicioLibro: string | null;
}

/** Todo lo que necesita el balance de los cortes pedidos (en dólares). */
export async function cargarBalance(supabase: SupabaseClient, cortes: string[], entidad: Entidad | null, mesEnCurso: string): Promise<DatosBalance | { error: string }> {
  const entidadId = entidad?.id ?? null;
  const filtra = deEntidad(entidad);
  const primero = await supabase.from("fin_movimientos").select("periodo").order("periodo").limit(1);
  if (primero.error) return { error: "Falta el libro de movimientos (migración 0901)." };
  const inicioLibro = primero.data?.[0]?.periodo ? String(primero.data[0].periodo).slice(0, 10) : null;
  const ultimo = cortes[cortes.length - 1];
  const historia = inicioLibro && inicioLibro <= ultimo ? rangoMeses(inicioLibro, ultimo) : cortes;
  const conInventario = !entidad || entidad.codigo === ENTIDAD_INVENTARIO;

  // Deuda, anticipos y gastos de importación son de Panamá (los préstamos no llevan entidad; las compras, el país).
  const conPanama = conInventario;
  const [flujo, cartera, inventario, bienes, patrimoniales, partidas, resultados, deuda, anticipos, gastosImp] = await Promise.all([
    cargarFlujo(supabase, { entidadId }),
    cargarSaldosCartera(supabase, cortes, entidadId),
    conInventario ? cargarInventarioCortes(supabase, cortes, mesEnCurso) : Promise.resolve(null),
    supabase.from("fin_bienes_uso").select("fecha_alta, importe, meses_vida, valor_residual, fecha_baja, unidad_id, fin_unidades(entidad_id)"),
    traerTodasConError<{ id: string; periodo: string; monto: number | string; fin_tipos: { nombre: string } | { nombre: string }[] | null; fin_unidades: { entidad_id?: string } | { entidad_id?: string }[] | null }>(
      (a, b) =>
        supabase
          .from("fin_movimientos")
          .select("id, periodo, monto, fin_tipos!inner(nombre), fin_unidades(entidad_id)")
          .in("fin_tipos.nombre", ["Aporte Capital", "DIVIDENDOS"])
          .lte("periodo", ultimo)
          .order("periodo")
          .order("id")
          .range(a, b) as unknown as PromiseLike<{ data: never[] | null; error: unknown }>,
    ),
    supabase.from("fin_balance_partidas").select("id, entidad_id, rubro, concepto, periodo, monto, nota").order("periodo"),
    cargarResultadosMes(supabase, historia, entidadId),
    conPanama ? cargarDeudaCortes(supabase, cortes) : Promise.resolve({} as Record<string, LineaDeuda[]>),
    conPanama ? cargarAnticiposCortes(supabase, cortes) : Promise.resolve({} as Record<string, number>),
    conPanama ? cargarGastosImportacion(supabase) : Promise.resolve([]),
  ]);

  const avisos: string[] = [];
  if (partidas.error) avisos.push(SIN_MIGRACION_BALANCE);
  if (!deuda) avisos.push("Falta correr la migración 0932 (deuda): los préstamos salen solo de las partidas manuales.");
  if (!anticipos || !gastosImp) avisos.push("Falta correr la migración 0935: sin anticipos a proveedores ni gastos de importación por pagar.");
  if (!resultados) avisos.push("Falta correr la migración 0929 (estados financieros): las utilidades acumuladas salen en cero.");

  // Caja al cierre de cada corte, por cuenta.
  const cajaPorMes: Record<string, { caja: InsumosBalance["caja"]; tarjetas: number }> = {};
  let conSaldos = false;
  if (!("error" in flujo)) {
    conSaldos = flujo.saldos.length > 0;
    const todos = [...flujo.disponibles, ...cortes].sort();
    const meses = todos.length ? rangoMeses(todos[0], todos[todos.length - 1]) : [];
    const r = resumirFlujo(flujo.filas, flujo.saldos, flujo.cuentas, meses, flujo.conversion);
    for (const m of cortes) {
      const caja: InsumosBalance["caja"] = [];
      let tarjetas = 0;
      for (const c of r.cuentas) {
        const saldo = c.final[m] ?? 0;
        if (c.clase === "tarjeta") tarjetas += saldo;
        else if (Math.abs(saldo) >= 0.005) caja.push({ id: c.id, nombre: c.nombre, saldo });
      }
      cajaPorMes[m] = { caja, tarjetas: r2(tarjetas) };
    }
  } else avisos.push(flujo.error);

  const uno = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const listaBienes = (bienes.error ? [] : (bienes.data ?? [])).filter((b) =>
    filtra(uno(b.fin_unidades as { entidad_id?: string } | { entidad_id?: string }[] | null)?.entidad_id ?? null),
  );
  const movsPatrimonio = (patrimoniales.data ?? []).filter((m) => filtra(uno(m.fin_unidades)?.entidad_id ?? null));
  const listaPartidas = (partidas.error ? [] : (partidas.data ?? []))
    .filter((p) => esRubroPartida(p.rubro) && filtra(p.entidad_id as string | null))
    .map((p) => ({
      id: p.id as string,
      entidad_id: (p.entidad_id as string | null) ?? null,
      rubro: p.rubro as Partida["rubro"],
      concepto: String(p.concepto),
      periodo: String(p.periodo).slice(0, 10),
      monto: num(p.monto),
      nota: (p.nota as string | null) ?? null,
    }));

  const nombresDeuda = [...new Set(Object.values(deuda ?? {}).flatMap((l) => l.map((d) => d.nombre)))];
  const insumos: Record<string, InsumosBalance> = {};
  const sinInventario: string[] = [];
  for (const m of cortes) {
    const hasta = (o: Record<string, number> | undefined) => Object.entries(o ?? {}).reduce((a, [mes, v]) => (mes <= m ? a + v : a), 0);
    const situaciones = listaBienes
      .filter((b) => mesDe(String(b.fecha_alta)) <= m)
      .map((b) => {
        const bien = {
          fecha_alta: String(b.fecha_alta),
          importe: num(b.importe),
          meses_vida: num(b.meses_vida) || 1,
          valor_residual: num(b.valor_residual),
          fecha_baja: b.fecha_baja ? String(b.fecha_baja) : null,
        };
        const s = situacion(bien, m);
        return { importe: bien.importe, neto: s.neto, deBaja: s.estado === "De baja" };
      });
    const { costo, depreciacion } = bienesAlCorte(situaciones);
    const nombreTipo = (x: (typeof movsPatrimonio)[number]) => uno(x.fin_tipos)?.nombre ?? "";
    const aportes = movsPatrimonio.filter((x) => nombreTipo(x) === "Aporte Capital" && String(x.periodo).slice(0, 10) <= m).reduce((a, x) => a + num(x.monto), 0);
    const dividendosPatrimonio = movsPatrimonio.filter((x) => nombreTipo(x) === "DIVIDENDOS" && String(x.periodo).slice(0, 10) <= m).reduce((a, x) => a + num(x.monto), 0);
    const dividendosEerr = hasta(resultados?.dividendos);
    const inv = inventario ? (inventario.valores[m] ?? null) : 0;
    if (inventario && inv === null) sinInventario.push(m);
    insumos[m] = {
      caja: cajaPorMes[m]?.caja ?? [],
      tarjetas: cajaPorMes[m]?.tarjetas ?? 0,
      cxc: cartera[m]?.cxc ?? null,
      cxp: cartera[m]?.cxp ?? null,
      bienesCosto: costo,
      bienesDepreciacion: depreciacion,
      inventario: inv,
      // Un préstamo que ya está en Tesorería › Deuda no se cuenta otra vez desde las partidas manuales.
      partidas: partidasSinDuplicar(partidasVigentes(listaPartidas, m), nombresDeuda),
      aportesLibro: r2(aportes),
      // El EERR ya restó los retiros de dividendos: se suman de vuelta para mostrarlos aparte como retiros.
      utilidadAcumulada: r2(hasta(resultados?.utilidad) + dividendosEerr),
      retiros: r2(dividendosEerr + dividendosPatrimonio),
      deuda: deuda?.[m] ?? [],
      anticipos: anticipos?.[m] ?? 0,
      gastosImportacion: gastosImp ? gastosImportacionAl(gastosImp, finDeMes(m)) : 0,
    };
  }
  return { insumos, sinInventario, conSaldos, avisos, partidas: listaPartidas, inicioLibro };
}
