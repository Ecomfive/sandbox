// El asistente de confirmación de la ficha de un pedido de tienda (13 nov 2026, pedido de Hernán: «como la ficha de la app de Jorge», fase 2). Cuatro
// partes, como allá: 1) riesgo del cliente y de la zona, 2) dirección, 3) transportadora, 4) pedido y conversación. No es una IA: son reglas sobre lo
// registrado (los pedidos de la tienda, Monday, Servientrega, las etiquetas de Shopify, el chat del CRM); cada cifra dice de dónde sale. La parte pura
// (`evaluarAsistente`) tiene prueba; `datosAsistente` lee la base.

import type { SupabaseClient } from "@supabase/supabase-js";
import { riesgoCliente } from "@/lib/ventas/operacion";
import { enGestion } from "./confirmacion";
import { etiquetasDe, zonaDeEtiquetas } from "./ordenes-finanzas";

export type Nivel = "bien" | "aviso" | "mal" | "gris";

export interface LineaAsistente {
  nivel: Nivel;
  texto: string;
}

export interface ParteAsistente {
  titulo: string;
  nivel: Nivel;
  lineas: LineaAsistente[];
}

export interface Asistente {
  riesgo: "bajo" | "medio" | "alto";
  partes: ParteAsistente[];
  /** La frase de abajo: qué falta para despachar (o que ya salió). */
  resumen: string;
}

export interface DatosAsistente {
  fase: string | null;
  etiquetas: string | null;
  cliente: { nombre: string | null; telefono: string | null; direccion: string | null; corregimiento: string | null } | null;
  /** El estado de entrega de los otros pedidos del mismo cliente en la tienda. */
  anteriores: (string | null)[];
  /** Entregados y devueltos de la tienda (despachados que ya cerraron), últimos 180 días. */
  tienda: { entregados: number; devueltos: number };
  /** Lo mismo en el corregimiento del cliente; null sin corregimiento. */
  zona: { entregados: number; devueltos: number } | null;
  /** Quién entregó más en ese corregimiento (Monday) y cuántos; null si nadie. */
  repartidor: { nombre: string; entregas: number } | null;
  /** Servientrega en la tienda: guías entregadas y devueltas. */
  servientrega: { entregadas: number; devueltas: number };
  /** El chat del cliente en el CRM: si existe y cuándo escribió por última vez el cliente. */
  whatsapp: { existe: boolean; ultimoDelCliente: string | null };
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

/** Las reglas del asistente sobre lo registrado. */
export function evaluarAsistente(d: DatosAsistente): Asistente {
  const entregados = d.anteriores.filter((e) => e === "entregada").length;
  const devueltos = d.anteriores.filter((e) => e === "devuelta").length;
  const cancelados = d.anteriores.filter((e) => e === "cancelada" || e === "no_gestionada").length;
  const r = riesgoCliente({ entregadas: entregados, devueltas: devueltos, canceladas: cancelados, fallidas: 0 });
  const riesgo: Asistente["riesgo"] = r === "alto" ? "alto" : r === "medio" ? "medio" : "bajo";
  const pTienda = pct(d.tienda.entregados, d.tienda.entregados + d.tienda.devueltos);
  const zonaTotal = d.zona ? d.zona.entregados + d.zona.devueltos : 0;
  const pZona = d.zona ? pct(d.zona.entregados, zonaTotal) : null;
  const zonaFloja = pZona !== null && pTienda !== null && zonaTotal >= 5 && pZona < pTienda - 10;
  const zonaEtiqueta = zonaDeEtiquetas(d.etiquetas);
  const corr = d.cliente?.corregimiento?.trim() || null;
  const yaSalio = d.fase === "despachada" || d.fase === "entregada" || d.fase === "devuelta";

  // 1 · Riesgo del cliente y de la zona
  const r1: LineaAsistente[] = [];
  r1.push({
    nivel: riesgo === "alto" ? "mal" : riesgo === "medio" ? "aviso" : "bien",
    texto: d.anteriores.length
      ? `Riesgo ${riesgo}: ${d.anteriores.length} ${d.anteriores.length === 1 ? "pedido antes" : "pedidos antes"} · ${entregados} ${entregados === 1 ? "entregado" : "entregados"} · ${devueltos} ${devueltos === 1 ? "devuelto" : "devueltos"} · ${cancelados} ${cancelados === 1 ? "cancelado" : "cancelados"}`
      : "Riesgo bajo: cliente nuevo en la tienda (sin pedidos antes con este teléfono)",
  });
  if (pTienda !== null) r1.push({ nivel: "gris", texto: `La tienda entrega el ${pTienda} % de lo despachado (${d.tienda.entregados} de ${d.tienda.entregados + d.tienda.devueltos}, últimos 6 meses)` });
  if (corr && d.zona && zonaTotal > 0)
    r1.push({ nivel: zonaFloja ? "aviso" : "gris", texto: `En ${corr} se entrega el ${pZona} %: ${d.zona.entregados} de ${zonaTotal} despachados${zonaFloja ? " (menos que la tienda)" : ""}` });
  else if (corr) r1.push({ nivel: "gris", texto: `En ${corr} todavía no hay pedidos despachados para comparar` });
  // Las recomendaciones son para antes de despachar: en un pedido que ya salió o se canceló no se dicen.
  if (yaSalio || d.fase === "cancelada") {
    /* nada que recomendar */
  } else if (riesgo === "alto") r1.push({ nivel: "mal", texto: "No despachar sin confirmación expresa del cliente: más pedidos le volvieron o se cancelaron que los que recibió." });
  else if (riesgo === "medio" || zonaFloja) r1.push({ nivel: "aviso", texto: "Llamar antes de despachar: confirmar la dirección y que va a estar para recibir." });

  // 2 · Dirección
  const r2: LineaAsistente[] = [];
  const dir = d.cliente?.direccion?.trim() ?? "";
  const tel = (d.cliente?.telefono ?? "").replace(/\D/g, "");
  r2.push(zonaEtiqueta ? { nivel: "bien", texto: `Zona: ${zonaEtiqueta} (por la etiqueta del pedido)` } : { nivel: "aviso", texto: "Sin etiqueta de zona (CIUDAD o INTERIOR): no se sabe cómo se envía" });
  r2.push(corr ? { nivel: "bien", texto: `Corregimiento: ${corr}` } : { nivel: "aviso", texto: "Falta el corregimiento" });
  if (!dir) r2.push({ nivel: "mal", texto: "Falta la dirección exacta" });
  else if (dir.length < 20) r2.push({ nivel: "aviso", texto: `La dirección es muy corta («${dir}»): pedir una referencia` });
  else r2.push({ nivel: "bien", texto: /frente|cerca|al lado|diagonal|contiguo|detr[aá]s|esquina|entrada|casa|edificio|apto|piso|local/i.test(dir) ? "Dirección completa, con referencia" : "Dirección completa (sin punto de referencia claro)" });
  if (!tel) r2.push({ nivel: "mal", texto: "Falta el teléfono" });
  else if (tel.length < 7) r2.push({ nivel: "aviso", texto: "El teléfono parece incompleto" });

  // 3 · Transportadora
  const r3: LineaAsistente[] = [];
  if (zonaEtiqueta === "Interior") {
    const tot = d.servientrega.entregadas + d.servientrega.devueltas;
    r3.push({ nivel: "bien", texto: `Enviar con Servientrega${tot ? `: entregó ${d.servientrega.entregadas} de ${tot} guías de la tienda (${pct(d.servientrega.entregadas, tot)} %)` : ""}` });
  } else if (zonaEtiqueta === "Ciudad") {
    r3.push(
      d.repartidor
        ? { nivel: "bien", texto: `Enviar con ${d.repartidor.nombre}: es quien más entrega en ${corr} (${d.repartidor.entregas} según Monday)` }
        : { nivel: "gris", texto: `Repartidor de ciudad: en Monday no hay entregas registradas${corr ? ` en ${corr}` : ""} para sugerir uno` },
    );
  } else r3.push({ nivel: "gris", texto: "Sin zona no se puede sugerir con quién enviar" });

  // 4 · Pedido y conversación
  const r4: LineaAsistente[] = [];
  const etiquetas = etiquetasDe(d.etiquetas);
  const confirmado = (d.fase && d.fase !== "por_confirmar" && d.fase !== "cancelada") || etiquetas.some((e) => /^confirmad[ao]$/i.test(e));
  if (d.fase === "cancelada") r4.push({ nivel: "mal", texto: "Pedido cancelado" });
  else if (confirmado) r4.push({ nivel: "bien", texto: "Confirmado (etiqueta «Confirmada» en Shopify o ya salió)" });
  else if (enGestion(etiquetas)) r4.push({ nivel: "aviso", texto: `En gestión: ${etiquetas.filter((e) => /pendiente|modificar|contesta|esperando|llamar|datos/i.test(e)).join(", ")}` });
  else r4.push({ nivel: "aviso", texto: "El cliente todavía no ha confirmado el pedido" });
  r4.push(
    d.whatsapp.existe
      ? { nivel: "bien", texto: d.whatsapp.ultimoDelCliente ? `Escribió por WhatsApp (último mensaje suyo: ${d.whatsapp.ultimoDelCliente.slice(0, 10)})` : "Tiene chat de WhatsApp, pero no ha escrito él" }
      : { nivel: "gris", texto: "No ha escrito por WhatsApp a ningún número del sistema" },
  );

  const peor = (ls: LineaAsistente[]): Nivel => (ls.some((l) => l.nivel === "mal") ? "mal" : ls.some((l) => l.nivel === "aviso") ? "aviso" : ls.some((l) => l.nivel === "bien") ? "bien" : "gris");
  const resumen =
    d.fase === "cancelada"
      ? "Pedido cancelado: no hay nada que decidir."
      : yaSalio
        ? "Ya salió: no hay nada que decidir."
        : !confirmado
          ? "Falta que el cliente confirme antes de preparar el pedido."
          : riesgo === "alto"
            ? "Confirmado, pero con riesgo alto: llamar antes de despachar."
            : "Confirmado: listo para preparar.";
  return {
    riesgo,
    partes: [
      { titulo: "Riesgo del cliente y de la zona", nivel: peor(r1), lineas: r1 },
      { titulo: "Dirección", nivel: peor(r2), lineas: r2 },
      { titulo: "Transportadora", nivel: peor(r3), lineas: r3 },
      { titulo: "Pedido y conversación", nivel: peor(r4), lineas: r4 },
    ],
    resumen,
  };
}

/** Lo que el asistente necesita leer de la base para una orden de la unidad `unidadId`. Si una lectura falla, esa parte queda sin dato. */
export async function datosAsistente(
  supabase: SupabaseClient,
  unidadId: string,
  base: Pick<DatosAsistente, "fase" | "etiquetas" | "cliente" | "anteriores" | "whatsapp">,
): Promise<DatosAsistente> {
  const desde = new Date(Date.now() - 180 * 86_400_000).toISOString().slice(0, 10);
  const contar = async (fase: string) => {
    const { count } = await supabase.from("ven_ordenes").select("id", { count: "exact", head: true }).eq("unidad_id", unidadId).eq("fase", fase).gte("fecha", desde);
    return count ?? 0;
  };
  const corr = base.cliente?.corregimiento?.trim() || null;
  const [entregados, devueltos, zonaFilas, guias] = await Promise.all([
    contar("entregada"),
    contar("devuelta"),
    corr
      ? supabase
          .from("ven_ordenes_clientes")
          .select("orden_id, ven_ordenes!inner(fase, unidad_id, fecha)")
          .ilike("corregimiento", corr)
          .eq("ven_ordenes.unidad_id", unidadId)
          .gte("ven_ordenes.fecha", desde)
          .limit(3000)
          .then((r) => (r.error ? [] : (r.data ?? [])))
      : Promise.resolve([]),
    supabase
      .from("tienda_guias")
      .select("estado_grupo, ven_ordenes!inner(unidad_id)")
      .eq("ven_ordenes.unidad_id", unidadId)
      .in("estado_grupo", ["entregado", "devuelto"])
      .limit(5000)
      .then((r) => (r.error ? [] : (r.data ?? []))),
  ]);
  const faseDe = (x: { ven_ordenes: unknown }) => {
    const v = (Array.isArray(x.ven_ordenes) ? x.ven_ordenes[0] : x.ven_ordenes) as { fase: string | null } | null;
    return v?.fase ?? null;
  };
  const zona = corr ? { entregados: zonaFilas.filter((x) => faseDe(x) === "entregada").length, devueltos: zonaFilas.filter((x) => faseDe(x) === "devuelta").length } : null;
  // Quién entregó más en ese corregimiento según Monday.
  let repartidor: DatosAsistente["repartidor"] = null;
  const idsEntregados = zonaFilas.filter((x) => faseDe(x) === "entregada").map((x) => String(x.orden_id));
  if (idsEntregados.length) {
    const cuenta = new Map<string, number>();
    for (let i = 0; i < idsEntregados.length; i += 200) {
      const { data } = await supabase.from("mon_despachos").select("courier").in("orden_id", idsEntregados.slice(i, i + 200)).eq("estado_grupo", "entregado");
      for (const m of data ?? []) {
        const nombre = String(m.courier ?? "").replace(/\s+/g, " ").trim();
        if (nombre) cuenta.set(nombre, (cuenta.get(nombre) ?? 0) + 1);
      }
    }
    const top = [...cuenta].sort((a, b) => b[1] - a[1])[0];
    if (top) repartidor = { nombre: top[0], entregas: top[1] };
  }
  return {
    ...base,
    tienda: { entregados, devueltos },
    zona,
    repartidor,
    servientrega: { entregadas: guias.filter((g) => g.estado_grupo === "entregado").length, devueltas: guias.filter((g) => g.estado_grupo === "devuelto").length },
  };
}
