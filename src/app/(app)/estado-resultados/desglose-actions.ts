"use server";

import { sinAccesoARegistros } from "@/lib/finanzas/acceso-tienda";

import { revalidatePath } from "next/cache";
import { registrarAuditoria } from "@/lib/auditoria";
import { requireModulo, requireModuloEscritura } from "@/lib/auth";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { puedeVerUnidad } from "@/lib/finanzas/tiendas-permitidas";
import { cargarEntidades, cargarTasasMes } from "@/lib/finanzas/cargar-entidades";
import { cargarPartes } from "@/lib/finanzas/cargar-partes";
import { desglosar, seccionesDeFila, type LineaDesglose, type MovimientoDesglose } from "@/lib/finanzas/desglose";
import type { Seccion } from "@/lib/finanzas/eerr";
import { tasaDelMes } from "@/lib/finanzas/entidades";
import { esBaseReparto, participacionDe, pesosReparto, type BaseReparto } from "@/lib/finanzas/reparto";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MES = /^\d{4}-(0[1-9]|1[0-2])-01$/;
/** Las líneas que viajan al navegador: las de más peso (el total sí suma todas). */
const MAX_LINEAS = 300;

export interface ConsultaDesglose {
  meses: string[];
  unidadId: string | null;
  entidadId: string | null;
  clave: string;
  base: BaseReparto;
  sinIntercompania: boolean;
  local: boolean;
}

export interface ResultadoDesglose {
  lineas: LineaDesglose[];
  total: number;
  cantidad: number;
  error?: string;
}

type Uno<T> = T | T[] | null;
const uno = <T,>(v: Uno<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

interface FilaMov {
  id: string;
  periodo: string;
  fecha_pago: string | null;
  fecha_registro: string | null;
  descripcion: string | null;
  monto: number | string;
  moneda: string | null;
  monto_original: number | string | null;
  tasa_usd: number | string | null;
  es_bien_de_uso: boolean | null;
  intercompania?: boolean | null;
  unidad_id: string;
  fin_unidades: Uno<{ nombre: string; clase: string; entidad_id?: string | null }>;
  fin_tipos: Uno<{ nombre: string; seccion: Seccion; signo: number; intercompania?: boolean | null }>;
}

/** Los movimientos del libro que forman una cifra del Estado de resultados (basta poder abrir Estado de resultados). */
export async function desglosarCifraEerr(c: ConsultaDesglose): Promise<ResultadoDesglose> {
  const vacio: ResultadoDesglose = { lineas: [], total: 0, cantidad: 0 };
  try {
    await requireModulo("estado-resultados");
    if (!c || !Array.isArray(c.meses) || !c.meses.length || c.meses.length > 24 || !c.meses.every((m) => typeof m === "string" && MES.test(m)))
      return { ...vacio, error: "Período inválido." };
    if (c.unidadId !== null && !UUID.test(String(c.unidadId))) return { ...vacio, error: "Tienda inválida." };
    // Tiendas permitidas (mejora 99): solo se desglosa una de sus tiendas (la suma de «todas» mezclaría las demás).
    const permitidas = await cargarTiendasPermitidas();
    if (permitidas && (c.unidadId === null || !puedeVerUnidad(permitidas, c.unidadId))) return { ...vacio, error: "Elige una de tus tiendas para desglosar." };
    if (c.entidadId !== null && !UUID.test(String(c.entidadId))) return { ...vacio, error: "Entidad inválida." };
    const fila = seccionesDeFila(String(c.clave ?? ""));
    if (!fila) return { ...vacio, error: "Esa cifra no se desglosa." };
    const base: BaseReparto = esBaseReparto(c.base) ? c.base : "envios";
    const supabase = createServiceClient();

    const columnas = (ic: boolean) =>
      `id, periodo, fecha_pago, fecha_registro, descripcion, monto, moneda, monto_original, tasa_usd, es_bien_de_uso${ic ? ", intercompania" : ""}, unidad_id, fin_unidades!inner(nombre, clase${c.entidadId ? ", entidad_id" : ""}), fin_tipos!inner(nombre, seccion, signo${ic ? ", intercompania" : ""})`;
    const leer = (ic: boolean) =>
      traerTodasConError<FilaMov>((a, b) => {
        let q = supabase
          .from("fin_movimientos")
          .select(columnas(ic))
          .eq("en_eerr", true)
          .in("periodo", c.meses)
          .in("fin_tipos.seccion", fila.secciones)
          .order("periodo")
          .order("id")
          .range(a, b);
        if (fila.tipo) q = q.eq("fin_tipos.nombre", fila.tipo);
        if (c.entidadId) q = q.eq("fin_unidades.entidad_id", c.entidadId);
        return q as unknown as PromiseLike<{ data: FilaMov[] | null; error: unknown }>;
      });
    let movs = await leer(true);
    // Sin la migración 0929 no hay columnas de intercompañía.
    if (movs.error) movs = await leer(false);
    if (movs.error) return { ...vacio, error: "No se pudieron leer los movimientos." };

    const [config, partes, entidades] = await Promise.all([
      supabase.from("fin_config").select("valor").eq("clave", "depreciacion_en_eerr").maybeSingle(),
      cargarPartes(supabase, [...c.meses].sort(), c.entidadId),
      c.local ? cargarEntidades(supabase) : Promise.resolve([]),
    ]);
    const conDepreciacion = config.data?.valor === true;
    const tasas = c.local ? await cargarTasasMes(supabase) : [];
    const pesos = "error" in partes ? new Map<string, Map<string, number>>() : pesosReparto(base, partes.partes, partes.envios, partes.unidades);
    const unidades = "error" in partes ? [] : partes.unidades;
    const entidadDeUnidad = new Map(unidades.map((u) => [u.id, u.entidad_id]));
    const monedaEntidad = new Map(entidades.map((e) => [e.id, e.moneda]));

    const lista: MovimientoDesglose[] = [];
    for (const m of movs.data ?? []) {
      const u = uno(m.fin_unidades);
      const t = uno(m.fin_tipos);
      if (!u || !t) continue;
      const moneda = m.moneda ?? "USD";
      if (moneda !== "USD" && (m.tasa_usd === null || m.tasa_usd === undefined)) continue;
      if (conDepreciacion && (m.es_bien_de_uso || t.nombre === "Alta Bien de Uso" || t.seccion === "depreciacion")) continue;
      const entidad = entidadDeUnidad.get(m.unidad_id) ?? u.entidad_id ?? null;
      const periodo = String(m.periodo).slice(0, 10);
      let monto = Number(m.monto);
      if (c.local) {
        const me = entidad ? monedaEntidad.get(entidad) : undefined;
        if (me && me !== "USD") monto = moneda === me ? Number(m.monto_original ?? m.monto) : Math.round(monto * (tasaDelMes(tasas, me, periodo, "promedio") ?? 0) * 100) / 100;
      }
      lista.push({
        id: m.id,
        periodo,
        fecha: m.fecha_pago ?? m.fecha_registro ?? null,
        unidad_id: m.unidad_id,
        unidad: u.nombre,
        clase: u.clase,
        entidad_id: entidad,
        tipo: t.nombre,
        seccion: t.seccion,
        signo: Number(t.signo),
        descripcion: m.descripcion ?? "",
        monto,
        intercompania: m.intercompania === true || t.intercompania === true,
      });
    }

    // La depreciación calculada de los bienes de uso (no son movimientos del libro).
    if (conDepreciacion && fila.secciones.includes("depreciacion") && (!fila.tipo || fila.tipo === "Depreciación Bienes de uso")) {
      const dep = await supabase.from("fin_depreciacion_mensual").select("periodo, unidad_id, monto").in("periodo", c.meses);
      const nombres = new Map(unidades.map((u) => [u.id, u]));
      for (const d of dep.error ? [] : (dep.data ?? [])) {
        const u = nombres.get(d.unidad_id as string);
        if (!u || (c.entidadId && u.entidad_id !== c.entidadId)) continue;
        const periodo = String(d.periodo).slice(0, 10);
        lista.push({
          id: `dep-${periodo}-${u.id}`,
          periodo,
          fecha: null,
          unidad_id: u.id,
          unidad: u.nombre,
          clase: u.clase,
          entidad_id: u.entidad_id,
          tipo: "Depreciación Bienes de uso",
          seccion: "depreciacion",
          signo: -1,
          descripcion: "Depreciación de los bienes de uso",
          monto: Number(d.monto),
          intercompania: false,
        });
      }
    }

    const r = desglosar(lista, {
      unidadId: c.unidadId,
      participacion: (periodo, entidad, unidad) => participacionDe(pesos, periodo, entidad, unidad),
      sinIntercompania: c.sinIntercompania === true,
      resultado: fila.resultado,
    });
    return { lineas: r.lineas.slice(0, MAX_LINEAS), total: r.total, cantidad: r.lineas.length };
  } catch (e) {
    return { ...vacio, error: e instanceof Error ? e.message : "No se pudo desglosar la cifra." };
  }
}

/** Marca o desmarca un movimiento como intercompañía (sale del EERR consolidado). Quien puede modificar el libro. */
export async function marcarIntercompania(id: string, valor: boolean): Promise<{ error?: string }> {
  try {
    await requireModuloEscritura("libro-movimientos");
    if (typeof id !== "string" || !UUID.test(id) || typeof valor !== "boolean") return { error: "Movimiento inválido." };
    const supabase = createServiceClient();
    const acceso = await sinAccesoARegistros(supabase, "fin_movimientos", [id]);
    if (acceso) return { error: acceso };
    const previo = await supabase.from("fin_movimientos").select("intercompania, descripcion, periodo").eq("id", id).maybeSingle();
    if (previo.error) return { error: "Falta correr la migración 0929 (estados financieros) en Supabase." };
    if (!previo.data) return { error: "Ese movimiento ya no existe." };
    if (previo.data.intercompania === valor) return {};
    const { error } = await supabase.from("fin_movimientos").update({ intercompania: valor, actualizado_en: new Date().toISOString() }).eq("id", id);
    if (error) return { error: /cerrad/i.test(error.message) ? "Ese mes está cerrado." : "No se pudo guardar." };
    await registrarAuditoria({
      accion: "marcar_intercompania",
      entidad: "fin_movimientos",
      entidadId: id,
      detalle: `${String(previo.data.descripcion ?? "").slice(0, 80)} · ${String(previo.data.periodo).slice(0, 7)}`,
      antes: { Intercompañía: previo.data.intercompania ? "Sí" : "No" },
      despues: { Intercompañía: valor ? "Sí" : "No" },
    });
    revalidatePath("/estado-resultados");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}
