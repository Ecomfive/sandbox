// Anuncios Meta › la calculadora de costos de operación (25 nov 2026, pedido de Alcides, de su hoja de cálculo): cuánto cuesta de verdad cada venta que sí se entrega. Se ignoran a propósito el costo del producto, los precios de venta
// (cambian todo el tiempo) y el IVA. El porcentaje de envío y el de entrega salen de los pedidos de la tienda; el envío, la comisión contra entrega y el costo operativo se escriben en la pantalla. Las fórmulas son las de la hoja:
//   CPA real  = CPA de Meta ÷ (% de envío × % de entrega)
//   Envíos    = envío + comisión contra entrega × % de entrega + (1 − % de entrega) × envío
//   Costo por venta entregada = CPA real + envíos + costo operativo
// Lógica pura, con prueba. Es informativo: todavía no cambia el CPA tope ni lo que el sistema recomienda apagar.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntregaProducto } from "./historico";
import { rentabilidadDe, type EconomiaProducto, type Rentabilidad } from "./rentabilidad";

export interface CostosOperacion {
  /** Lo que cuesta cada envío (US$). */
  envio: number;
  /** Comisión por cobrar contra entrega, por pedido entregado (US$). */
  cod: number;
  /** Costo operativo por venta (US$). */
  operativo: number;
}

/** Los valores que traía la hoja de la calculadora: con ellos arranca mientras nadie guarde otros. */
export const COSTOS_DE_LA_HOJA: CostosOperacion = { envio: 6.27, cod: 0, operativo: 2.25 };
export const MAX_COSTO = 500;
/** Con menos pedidos ya decididos que estos, el porcentaje de un producto no es de fiar y se usa el de toda la tienda. */
export const MIN_PEDIDOS_PARA_TASA = 15;

export const claveDeCostos = (paisId: string) => `costos_operacion:${paisId}`;

const NOMBRES: Record<keyof CostosOperacion, string> = { envio: "El costo del envío", cod: "La comisión contra entrega", operativo: "El costo operativo" };

/** Valida lo que llega del navegador (o lo guardado): tres montos entre 0 y 500, con dos decimales. */
export function revisarCostos(valor: unknown): { costos: CostosOperacion } | { error: string } {
  const v = (valor && typeof valor === "object" ? valor : {}) as Record<string, unknown>;
  const costos = { ...COSTOS_DE_LA_HOJA };
  for (const k of Object.keys(NOMBRES) as (keyof CostosOperacion)[]) {
    const crudo = v[k];
    const n = typeof crudo === "number" ? crudo : typeof crudo === "string" && crudo.trim() ? Number(crudo.trim().replace(",", ".")) : NaN;
    if (!Number.isFinite(n) || n < 0 || n > MAX_COSTO) return { error: `${NOMBRES[k]} tiene que ser un número entre 0 y ${MAX_COSTO}.` };
    costos[k] = Math.round(n * 100) / 100;
  }
  return { costos };
}

export interface CostosGuardados {
  por: string | null;
  en: string | null;
}

/** Los costos del país: los guardados o, si nadie ha guardado (o falta la tabla), los de la hoja. */
export async function leerCostos(supabase: SupabaseClient, paisId: string): Promise<{ costos: CostosOperacion; guardados: CostosGuardados | null }> {
  const deLaHoja = { costos: COSTOS_DE_LA_HOJA, guardados: null };
  const { data, error } = await supabase.from("meta_ajustes").select("valor, actualizado_por_nombre, actualizado_en").eq("clave", claveDeCostos(paisId)).maybeSingle();
  if (error || !data) return deLaHoja;
  const revisados = revisarCostos(data.valor);
  return "costos" in revisados ? { costos: revisados.costos, guardados: { por: (data.actualizado_por_nombre as string | null) ?? null, en: (data.actualizado_en as string | null) ?? null } } : deLaHoja;
}

/** De los pedidos de un producto (o de toda la tienda): las unidades de cada estado. */
export type PedidosParaTasa = Pick<EntregaProducto, "entregadas" | "devueltas" | "canceladas" | "enCamino" | "sinEnviar">;

export interface Tasas {
  /** De los pedidos ya decididos (enviados, cancelados o sin gestionar), cuántos se enviaron. Los que siguen pendientes no cuentan. null con pocos. */
  envio: number | null;
  /** De los enviados que ya terminaron (entregados o devueltos), cuántos se entregaron. null con pocos. */
  entrega: number | null;
}

export function tasasDe(p: PedidosParaTasa | null | undefined): Tasas {
  if (!p) return { envio: null, entrega: null };
  const cerrados = p.entregadas + p.devueltas;
  // Un análisis guardado antes de esta calculadora no separa lo pendiente de lo enviado: sin ese dato no hay % de envío.
  const enviados = p.sinEnviar === undefined ? null : cerrados + Math.max(0, p.enCamino - p.sinEnviar);
  const decididos = enviados === null ? 0 : enviados + p.canceladas;
  return {
    envio: enviados !== null && decididos >= MIN_PEDIDOS_PARA_TASA ? enviados / decididos : null,
    entrega: cerrados >= MIN_PEDIDOS_PARA_TASA ? p.entregadas / cerrados : null,
  };
}

/** Todos los pedidos juntos: la tasa «de la tienda», la que se usa para un producto con pocos pedidos. */
export function sumarPedidos(lista: readonly (PedidosParaTasa | null | undefined)[]): PedidosParaTasa {
  const t: Required<PedidosParaTasa> = { entregadas: 0, devueltas: 0, canceladas: 0, enCamino: 0, sinEnviar: 0 };
  let separados = true;
  for (const p of lista) {
    if (!p) continue;
    t.entregadas += p.entregadas;
    t.devueltas += p.devueltas;
    t.canceladas += p.canceladas;
    t.enCamino += p.enCamino;
    if (p.sinEnviar === undefined) separados = false;
    else t.sinEnviar += p.sinEnviar;
  }
  return separados ? t : { entregadas: t.entregadas, devueltas: t.devueltas, canceladas: t.canceladas, enCamino: t.enCamino };
}

export interface CostoDeVenta {
  /** Lo que de verdad cuesta en anuncios cada venta que llega: el CPA de Meta repartido entre las que se envían y se entregan. */
  cpaReal: number;
  envios: number;
  operativo: number;
  /** CPA real + envíos + costo operativo (sin el producto ni el IVA). */
  total: number;
}

export function costoPorVenta(cpaMeta: number | null, envio: number | null, entrega: number | null, c: CostosOperacion): CostoDeVenta | null {
  if (cpaMeta === null || envio === null || entrega === null || envio <= 0 || entrega <= 0) return null;
  const cpaReal = cpaMeta / (envio * entrega);
  const envios = c.envio + c.cod * entrega + (1 - entrega) * c.envio;
  return { cpaReal, envios, operativo: c.operativo, total: cpaReal + envios + c.operativo };
}

export interface FilaCosto {
  clave: string;
  nombre: string;
  gasto: number;
  compras: number;
  cpa: number | null;
  envio: number | null;
  entrega: number | null;
  /** El porcentaje no es del producto (tiene pocos pedidos) sino el de toda la tienda. */
  envioDeLaTienda: boolean;
  entregaDeLaTienda: boolean;
  costo: CostoDeVenta | null;
  /** La venta y el costo del producto (27 nov 2026): de dónde sale y, si alcanza, cuánto deja y hasta qué CPA no se pierde. */
  economia: EconomiaProducto | null;
  rentabilidad: Rentabilidad | null;
}

/** La entrega de cada producto (por la llave de su nombre) y los porcentajes de toda la tienda, como llegan a la pantalla de Productos. */
export interface EntregasMeta {
  productos: Record<string, PedidosParaTasa & { tasa: number | null; cerradas: number }>;
  promedio: number | null;
  tienda: Tasas;
  /** La venta y el costo de cada producto (por la llave de su nombre); un análisis guardado antes no lo trae. */
  economia?: Record<string, EconomiaProducto>;
}

/** Cada producto con su CPA de Meta, sus porcentajes (los suyos o, con pocos pedidos, los de la tienda) y lo que cuesta cada venta entregada; de más a menos gasto. */
export function filasDeCostos(
  productos: readonly { clave: string; nombre: string; gasto: number; compras: number }[],
  pedidos: Readonly<Record<string, PedidosParaTasa | undefined>>,
  tienda: Tasas,
  c: CostosOperacion,
  economia: Readonly<Record<string, EconomiaProducto | undefined>> = {},
): FilaCosto[] {
  return productos
    .filter((p) => p.clave && p.gasto > 0)
    .map((p): FilaCosto => {
      const suyas = tasasDe(pedidos[p.clave]);
      const envio = suyas.envio ?? tienda.envio;
      const entrega = suyas.entrega ?? tienda.entrega;
      const cpa = p.compras > 0 ? p.gasto / p.compras : null;
      const costo = costoPorVenta(cpa, envio, entrega, c);
      const e = economia[p.clave] ?? null;
      return {
        clave: p.clave,
        nombre: p.nombre,
        gasto: p.gasto,
        compras: p.compras,
        cpa,
        envio,
        entrega,
        envioDeLaTienda: suyas.envio === null && envio !== null,
        entregaDeLaTienda: suyas.entrega === null && entrega !== null,
        costo,
        economia: e,
        rentabilidad: rentabilidadDe(e, envio, entrega, c, costo),
      };
    })
    .sort((a, b) => b.gasto - a.gasto);
}
