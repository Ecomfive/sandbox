// Monday › «CAMBIOS Y REEMBOLSOS PANAMA» (14 nov 2026, pedido de Hernán: «todo lo que son etiquetas, devoluciones, cambios, reembolsos debe salir
// actualizado en el sistema para que todo esté alineado»). Es un solo tablero para todas las tiendas: cada ítem es un caso («KENKU: Realizar cambio
// #24391», «Nuvo: Realizar reembolso #43292») y el detalle va en el primer comentario del ítem (RETIRAR, ENVIAR/ENTREGAR, REEMBOLSAR, MOTIVO…); las
// columnas de montos casi siempre están vacías. La tarea `monday` lo lee después de los tableros de repartidores (`mon_tableros_extra` con
// clase «postventa», migración 0290) y guarda cada caso en `mon_postventa`, enlazado a su pedido por tienda y número.
//
// Del comentario solo se guardan los datos del caso, por su rótulo. Nunca se guardan el nombre, la cuenta bancaria, el banco, el correo, la dirección
// ni el teléfono que el equipo escribe para hacer el reembolso; además, en todo lo guardado los números largos (7 cifras o más) se tapan.
//
// Cada lectura trae los ítems actualizados desde la última lectura y, además, los creados en los últimos 60 días (un comentario nuevo no siempre
// cambia la «última actualización» del ítem). La primera vez, los creados desde el 1 de abril de 2026 (las órdenes del sistema empiezan ahí).

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizar } from "../finanzas/clasificacion";
import { unidadDeTienda } from "../ventas/matriz";
import { enlazarOrden, type OrdenCandidata, type UnidadSimple, unidadDeTexto, variantesPedido } from "./columnas";
import { consultarMonday, mondayConfigurado } from "./sincronizar";

export const TIPOS_POSTVENTA = ["cambio", "reembolso", "retiro", "complemento", "faltante", "garantia", "envio"] as const;
export type TipoPostventa = (typeof TIPOS_POSTVENTA)[number];

/** Desde cuándo se lee la primera vez (las órdenes del sistema empiezan el 1 de abril de 2026). */
export const POSTVENTA_DESDE = "2026-04-01";
/** Los días hacia atrás que se releen siempre, por si un caso recibió un comentario sin cambiar su «última actualización». */
export const POSTVENTA_RELEER_DIAS = 60;
const POR_PAGINA = 100;

export interface ItemPostventa {
  id: string;
  name: string;
  created_at: string | null;
  updated_at: string | null;
  grupo: string | null;
  /** La columna «Estado» (En Proceso, Hecho, Estancado, Pagado Enviar al Cliente…). */
  estado: string | null;
  /** «Valor Reembolso» y «Valor de envío», si el equipo los llenó. */
  valorReembolso: string | null;
  valorEnvio: string | null;
  /** Los comentarios del ítem (texto plano y cuándo), en cualquier orden. */
  comentarios: { creado: string; texto: string }[];
}

export interface CasoPostventa {
  item_id: string;
  nombre: string;
  tienda_texto: string | null;
  numero_pedido: string | null;
  tipos: TipoPostventa[];
  estado: string | null;
  grupo: string | null;
  retirar: string | null;
  enviar: string | null;
  reembolso: number | null;
  reembolso_texto: string | null;
  penalizacion: string | null;
  costo_envio: string | null;
  motivo: string | null;
  observacion: string | null;
  ultima_nota: string | null;
  notas: number;
  creado_monday: string | null;
  actualizado_monday: string | null;
}

const corto = (v: string | null | undefined, n: number): string | null => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t ? t.slice(0, n) : null;
};

/** Tapa lo que puede ser una cuenta, un teléfono o un correo: números de 7 cifras o más (con espacios o guiones en medio) y direcciones de correo. Los
 * números de pedido tienen hasta 6 cifras (Oferfy #146665) y quedan a la vista; un teléfono (8) o una cuenta (10 o más) no. */
export function taparDatos(texto: string): string {
  return texto.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "•••").replace(/\+?\d(?:[\s-]?\d){6,}/g, "•••");
}

/** La tienda escrita en el nombre o el comentario del caso («KENKU», «Oferfy», «ClickSI»…), con el nombre con que se busca la unidad. */
export function tiendaDeTexto(texto: string | null | undefined): string | null {
  const n = normalizar(texto ?? "");
  if (/\bKENK/.test(n)) return "KENKU";
  if (/\bOFER?T?FY\b|\bOFERFY/.test(n)) return "OFERFY";
  if (/\bNUVO\b/.test(n)) return "NUVO";
  if (/\bCLICK ?SI\b/.test(n) || /\bCS ?\d{3,6}\b/.test(n)) return "CLICKSI";
  if (/\bCALZADOS?\b/.test(n)) return "CALZADOS O";
  return null;
}

/** El número de pedido escrito en el texto: «#24391», «# CS15309», «CS16077» o, sin «#», un número de 4 a 7 cifras. */
export function numeroDeTexto(texto: string | null | undefined): string | null {
  const t = (texto ?? "").toUpperCase();
  const m = t.match(/#\s*(CS\s*\d{3,6}|\d{3,7})\b/) ?? t.match(/\b(CS\s*\d{3,6})\b/) ?? t.match(/(?:^|[^\d.,$])(\d{4,7})(?![\d.,$])/);
  return m ? `#${m[1].replace(/\s+/g, "")}` : null;
}

/** Qué se hace en el caso, por las palabras del nombre (y de la primera línea del comentario). */
export function tiposDeTexto(texto: string | null | undefined): TipoPostventa[] {
  const n = normalizar(texto ?? "");
  const t: TipoPostventa[] = [];
  if (/CAMBIO/.test(n)) t.push("cambio");
  if (/RE?E?M?BOLS|REMBOLS|DEVOLUCION DE DINERO/.test(n)) t.push("reembolso");
  if (/RETIR/.test(n)) t.push("retiro");
  if (/COMPLEMENT/.test(n)) t.push("complemento");
  if (/FALTANTE/.test(n)) t.push("faltante");
  if (/GARANT/.test(n)) t.push("garantia");
  if (!t.length && /\bENVI|REENVI/.test(n)) t.push("envio");
  return t;
}

type Rotulo = "retirar" | "enviar" | "envio" | "reembolso" | "penalizacion" | "costo_envio" | "motivo" | "observacion";
/** Los rótulos del comentario que se guardan (normalizados, sin «✅» ni signos). Cualquier otro rótulo se ignora (NOMBRE, N CUENTA, BANCO, CORREO…). */
const ROTULOS: Record<string, Rotulo> = {
  RETIRAR: "retirar",
  RETIRO: "retirar",
  ENVIAR: "enviar",
  ENTREGAR: "enviar",
  ENVIO: "envio",
  REEMBOLSAR: "reembolso",
  "MONTO A REEMBOLSAR": "reembolso",
  "TOTAL A REEMBOLSAR": "reembolso",
  "MONTO DEL REEMBOLSO": "reembolso",
  PENALIZACION: "penalizacion",
  "COSTO DEL ENVIO": "costo_envio",
  "COSTO DE ENVIO": "costo_envio",
  MOTIVO: "motivo",
  OBSERVACION: "observacion",
  OBSERVACIONES: "observacion",
  NOTA: "observacion",
};

/** Un monto en dólares escrito a mano («$34,99», «58.99$», «32,90 se le descuenta 6.50…, quedaría un Total a reembolsar de 26,40»). */
export function montoDeTexto(texto: string | null | undefined): number | null {
  const original = (texto ?? "").replace(/\s+/g, " ");
  // Lo que queda después de descontar el retiro o la penalización: «quedaría en 24,91$», «quedaría un Total a reembolsar de 26,40».
  const total = original.match(/total\s+a\s+reembols\w*[^\d]{0,15}(\d{1,5}(?:[.,]\d{1,2})?)/i) ?? original.match(/qued\S*\s+(?:en\s+)?[^\d]{0,25}?(\d{1,5}(?:[.,]\d{1,2})?)/i);
  const m = total ?? original.match(/(\d{1,5}(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const v = Number(m[1].replace(",", "."));
  return Number.isFinite(v) && v > 0 && v < 100_000 ? Math.round(v * 100) / 100 : null;
}

/** Los datos del caso que trae el primer comentario, por su rótulo (el valor en la misma línea o, si está vacío, en la siguiente). */
export function datosDeComentario(texto: string | null | undefined): Partial<Record<Rotulo, string>> {
  const lineas = (texto ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const salida: Partial<Record<Rotulo, string>> = {};
  for (let i = 0; i < lineas.length; i++) {
    // «MOTIVO: …», y también sin los dos puntos cuando sigue un monto («MONTO A REEMBOLSAR $32.90»).
    const m = lineas[i].match(/^[^\p{L}\d]*([\p{L} ]{3,30}?)\s*(?::|(?=\$\s*\d|\d))\s*(.*)$/u);
    if (!m) continue;
    let rotulo = ROTULOS[normalizar(m[1]).replace(/\s+/g, " ").trim()];
    if (!rotulo) continue;
    let valor = m[2].trim();
    if (!valor && lineas[i + 1] && !/^[^\p{L}\d]*[\p{L} ]{3,30}:/u.test(lineas[i + 1])) valor = lineas[i + 1];
    // El monto a reembolsar a veces sigue en la línea de abajo («…del ⏎ producto, quedaría en 24,91$»).
    else if (rotulo === "reembolso" && lineas[i + 1] && !/^[^\p{L}\d]*[\p{L} ]{3,30}:/u.test(lineas[i + 1]) && /qued|total/i.test(lineas[i + 1])) valor = `${valor} ${lineas[i + 1]}`;
    // «RETIRO: costeado por el cliente» habla de quién paga el retiro, no de qué se retira.
    if (rotulo === "retirar" && /costead/i.test(valor) && !/\d\s*x|x\s*\d|unidad/i.test(valor)) {
      rotulo = "costo_envio";
      valor = `Retiro ${valor.replace(/^[^\p{L}\d$#]+/u, "")}`;
    }
    if (salida[rotulo]) continue;
    const limpio = corto(taparDatos(valor.replace(/^[^\p{L}\d$#]+/u, "")), 300);
    if (limpio) salida[rotulo] = limpio;
  }
  return salida;
}

/** El caso a partir del ítem de Monday (pura). */
export function casoDeItem(item: ItemPostventa): CasoPostventa {
  const comentarios = [...item.comentarios].sort((a, b) => a.creado.localeCompare(b.creado));
  const primero = comentarios[0]?.texto ?? "";
  const datos = datosDeComentario(primero);
  // «ENVIO:» trae a veces el producto que se envía y a veces lo que cuesta el envío («Costeado por la empresa. 3.5$»).
  if (datos.envio) {
    if (/costead|\$|\d+[.,]\d+/i.test(datos.envio) && !/unidad|\bx\s*\d|\d\s*x\b/i.test(datos.envio)) datos.costo_envio = [datos.envio, datos.costo_envio].filter(Boolean).join(" · ");
    else datos.enviar ??= datos.envio;
  }
  const encabezado = primero.split(/\r?\n/).slice(0, 4).join(" ");
  const tipos = tiposDeTexto(item.name);
  for (const t of tiposDeTexto(encabezado)) if (!tipos.includes(t)) tipos.push(t);
  if (datos.retirar && !tipos.includes("retiro")) tipos.push("retiro");
  const valorReembolso = montoDeTexto(item.valorReembolso);
  const ultimo = comentarios.length > 1 ? comentarios[comentarios.length - 1] : null;
  return {
    item_id: item.id,
    nombre: corto(taparDatos(item.name), 200) ?? item.id,
    tienda_texto: tiendaDeTexto(item.name) ?? tiendaDeTexto(encabezado),
    numero_pedido: numeroDeTexto(item.name) ?? numeroDeTexto(encabezado),
    tipos,
    estado: corto(item.estado, 80),
    grupo: corto(item.grupo, 120),
    retirar: datos.retirar ?? null,
    enviar: datos.enviar ?? null,
    reembolso: valorReembolso ?? montoDeTexto(datos.reembolso),
    reembolso_texto: datos.reembolso ?? null,
    penalizacion: datos.penalizacion ?? null,
    costo_envio: datos.costo_envio ?? corto(item.valorEnvio, 40),
    motivo: datos.motivo ?? null,
    observacion: datos.observacion ?? null,
    ultima_nota: ultimo ? corto(taparDatos(ultimo.texto), 300) : null,
    notas: comentarios.length,
    creado_monday: item.created_at,
    actualizado_monday: item.updated_at,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------------------------------------------------
const CAMPOS = "id name created_at updated_at group { title } column_values { id text type } updates(limit: 15) { created_at text_body }";

/** La consulta de la primera página: los actualizados desde `desde` (un día antes) o creados en los últimos días; sin `desde`, los creados desde abril. */
export function consultaPostventa(desde: string | null, hoy: string): string {
  const dia = (iso: string, menos: number) => new Date(Date.parse(iso.slice(0, 10) + "T00:00:00Z") - menos * 86_400_000).toISOString().slice(0, 10);
  const creados = desde ? dia(hoy, POSTVENTA_RELEER_DIAS) : POSTVENTA_DESDE;
  const reglaCreado = `{ column_id: "__creation_log__", compare_value: ["EXACT", "${creados}"], operator: greater_than_or_equals }`;
  const reglas = desde
    ? `operator: or, rules: [{ column_id: "__last_updated__", compare_value: ["EXACT", "${dia(desde, 1)}"], operator: greater_than_or_equals, compare_attribute: "UPDATED_AT" }, ${reglaCreado}]`
    : `rules: [${reglaCreado}]`;
  return `query ($ids: [ID!], $limit: Int!) { boards(ids: $ids) { items_page(limit: $limit, query_params: { ${reglas} }) { cursor items { ${CAMPOS} } } } }`;
}
const CONSULTA_SIGUIENTE_POSTVENTA = `query ($cursor: String!, $limit: Int!) { next_items_page(cursor: $cursor, limit: $limit) { cursor items { ${CAMPOS} } } }`;

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Los ítems y el cursor de una página de respuesta (pura). Las columnas se reconocen por su título en el tablero: Estado, Valor Reembolso, Valor de envío. */
export function leerPaginaPostventa(respuesta: unknown, columnas: { estado?: string; reembolso?: string; envio?: string }): { cursor: string | null; items: ItemPostventa[] } {
  const d = obj(obj(respuesta).data);
  const pagina = d.next_items_page ? obj(d.next_items_page) : obj(obj(arr(d.boards)[0]).items_page);
  const items = arr(pagina.items)
    .map(obj)
    .filter((i) => typeof i.id === "string" || typeof i.id === "number")
    .map((i) => {
      const valores = new Map(arr(i.column_values).map(obj).map((c) => [String(c.id ?? ""), texto(c.text)]));
      return {
        id: String(i.id),
        name: String(i.name ?? ""),
        created_at: texto(i.created_at),
        updated_at: texto(i.updated_at),
        grupo: texto(obj(i.group).title),
        estado: columnas.estado ? (valores.get(columnas.estado) ?? null) : null,
        valorReembolso: columnas.reembolso ? (valores.get(columnas.reembolso) ?? null) : null,
        valorEnvio: columnas.envio ? (valores.get(columnas.envio) ?? null) : null,
        comentarios: arr(i.updates)
          .map(obj)
          .map((u) => ({ creado: texto(u.created_at) ?? "", texto: texto(u.text_body) ?? "" }))
          .filter((u) => u.texto.trim()),
      };
    });
  return { cursor: typeof pagina.cursor === "string" && pagina.cursor ? pagina.cursor : null, items };
}

/** Las columnas del tablero que se usan, por su título (pura): la primera «Estado» de tipo estado, «Valor Reembolso» y «Valor de envío». */
export function columnasPostventa(columnas: { id: string; titulo: string; tipo: string }[]): { estado?: string; reembolso?: string; envio?: string } {
  const por = (re: RegExp, tipo?: string) => columnas.find((c) => re.test(normalizar(c.titulo)) && (!tipo || c.tipo === tipo))?.id;
  return { estado: por(/^ESTADO$/, "status") ?? por(/^ESTADO$/), reembolso: por(/VALOR REEMBOLSO/), envio: por(/VALOR DE ENVIO/) };
}

async function guardarCasos(supabase: SupabaseClient, tableroId: string, casos: CasoPostventa[], unidades: UnidadSimple[]): Promise<{ guardados: number; enlazados: number }> {
  if (!casos.length) return { guardados: 0, enlazados: 0 };
  const variantes = [...new Set(casos.flatMap((c) => variantesPedido(c.numero_pedido)))];
  const candidatas: OrdenCandidata[] = [];
  for (let i = 0; i < variantes.length; i += 200) {
    const { data, error } = await supabase.from("ven_ordenes").select("id, unidad_id, numero, periodo").in("numero", variantes.slice(i, i + 200));
    if (error) throw new Error(`ven_ordenes: ${error.message}`);
    for (const o of data ?? []) candidatas.push({ id: o.id as string, unidad_id: o.unidad_id as string, numero: o.numero as string, periodo: String(o.periodo).slice(0, 10) });
  }
  const ahora = new Date().toISOString();
  let enlazados = 0;
  const filas = casos.map((c) => {
    const unidad = unidadDeTexto(c.tienda_texto, unidades, unidadDeTienda);
    // Sin la tienda en el texto, solo se enlaza si el número es de un único pedido.
    const orden = enlazarOrden(c.numero_pedido, unidad, candidatas);
    if (orden) enlazados++;
    return { ...c, tablero_id: tableroId, unidad_id: unidad ?? orden?.unidad_id ?? null, orden_id: orden?.id ?? null, leido_en: ahora };
  });
  for (let i = 0; i < filas.length; i += 200) {
    const { error } = await supabase.from("mon_postventa").upsert(filas.slice(i, i + 200), { onConflict: "item_id" });
    if (error) throw new Error(`mon_postventa: ${error.message}`);
  }
  return { guardados: filas.length, enlazados };
}

/** Lee los tableros de cambios y reembolsos (clase «postventa») antes de `limite`. Sin la migración 0290 o sin tableros, no hace nada. */
export async function sincronizarPostventa(supabase: SupabaseClient, limite: number): Promise<string> {
  if (!mondayConfigurado()) return "";
  const { data: tableros, error } = await supabase.from("mon_tableros_extra").select("tablero_id, nombre, cursor_actualizado").eq("activo", true).eq("clase", "postventa");
  if (error || !tableros?.length) return "";
  const { data: unidadesData } = await supabase.from("fin_unidades").select("id, nombre");
  const unidades = (unidadesData ?? []) as UnidadSimple[];
  const hoy = new Date().toISOString().slice(0, 10);
  const hechos: string[] = [];
  for (const t of tableros as { tablero_id: string; nombre: string; cursor_actualizado: string | null }[]) {
    if (Date.now() > limite) break;
    try {
      const cols = obj(arr(obj(obj(await consultarMonday("query ($ids: [ID!]) { boards(ids: $ids) { columns { id title type } } }", { ids: [t.tablero_id] })).data).boards)[0]);
      const columnas = columnasPostventa(arr(cols.columns).map(obj).map((c) => ({ id: String(c.id ?? ""), titulo: String(c.title ?? ""), tipo: String(c.type ?? "") })));
      let cursor: string | null = null;
      let primera = true;
      let maximo: string | null = null;
      let leidos = 0;
      let guardados = 0;
      let enlazados = 0;
      while (primera || cursor) {
        if (!primera && Date.now() > limite) break;
        const json = primera ? await consultarMonday(consultaPostventa(t.cursor_actualizado, hoy), { ids: [t.tablero_id], limit: POR_PAGINA }) : await consultarMonday(CONSULTA_SIGUIENTE_POSTVENTA, { cursor, limit: POR_PAGINA });
        primera = false;
        const pagina = leerPaginaPostventa(json, columnas);
        const r = await guardarCasos(supabase, t.tablero_id, pagina.items.map(casoDeItem), unidades);
        guardados += r.guardados;
        enlazados += r.enlazados;
        leidos += pagina.items.length;
        const max = pagina.items.map((i) => i.updated_at ?? "").filter(Boolean).sort().at(-1) ?? null;
        if (max && (!maximo || max > maximo)) maximo = max;
        cursor = pagina.cursor;
      }
      if (cursor) {
        hechos.push(`${t.nombre}: ${guardados} guardados, sigue en la próxima`);
        continue;
      }
      const { count } = await supabase.from("mon_postventa").select("item_id", { count: "exact", head: true }).eq("tablero_id", t.tablero_id);
      await supabase
        .from("mon_tableros_extra")
        .update({ cursor_actualizado: maximo ?? t.cursor_actualizado ?? new Date().toISOString(), items: count ?? leidos, ultima_lectura: new Date().toISOString(), ultimo_error: null })
        .eq("tablero_id", t.tablero_id);
      hechos.push(`${t.nombre}: ${leidos} casos leídos, ${enlazados} con su pedido`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "No se pudo leer.";
      await supabase.from("mon_tableros_extra").update({ ultimo_error: msg.slice(0, 1000), ultima_lectura: new Date().toISOString() }).eq("tablero_id", t.tablero_id);
      hechos.push(`${t.nombre}: ${msg}`);
    }
  }
  return hechos.length ? `${hechos.join("; ")}.` : "";
}
