// Consumo de IA: solo servidor. Anota cada uso de OpenAI y de Gemini (`registrarConsumo`, que nunca rompe lo que se estaba haciendo), lo lee
// para la pantalla «Consumo de IA» y dice qué proveedor tiene el crédito por acabarse (el aviso de Hoy y Avisos). Si faltan las tablas
// (migración 0134), todo cuenta cero: el asistente y las landings siguen funcionando.

import type { SupabaseClient } from "@supabase/supabase-js";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { createServiceClient } from "@/lib/supabase/server";
import type { ProveedorConsumo } from "./precios";
import { estadoSaldo, saldoEstimado, type Credito, type EstadoSaldo, type FilaConsumo, type SaldoEstimado } from "./saldo";

/** Cuándo, quién y para qué se usa la IA: lo que acompaña a cada pedido para anotarlo. */
export interface ContextoConsumo {
  operacion: string;
  modulo: string;
  usuario?: { id: string; nombre: string | null; email: string } | null;
  publicacionId?: string | null;
  referencia?: string | null;
}

export interface UsoAnotado {
  proveedor: ProveedorConsumo;
  modelo: string;
  tokensEntrada?: number;
  tokensSalida?: number;
  busquedas?: number;
  imagenes?: number;
  costoUsd: number;
  ok: boolean;
  error?: string | null;
}

/** Anota un uso. Si la tabla no existe o falla, se ignora: anotar el consumo nunca debe romper lo que se estaba haciendo. */
export async function registrarConsumo(contexto: ContextoConsumo, uso: UsoAnotado): Promise<void> {
  try {
    await createServiceClient()
      .from("ia_consumo")
      .insert({
        proveedor: uso.proveedor,
        operacion: contexto.operacion.slice(0, 40),
        modulo: contexto.modulo.slice(0, 60),
        modelo: uso.modelo.slice(0, 80),
        tokens_entrada: Math.max(0, Math.round(uso.tokensEntrada ?? 0)),
        tokens_salida: Math.max(0, Math.round(uso.tokensSalida ?? 0)),
        busquedas: Math.max(0, Math.round(uso.busquedas ?? 0)),
        imagenes: Math.max(0, Math.round(uso.imagenes ?? 0)),
        costo_usd: Math.max(0, uso.costoUsd),
        ok: uso.ok,
        error: uso.error ? uso.error.slice(0, 300) : null,
        publicacion_id: contexto.publicacionId ?? null,
        referencia: contexto.referencia ?? null,
        usuario_id: contexto.usuario?.id ?? null,
        usuario_nombre: contexto.usuario ? contexto.usuario.nombre || contexto.usuario.email : null,
      });
  } catch {
    // Sin la migración 0134: no se anota.
  }
}

type FilaBd = {
  proveedor: ProveedorConsumo;
  operacion: string;
  modelo: string | null;
  tokens_entrada: number;
  tokens_salida: number;
  busquedas: number;
  imagenes: number;
  costo_usd: number | string;
  usuario_nombre: string | null;
  ok: boolean;
  creado_en: string;
};

/** Todo el consumo desde una fecha (ISO). `disponible` es false si falta la migración 0134. */
export async function cargarConsumo(supabase: SupabaseClient, desdeIso: string): Promise<{ filas: FilaConsumo[]; disponible: boolean }> {
  try {
    const filas = await traerTodasLasFilas<FilaBd>((d, h) =>
      supabase.from("ia_consumo").select("proveedor, operacion, modelo, tokens_entrada, tokens_salida, busquedas, imagenes, costo_usd, usuario_nombre, ok, creado_en").gte("creado_en", desdeIso).order("creado_en", { ascending: false }).order("id").range(d, h),
    );
    return {
      disponible: true,
      filas: filas.map((f) => ({
        proveedor: f.proveedor,
        operacion: f.operacion,
        modelo: f.modelo,
        tokensEntrada: Number(f.tokens_entrada),
        tokensSalida: Number(f.tokens_salida),
        busquedas: Number(f.busquedas),
        imagenes: Number(f.imagenes),
        costoUsd: Number(f.costo_usd),
        usuarioNombre: f.usuario_nombre,
        ok: f.ok,
        creadoEn: f.creado_en,
      })),
    };
  } catch {
    return { filas: [], disponible: false };
  }
}

export interface CreditoGuardado extends Credito {
  nota: string | null;
  usuarioNombre: string | null;
}

/** El saldo y las recargas que el equipo registró, de lo más nuevo a lo más viejo. */
export async function cargarCreditos(supabase: SupabaseClient): Promise<CreditoGuardado[]> {
  const { data, error } = await supabase.from("ia_creditos").select("proveedor, tipo, monto_usd, nota, usuario_nombre, creado_en").order("creado_en", { ascending: false }).limit(200);
  if (error) return [];
  return (data ?? []).map((c) => ({ proveedor: c.proveedor as ProveedorConsumo, tipo: c.tipo as "saldo" | "recarga", montoUsd: Number(c.monto_usd), nota: (c.nota as string | null) ?? null, usuarioNombre: (c.usuario_nombre as string | null) ?? null, creadoEn: c.creado_en as string }));
}

/** El monto de aviso de cada proveedor (los 5 dólares de siempre si no se cambió). */
export const UMBRAL_POR_DEFECTO = 5;
export async function cargarUmbrales(supabase: SupabaseClient): Promise<Record<ProveedorConsumo, number>> {
  const out: Record<ProveedorConsumo, number> = { openai: UMBRAL_POR_DEFECTO, gemini: UMBRAL_POR_DEFECTO, anthropic: UMBRAL_POR_DEFECTO };
  const { data } = await supabase.from("ia_consumo_config").select("proveedor, umbral_usd");
  for (const f of data ?? []) if (f.proveedor in out) out[f.proveedor as ProveedorConsumo] = Number(f.umbral_usd);
  return out;
}

export interface CreditoPorAcabarse {
  proveedor: ProveedorConsumo;
  estado: Extract<EstadoSaldo, "por_acabarse" | "agotado">;
  saldo: SaldoEstimado;
}

/**
 * Los proveedores cuyo crédito estimado ya bajó del monto de aviso o se agotó: lo que sale como pendiente en Hoy y Avisos. Solo cuentan los
 * que tienen un saldo o una recarga registrados (sin eso no hay con qué estimar). Sin las tablas, ninguno.
 */
export async function creditosPorAcabarse(supabase: SupabaseClient): Promise<CreditoPorAcabarse[]> {
  const creditos = await cargarCreditos(supabase);
  if (!creditos.length) return [];
  const proveedores = [...new Set(creditos.map((c) => c.proveedor))];
  const desde = creditos.reduce((m, c) => (c.creadoEn < m ? c.creadoEn : m), creditos[0].creadoEn);
  const [{ filas }, umbrales] = await Promise.all([cargarConsumo(supabase, desde), cargarUmbrales(supabase)]);
  const out: CreditoPorAcabarse[] = [];
  for (const p of proveedores) {
    const saldo = saldoEstimado(p, creditos, filas);
    const estado = estadoSaldo(saldo, umbrales[p]);
    if (estado === "por_acabarse" || estado === "agotado") out.push({ proveedor: p, estado, saldo });
  }
  return out;
}
