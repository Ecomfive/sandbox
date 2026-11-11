// Lectura y evaluación de la matriz de riesgos (mejora 25, migración 0948). Calcula cada indicador vivo con lo que ya
// tiene el portal (tiendas por mes del comité, unidad económica, compras, proyección de caja, EERR por partes, deuda,
// tipos de cambio, inventario valorizado y calendario fiscal); una fuente que falta deja su indicador sin dato con lo que
// falta, y el riesgo vuelve a su probabilidad manual. `evaluarYGuardarRiesgos` la usan la tarea diaria «alertas» y el botón
// «Evaluar ahora»: guarda los cambios de nivel y las alertas `riesgo_sube`. Los permisos los decide quien llama.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sumarMeses } from "@/lib/af4/fecha";
import { DEF_ALERTA, guardarAlertas, type AlertaNueva } from "@/lib/tareas/alertas";
import { cargarCalendario } from "./avisos-cierre";
import { filasCalendario } from "./calendario-fiscal";
import { cargarBasePauta, cargarDeudaComite, cargarEerrConsolidado } from "./cargar-comite";
import { cargarInventario, PAIS_FINANZAS } from "./cargar-inventario";
import { cargarPartes } from "./cargar-partes";
import { cargarProyeccion } from "./cargar-proyeccion";
import { cargarAgrupado } from "./cargar-unidad-economica";
import { costoFinanciero, interesesPorMes, serieEntrega, seriePauta } from "./comite";
import { resumirInventario } from "./inventario-valorizado";
import { armarProyeccion, indicadores } from "./proyeccion-caja";
import {
  alertasRiesgo,
  cambiosDeNivel,
  evaluarRiesgos,
  INDICADORES_RIESGO,
  leerRiesgo,
  NIVELES,
  type IndicadorRiesgo,
  type NivelRiesgo,
  type Riesgo,
  type RiesgoEvaluado,
  type UltimoCambio,
  type ValorIndicador,
} from "./riesgos";
import { ventasEsperadas, tasasResolucion } from "./pauta";

export const SIN_MIGRACION_RIESGOS = "Falta correr la migración 0948 (plan de compras, riesgos) en Supabase.";

const num = (v: unknown) => Number(v ?? 0) || 0;
const sinDato = (nota: string): ValorIndicador => ({ valor: null, nota });

async function seguro(f: () => Promise<ValorIndicador>, nota: string): Promise<ValorIndicador> {
  try {
    return await f();
  } catch (e) {
    console.error("indicador de riesgo:", e instanceof Error ? e.message : e);
    return sinDato(nota);
  }
}

/** Todos los indicadores vivos, en paralelo. `hoy` en hora de Panamá. */
export async function cargarIndicadoresRiesgo(supabase: SupabaseClient, hoy: string): Promise<Map<IndicadorRiesgo, ValorIndicador>> {
  const mesEnCurso = `${hoy.slice(0, 7)}-01`;
  const ultimo = sumarMeses(mesEnCurso, -1);
  const tres = [sumarMeses(ultimo, -2), sumarMeses(ultimo, -1), ultimo];

  const base = cargarBasePauta(supabase, tres[0], ultimo, hoy);
  const tiendas = async (f: (b: Exclude<Awaited<typeof base>, { error: string }>) => ValorIndicador) => {
    const b = await base;
    return "error" in b ? sinDato(b.error) : f(b);
  };

  const [dropi, pauta, entrega, courier, proveedor, liquidez, costo, crc, lento, ic, fiscal] = await Promise.all([
    seguro(
      () =>
        tiendas((b) => {
          const canal = new Map(b.unidades.map((u) => [u.id, u.canal]));
          if (![...canal.values()].some((c) => !!c)) return sinDato("Falta el canal de cada tienda (Ventas por tienda)");
          const tasas = tasasResolucion(b.filas);
          let total = 0;
          let deDropi = 0;
          for (const f of b.filas) {
            const v = ventasEsperadas(f, tasas.get(f.unidadId));
            total += v;
            if (canal.get(f.unidadId) === "dropi") deDropi += v;
          }
          return total > 0 ? { valor: (deDropi / total) * 100, nota: null } : sinDato("Sin ventas en los últimos 3 meses");
        }),
      "No se pudieron leer las tiendas",
    ),
    seguro(
      () =>
        tiendas((b) => {
          if (!b.propias.length) return sinDato("Elegí las tiendas propias en el comité");
          const v = seriePauta(b.filas, [ultimo], b.propias)[0]?.valor ?? null;
          return v === null ? sinDato("Sin ventas el último mes") : { valor: v, nota: null };
        }),
      "No se pudieron leer las tiendas",
    ),
    seguro(
      () =>
        tiendas((b) => {
          if (!b.propias.length) return sinDato("Elegí las tiendas propias en el comité");
          const v = serieEntrega(b.filas, [ultimo], b.propias)[0]?.valor ?? null;
          return v === null ? sinDato("Sin envíos el último mes") : { valor: v, nota: null };
        }),
      "No se pudieron leer las tiendas",
    ),
    seguro(async () => {
      const r = await cargarAgrupado(supabase, { desde: tres[0], hasta: ultimo, unidades: null }, "repartidor");
      if ("error" in r) return sinDato(r.error);
      const total = r.reduce((a, f) => a + f.enviadas, 0);
      if (total <= 0) return sinDato("Sin envíos en los últimos 3 meses");
      const top = [...r].sort((a, b) => b.enviadas - a.enviadas)[0];
      return { valor: (top.enviadas / total) * 100, nota: top.etiqueta || null };
    }, "No se pudo leer la unidad económica"),
    seguro(async () => {
      const { data: pais } = await supabase.from("paises").select("id").eq("codigo", PAIS_FINANZAS).maybeSingle();
      if (!pais?.id) return sinDato("No existe el país Panamá");
      const desde = `${Number(hoy.slice(0, 4)) - 1}${hoy.slice(4, 10)}`;
      const { data, error } = await supabase
        .from("wms_compras")
        .select("proveedor, monto_total")
        .eq("pais_id", pais.id)
        .eq("tipo", "pais")
        .is("anulada_en", null)
        .gte("creado_en", desde)
        .limit(5000);
      if (error) return sinDato("No se pudieron leer las compras");
      const por = new Map<string, number>();
      let total = 0;
      for (const c of data ?? []) {
        const m = num(c.monto_total);
        if (m <= 0) continue;
        const k = String(c.proveedor ?? "").trim().toLowerCase() || "sin proveedor";
        por.set(k, (por.get(k) ?? 0) + m);
        total += m;
      }
      if (total <= 0) return sinDato("Sin compras con monto en 12 meses");
      return { valor: (Math.max(...por.values()) / total) * 100, nota: null };
    }, "No se pudieron leer las compras"),
    seguro(async () => {
      const p = await cargarProyeccion(supabase, hoy);
      if ("error" in p) return sinDato(p.error);
      const i = indicadores(armarProyeccion(p.lineas, p.semanas, p.cajaHoy), p.config.cajaMinima);
      return i.cobertura === null ? sinDato("La proyección no tiene salidas") : { valor: i.cobertura, nota: null };
    }, "No se pudo leer la proyección de caja"),
    seguro(async () => {
      const ventana = [sumarMeses(tres[0], -1), ...tres];
      const [e, d] = await Promise.all([cargarEerrConsolidado(supabase, ventana), cargarDeudaComite(supabase, ventana)]);
      if ("error" in e) return sinDato("Falta el libro de movimientos");
      const c = costoFinanciero(tres, interesesPorMes(e.eerr), d?.porMes ?? null);
      return c.valor === null ? sinDato(c.falta ?? "Sin datos") : { valor: c.valor, nota: null };
    }, "No se pudo calcular el costo financiero"),
    seguro(async () => {
      const { data, error } = await supabase.from("fin_tipos_cambio_mes").select("periodo, cierre").eq("moneda", "CRC").order("periodo", { ascending: false }).limit(4);
      if (error) return sinDato("Falta la migración 0923 (multimoneda)");
      const f = data ?? [];
      if (f.length < 4) return sinDato("Faltan los tipos de cambio de 4 meses");
      const ahora = num(f[0].cierre);
      const antes = num(f[3].cierre);
      return antes > 0 ? { valor: Math.abs(ahora / antes - 1) * 100, nota: null } : sinDato("Tipo de cambio en cero");
    }, "No se pudieron leer los tipos de cambio"),
    seguro(async () => {
      const inv = await cargarInventario(supabase);
      if ("error" in inv) return sinDato(inv.error);
      const r = resumirInventario(inv.filas, inv.vendido, hoy, inv.tasa);
      if (r.valor <= 0) return sinDato("Sin inventario valorizado");
      const lentoValor = r.lento["90"].valor + r.lento["180"].valor + r.lento.sin_salidas.valor;
      return { valor: (lentoValor / r.valor) * 100, nota: null };
    }, "No se pudo leer el inventario"),
    seguro(async () => {
      const p = await cargarPartes(supabase, tres);
      if ("error" in p) return sinDato("Falta la migración 0929 (partes del EERR)");
      const total = p.partes.reduce((a, x) => a + Math.abs(num(x.monto_ic)), 0);
      return { valor: total / tres.length, nota: "Suma de los dos lados" };
    }, "No se pudo leer el EERR por partes"),
    seguro(async () => {
      const c = await cargarCalendario(supabase);
      if ("error" in c) return sinDato(c.error);
      if (!c.obligaciones.length) return sinDato("Sin obligaciones en el calendario fiscal");
      return { valor: filasCalendario(c.obligaciones, c.presentaciones, hoy).filter((f) => f.estado === "vencida").length, nota: null };
    }, "No se pudo leer el calendario fiscal"),
  ]);
  const valores: Record<IndicadorRiesgo, ValorIndicador> = {
    concentracion_dropi: dropi,
    concentracion_courier: courier,
    concentracion_proveedor: proveedor,
    liquidez_semanas: liquidez,
    costo_financiero: costo,
    tipo_cambio_crc: crc,
    pauta_ventas: pauta,
    tasa_entrega: entrega,
    inventario_lento: lento,
    intercompania: ic,
    fiscal_vencidas: fiscal,
  };
  return new Map(INDICADORES_RIESGO.map((k) => [k, valores[k]]));
}

export async function cargarRiesgos(supabase: SupabaseClient): Promise<Riesgo[] | { error: string }> {
  const { data, error } = await supabase.from("fin_riesgos").select("*").order("orden").order("nombre");
  if (error) return { error: SIN_MIGRACION_RIESGOS };
  return ((data ?? []) as Record<string, unknown>[]).map(leerRiesgo);
}

export interface FilaHistorialRiesgo {
  id: string;
  riesgoId: string;
  antes: NivelRiesgo | null;
  despues: NivelRiesgo;
  probabilidad: number;
  impacto: number;
  valor: number | null;
  origen: "auto" | "manual";
  fecha: string;
}

const nivel = (v: unknown): NivelRiesgo | null => (typeof v === "string" && (NIVELES as string[]).includes(v) ? (v as NivelRiesgo) : null);

export async function cargarHistorialRiesgos(supabase: SupabaseClient, limite = 300): Promise<FilaHistorialRiesgo[]> {
  const { data, error } = await supabase
    .from("fin_riesgos_historial")
    .select("id, riesgo_id, nivel_antes, nivel_despues, probabilidad, impacto, valor_indicador, origen, creado_en")
    .order("creado_en", { ascending: false })
    .limit(limite);
  if (error) return [];
  return ((data ?? []) as Record<string, unknown>[]).map((h) => ({
    id: String(h.id),
    riesgoId: String(h.riesgo_id),
    antes: nivel(h.nivel_antes),
    despues: nivel(h.nivel_despues) ?? "bajo",
    probabilidad: num(h.probabilidad),
    impacto: num(h.impacto),
    valor: h.valor_indicador === null || h.valor_indicador === undefined ? null : num(h.valor_indicador),
    origen: h.origen === "manual" ? "manual" : "auto",
    fecha: String(h.creado_en ?? ""),
  }));
}

/**
 * Evalúa todos los riesgos con los indicadores de hoy, guarda los cambios de nivel en el historial, deja el nivel actual
 * en cada riesgo y actualiza las alertas `riesgo_sube`. Idempotente: sin cambios no escribe historial.
 */
export async function evaluarYGuardarRiesgos(
  supabase: SupabaseClient,
  hoy: string,
  opciones: { origen?: "auto" | "manual"; usuarioId?: string | null } = {},
): Promise<{ error: string } | { evaluados: RiesgoEvaluado[]; cambios: number; alertas: number }> {
  const rs = await cargarRiesgos(supabase);
  if ("error" in rs) return rs;
  const valores = await cargarIndicadoresRiesgo(supabase, hoy);
  const evaluados = evaluarRiesgos(rs, valores);
  const cambios = cambiosDeNivel(evaluados, opciones.origen ?? "auto");
  const ahora = new Date().toISOString();
  if (cambios.length) {
    const { error } = await supabase.from("fin_riesgos_historial").insert(
      cambios.map((c) => ({
        riesgo_id: c.riesgoId,
        nivel_antes: c.antes,
        nivel_despues: c.despues,
        probabilidad: c.probabilidad,
        impacto: c.impacto,
        valor_indicador: c.valor,
        origen: c.origen,
        usuario_id: opciones.usuarioId ?? null,
      })),
    );
    if (error) return { error: SIN_MIGRACION_RIESGOS };
  }
  for (const e of evaluados) {
    await supabase
      .from("fin_riesgos")
      .update({ nivel_actual: e.nivel, probabilidad_actual: e.probabilidad, valor_indicador: e.valor, evaluado_en: ahora })
      .eq("id", e.id);
  }
  // El último cambio de cada riesgo decide su alerta.
  const hist = await cargarHistorialRiesgos(supabase, 1000);
  const ultimos = new Map<string, UltimoCambio>();
  for (const h of hist) if (!ultimos.has(h.riesgoId)) ultimos.set(h.riesgoId, { riesgoId: h.riesgoId, antes: h.antes, despues: h.despues, fecha: h.fecha });
  const def = DEF_ALERTA.riesgo_sube;
  const nuevas: AlertaNueva[] = alertasRiesgo(evaluados, ultimos).map((a) => ({
    clave: a.clave,
    tipo: "riesgo_sube",
    severidad: a.severidad,
    mensaje: a.mensaje,
    enlace: def.href,
    modulo: def.modulo,
    monto: null,
  }));
  const g = await guardarAlertas(supabase, nuevas, ["riesgo_sube"]);
  if ("error" in g) return { error: /check|tipo/i.test(g.error) ? SIN_MIGRACION_RIESGOS : g.error };
  return { evaluados, cambios: cambios.length, alertas: nuevas.length };
}
