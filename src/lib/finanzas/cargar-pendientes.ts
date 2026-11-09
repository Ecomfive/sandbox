// La bandeja «Por clasificar» del Libro de movimientos: los movimientos sin tienda o sin tipo, cada uno con su
// sugerencia (regla o lo aprendido de lo ya clasificado). Solo lectura; el módulo lo comprueba quien llama. Con tiendas
// permitidas (`perfiles.tiendas_permitidas`) solo trae los movimientos de esas tiendas que no tienen tipo (lo que no tiene
// tienda es de toda la empresa) y no sugiere ni ofrece otras tiendas.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasConError } from "@/lib/supabase/paginar";
import { aprender, type Regla } from "./clasificacion";
import { indexar, nivelConfianza } from "./similitud";
import { sugerirConConfianza } from "./sugerencias-confianza";
import { leerReglas } from "./guardar-libro";
import { claveCatalogo, UNIDAD_SIN_ASIGNAR } from "./libro-excel";
import { SIN_TIENDA, puedeVerUnidad } from "./tiendas-permitidas";

export interface Opcion {
  id: string;
  nombre: string;
}

export interface FilaPendiente {
  id: string;
  periodo: string;
  fecha: string | null;
  descripcion: string;
  monto: number;
  cuenta: string;
  tienda: string;
  tipo: string;
  falta: "Tienda y tipo" | "Tienda" | "Tipo";
  sugTiendaId: string | null;
  sugTienda: string | null;
  sugTipoId: string | null;
  sugTipo: string | null;
  sugOrigen: "Regla" | "Como antes" | "Parecido" | "Sin sugerencia";
  sugDetalle: string | null;
  /** Confianza de la sugerencia (0 a 100) y su nivel, para filtrar y aceptar en lote solo lo seguro. */
  confianza: number | null;
  nivel: "Alta" | "Media" | "Baja" | "Sin sugerencia";
}

interface MovPendiente {
  id: string;
  periodo: string;
  fecha_pago: string | null;
  fecha_registro: string | null;
  descripcion: string;
  monto: number | string;
  unidad_id: string;
  tipo_id: string | null;
  tipo_texto: string | null;
  fin_cuentas: { nombre: string } | { nombre: string }[] | null;
}

export async function cargarPendientes(
  supabase: SupabaseClient,
  permitidas: string[] | null = null,
): Promise<{ error: string } | { filas: FilaPendiente[]; tiendas: Opcion[]; tipos: Opcion[]; reglas: Regla[] }> {
  const [unidadesR, tiposR] = await Promise.all([
    supabase.from("fin_unidades").select("id, nombre, clase, orden").eq("activo", true).order("orden"),
    supabase.from("fin_tipos").select("id, nombre, seccion, orden").order("orden"),
  ]);
  if (unidadesR.error || tiposR.error) return { error: "Falta la migración 0901." };
  const unidades = unidadesR.data ?? [];
  const sinAsignar = unidades.find((u) => claveCatalogo(u.nombre) === UNIDAD_SIN_ASIGNAR)?.id ?? null;
  const nombreUnidad = new Map(unidades.map((u) => [u.id as string, u.nombre as string]));
  const nombreTipo = new Map((tiposR.data ?? []).map((t) => [t.id as string, t.nombre as string]));

  const filtroPendiente = sinAsignar ? `tipo_id.is.null,unidad_id.eq.${sinAsignar}` : "tipo_id.is.null";
  const [pendientes, historial, reglas] = await Promise.all([
    traerTodasConError<MovPendiente>((desde, hasta) => {
      const base = supabase
        .from("fin_movimientos")
        .select("id, periodo, fecha_pago, fecha_registro, descripcion, monto, unidad_id, tipo_id, tipo_texto, fin_cuentas(nombre)");
      // Con tiendas limitadas: solo las suyas sin tipo (sin el `.or`, que traería lo SIN ASIGNAR de toda la empresa).
      const q = permitidas ? base.is("tipo_id", null).in("unidad_id", permitidas.length ? permitidas : [SIN_TIENDA]) : base.or(filtroPendiente);
      return q.order("periodo", { ascending: false }).order("id").range(desde, hasta) as unknown as PromiseLike<{ data: MovPendiente[] | null; error: unknown }>;
    }),
    traerTodasConError<{ descripcion: string; unidad_id: string; tipo_id: string; monto: number | string }>((desde, hasta) =>
      supabase
        .from("fin_movimientos")
        .select("descripcion, unidad_id, tipo_id, monto")
        .not("tipo_id", "is", null)
        .order("id")
        .range(desde, hasta),
    ),
    leerReglas(supabase),
  ]);
  if (pendientes.error || historial.error) return { error: "No se pudieron leer los movimientos." };
  const aprendido = aprender(historial.data ?? [], sinAsignar);
  const indice = indexar((historial.data ?? []).map((h) => ({ ...h, monto: Number(h.monto) })), sinAsignar);

  const filas: FilaPendiente[] = (pendientes.data ?? []).map((m) => {
    const faltaTienda = m.unidad_id === sinAsignar;
    const faltaTipo = !m.tipo_id;
    const sugerida = sugerirConConfianza({ descripcion: m.descripcion, monto: Number(m.monto), unidad_id: m.unidad_id, tipo_id: m.tipo_id }, sinAsignar, reglas, aprendido, indice);
    // Una tienda que la persona no puede ver no se sugiere.
    const s = sugerida.unidad_id && !puedeVerUnidad(permitidas, sugerida.unidad_id) ? { ...sugerida, unidad_id: null } : sugerida;
    const cuenta = Array.isArray(m.fin_cuentas) ? m.fin_cuentas[0] : m.fin_cuentas;
    return {
      id: m.id,
      periodo: String(m.periodo).slice(0, 10),
      fecha: m.fecha_pago ?? m.fecha_registro,
      descripcion: m.descripcion,
      monto: Number(m.monto),
      cuenta: cuenta?.nombre ?? "—",
      tienda: nombreUnidad.get(m.unidad_id) ?? "—",
      tipo: m.tipo_id ? (nombreTipo.get(m.tipo_id) ?? "—") : (m.tipo_texto ?? "—"),
      falta: faltaTienda && faltaTipo ? "Tienda y tipo" : faltaTienda ? "Tienda" : "Tipo",
      sugTiendaId: s.unidad_id,
      sugTienda: s.unidad_id ? (nombreUnidad.get(s.unidad_id) ?? null) : null,
      sugTipoId: s.tipo_id,
      sugTipo: s.tipo_id ? (nombreTipo.get(s.tipo_id) ?? null) : null,
      sugOrigen: s.origen === "regla" ? "Regla" : s.origen === "historial" ? "Como antes" : s.origen === "parecido" ? "Parecido" : "Sin sugerencia",
      sugDetalle: s.detalle,
      confianza: s.confianza,
      nivel: nivelConfianza(s.tipo_id || s.unidad_id ? s.confianza : null),
    };
  });

  const tiendas = unidades
    .filter((u) => u.id !== sinAsignar && puedeVerUnidad(permitidas, u.id as string))
    .map((u) => ({ id: u.id as string, nombre: u.nombre as string }));
  const tipos = (tiposR.data ?? [])
    .filter((t) => t.seccion !== "sin_clasificar")
    .map((t) => ({ id: t.id as string, nombre: t.nombre as string }));
  return { filas, tiendas, tipos, reglas: permitidas ? reglas.filter((r) => !!r.unidad_id && puedeVerUnidad(permitidas, r.unidad_id)) : reglas };
}
