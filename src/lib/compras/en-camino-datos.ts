import type { SupabaseClient } from "@supabase/supabase-js";
import { dentroDelAlcance, restriccionesDe } from "@/app/(app)/compras/permisos-compras";
import type { UsuarioActual } from "@/lib/auth";
import { puedeVerPais } from "@/lib/paises-permitidos";
import { indexar } from "@/lib/scraping/cruces";
import { traerTodasLasFilas } from "@/lib/supabase/paginar";
import { lineaEnCamino } from "./en-camino";
import { repartirEnCamino, type Aporte, type ComponenteDeCombo, type LineaDeOrden } from "./en-camino-productos";
import { productoDeCompra } from "./foto-producto";

/** Una orden que viene en camino. */
export interface OrdenEnCaminoDatos {
  id: string;
  numero: number;
  tipo: string;
  paisId: string | null;
  paisCodigo: string | null;
  paisNombre: string | null;
  etapa: string;
  fechaLimite: string | null;
  viaEnvio: string[];
  fechaEnvio: string | null;
  fechaLlegada: string | null;
  anulada: boolean;
}

export interface EnCaminoDatos {
  /** Las unidades que cada orden le aporta a cada producto (con variantes y combos: `repartirEnCamino`). */
  porProducto: Map<string, Aporte[]>;
  /** Las órdenes que vienen en camino, por id. */
  ordenes: Map<string, OrdenEnCaminoDatos>;
}

const trozos = <T,>(lista: T[], n: number): T[][] => Array.from({ length: Math.ceil(lista.length / n) }, (_, i) => lista.slice(i * n, i * n + n));
const uno = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

type FilaCompra = {
  id: string;
  numero: number;
  tipo: string;
  nombre: string | null;
  qty_total: number | null;
  pais_id: string | null;
  etapa: string;
  fecha_limite: string | null;
  via_envio: string[] | null;
  fecha_envio: string | null;
  fecha_llegada: string | null;
  anulada_en: string | null;
  asignado_a: string | null;
  creado_por: string | null;
  responsable_nombre: string | null;
  creador_nombre: string | null;
  paises: { codigo: string; nombre: string } | { codigo: string; nombre: string }[] | null;
};

/**
 * Lo que viene en camino de cada producto: las unidades de las órdenes ya pedidas que todavía no llegan (ya salieron o están en producción,
 * tracking o arribo: `lineaEnCamino`), orden por orden. Con `paisId` solo las de ese país; sin él, las de todos los países que la persona
 * puede ver. Respeta el alcance de Compras de la persona (Usuarios y roles › Afinar). Solo unidades y fechas: no trae costos.
 *
 * Además de las líneas de producto de cada orden (`wms_compra_items`):
 *  - una **variante** suma a su producto y un **combo** suma a sus componentes y al revés (`repartirEnCamino`);
 *  - una orden **sin ninguna línea de producto** (todavía no se vinculó en Compras) se cuenta con su cantidad total (`qty_total`) para el
 *    producto que se llama igual que ella (el mismo cruce de nombre que usa Compras para mostrar su foto): antes esas órdenes no aparecían
 *    en ningún lado.
 * Si algo falla, nada.
 */
export async function cargarEnCaminoDatos(supabase: SupabaseClient, usuario: UsuarioActual, paisId: string | null): Promise<EnCaminoDatos> {
  const vacio: EnCaminoDatos = { porProducto: new Map(), ordenes: new Map() };
  let consulta = supabase
    .from("wms_compras")
    .select("id, numero, tipo, nombre, qty_total, pais_id, etapa, fecha_limite, via_envio, fecha_envio, fecha_llegada, anulada_en, asignado_a, creado_por, responsable_nombre, creador_nombre, paises(codigo, nombre)")
    .is("anulada_en", null)
    .is("fecha_llegada", null)
    .not("etapa", "in", "(completado,descartado)")
    // Ya salió, o ya está en producción, tracking o arribo (pedida aunque todavía no tenga fecha de envío).
    .or("fecha_envio.not.is.null,etapa.in.(produccion,tracking,arribo_mercancia)");
  if (paisId) consulta = consulta.eq("pais_id", paisId);
  const { data: compras, error } = await consulta.limit(5000);
  if (error || !compras?.length) return vacio;
  const limites = restriccionesDe(usuario.afinado.compras);
  const abiertas = (compras as unknown as FilaCompra[]).filter(
    (c) =>
      lineaEnCamino({ pais: null, unidades: 1, etapa: c.etapa, fechaEnvio: c.fecha_envio, fechaLlegada: c.fecha_llegada, anulada: !!c.anulada_en }) &&
      puedeVerPais(usuario.paisesPermitidos, uno(c.paises)?.codigo ?? null) &&
      dentroDelAlcance(limites.alcance, { asignadoId: c.asignado_a, creadoPorId: c.creado_por, responsableNombre: c.responsable_nombre, creadorNombre: c.creador_nombre }, usuario),
  );
  if (!abiertas.length) return vacio;

  const lineas: LineaDeOrden[] = [];
  for (const ids of trozos(abiertas.map((c) => c.id), 100)) {
    const { data } = await supabase.from("wms_compra_items").select("compra_id, sku_maestro_id, cantidad_pedida").in("compra_id", ids);
    for (const l of (data ?? []) as { compra_id: string; sku_maestro_id: string; cantidad_pedida: number }[]) lineas.push({ compraId: l.compra_id, skuId: l.sku_maestro_id, unidades: Number(l.cantidad_pedida) });
  }

  // Una orden sin líneas: se busca el producto que se llama igual y se cuenta su cantidad total.
  const conLineas = new Set(lineas.map((l) => l.compraId));
  const sinLineas = abiertas.filter((c) => !conLineas.has(c.id) && Number(c.qty_total) > 0 && (c.nombre ?? "").trim());
  if (sinLineas.length) {
    try {
      const productos = await traerTodasLasFilas<{ id: string; codigo: string; nombre: string }>((d, h) => supabase.from("skus_maestros").select("id, codigo, nombre").order("id").range(d, h));
      const indice = indexar(productos.map((p) => ({ tipo: "producto" as const, id: p.id, nombre: p.nombre, huella: null, detalle: p.codigo })));
      for (const c of sinLineas) {
        const p = productoDeCompra(c.nombre as string, null, indice);
        if (p && p.como === "nombre") lineas.push({ compraId: c.id, skuId: p.id, unidades: Number(c.qty_total) });
      }
    } catch {
      // Sin el cruce por nombre, esas órdenes siguen sin contarse: lo demás carga igual.
    }
  }
  if (!lineas.length) return { porProducto: new Map(), ordenes: new Map(abiertas.map((c) => [c.id, aOrden(c)])) };

  // Variantes (suman a su producto) y combos (de qué se arman), de los productos que aparecen y de sus componentes.
  const padres = new Map<string, string>();
  const componentes: ComponenteDeCombo[] = [];
  const vistos = new Set<string>();
  let pendientes = [...new Set(lineas.map((l) => l.skuId).filter(Boolean))];
  // Dos vueltas bastan: los productos de las líneas y luego los componentes que aparecen en sus combos.
  for (let vuelta = 0; vuelta < 2 && pendientes.length; vuelta++) {
    const siguientes: string[] = [];
    for (const ids of trozos(pendientes, 100)) {
      for (const id of ids) vistos.add(id);
      const { data: vars } = await supabase.from("skus_maestros").select("id, padre_id").in("id", ids).not("padre_id", "is", null);
      for (const s of vars ?? []) padres.set(s.id as string, s.padre_id as string);
      const { data: combos } = await supabase.from("sku_maestro_componentes").select("combo_id, componente_id, cantidad").in("combo_id", ids);
      for (const c of combos ?? []) {
        componentes.push({ comboId: c.combo_id as string, componenteId: c.componente_id as string, cantidad: Number(c.cantidad) });
        if (!vistos.has(c.componente_id as string)) siguientes.push(c.componente_id as string);
      }
    }
    pendientes = [...new Set(siguientes)];
  }
  // Los combos que se arman con productos que aparecen en las órdenes (la orden es del simple y se vende el combo).
  const productos = [...new Set(lineas.map((l) => l.skuId).filter(Boolean))];
  for (const ids of trozos(productos, 100)) {
    const { data: combos } = await supabase.from("sku_maestro_componentes").select("combo_id, componente_id, cantidad").in("componente_id", ids);
    for (const c of combos ?? []) {
      const ya = componentes.some((x) => x.comboId === c.combo_id && x.componenteId === c.componente_id);
      if (!ya) componentes.push({ comboId: c.combo_id as string, componenteId: c.componente_id as string, cantidad: Number(c.cantidad) });
    }
  }
  // Un combo con varios componentes necesita todos: se traen los que falten de los combos encontrados.
  const combosVistos = new Set(componentes.map((c) => c.comboId));
  for (const ids of trozos([...combosVistos], 100)) {
    const { data: combos } = await supabase.from("sku_maestro_componentes").select("combo_id, componente_id, cantidad").in("combo_id", ids);
    for (const c of combos ?? []) {
      const ya = componentes.some((x) => x.comboId === c.combo_id && x.componenteId === c.componente_id);
      if (!ya) componentes.push({ comboId: c.combo_id as string, componenteId: c.componente_id as string, cantidad: Number(c.cantidad) });
    }
  }

  return { porProducto: repartirEnCamino(lineas, padres, componentes), ordenes: new Map(abiertas.map((c) => [c.id, aOrden(c)])) };
}

function aOrden(c: FilaCompra): OrdenEnCaminoDatos {
  const pais = uno(c.paises);
  return {
    id: c.id,
    numero: Number(c.numero),
    tipo: c.tipo,
    paisId: c.pais_id,
    paisCodigo: pais?.codigo ?? null,
    paisNombre: pais?.nombre ?? null,
    etapa: c.etapa,
    fechaLimite: c.fecha_limite,
    viaEnvio: c.via_envio ?? [],
    fechaEnvio: c.fecha_envio,
    fechaLlegada: c.fecha_llegada,
    anulada: !!c.anulada_en,
  };
}
