// Trae al sistema lo que se cambió en ClickUp DESPUÉS de la última importación, sin pisar lo que ya se editó aquí.
//
// Para cada compra compara tres versiones de cada dato: cómo estaba en ClickUp al importarla (la tarea guardada en
// `wms_compras.clickup`), cómo está hoy en ClickUp (datos-privados/clickup-compras.json, lo baja clickup-exportar-compras.mjs)
// y cómo está en el sistema. Si cambió en ClickUp y aquí sigue igual que antes, se trae; si también se cambió aquí con otro
// valor, NO se toca y se informa como conflicto. Cada dato traído queda en la Actividad de la compra. Las tareas nuevas de
// ClickUp se crean (con su código ECOM si no traen uno en el nombre). Comentarios, subtareas, adjuntos e historial de estados
// nuevos se agregan sin borrar nada.
//
//   npx tsx scripts/sincronizar-cambios-clickup.ts            → informe (no escribe nada)
//   npx tsx scripts/sincronizar-cambios-clickup.ts --aplicar  → aplica

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { CAMPOS_EDITABLES, textoDeValor } from "../src/app/(app)/compras/def-edicion-compras";

const aplicar = process.argv.includes("--aplicar");
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// --- Lectura de una tarea de ClickUp (igual que importar-compras-clickup.ts) -------------------------------------------
const REASIGNAR: Record<string, string> = {
  "zeylimar moreno": "Francis Aponte",
  "maria jose aponte": "Francis Aponte",
  "maría josé aponte": "Francis Aponte",
  "fabiola concha": "Francis Aponte",
  "andreina andrade de morales": "Francis Aponte",
};
const normalizarCodigos = (t: string) => t.replace(/\bECOM-(\d)/g, "ECOM01-$1").replace(/\bCOM02-(\d)/g, "ECOM02-$1");
const normal = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const ESTADOS: Record<string, string> = {
  backlog: "backlog",
  pendiente: "pendiente",
  "en gestion": "en_gestion",
  hecho: "hecho",
  "en revision": "en_revision",
  aprobado: "aprobado",
  rechazado: "rechazado",
  completado: "completado",
};
// La Etapa de ClickUp por su número (la numeración de ClickUp, con «01 - Solicitud Local»).
const ETAPA_POR_NUMERO: Record<string, string> = {
  "01": "solicitud_local",
  "02": "solicitud_internacional",
  "03": "cotizar",
  "04": "cotizado",
  "05": "evaluacion_proveedor",
  "06": "solicitud_proveedor",
  "07": "compra_pago",
  "08": "produccion",
  "09": "tracking",
  "10": "aviso_logistica",
  "11": "arribo_mercancia",
  "12": "completado",
};
const mapEstado = (s: string | undefined) => ESTADOS[normal(s ?? "")] ?? "backlog";
function mapEtapa(nombre: string | null): string {
  if (!nombre) return "backlog";
  const n = normal(nombre);
  if (n.startsWith("backlog")) return "backlog";
  if (n.startsWith("descartado")) return "descartado";
  const m = n.match(/^(\d{2})/);
  return (m && ETAPA_POR_NUMERO[m[1]]) || "backlog";
}
function campo(t: Json, nombre: string, tipo?: string): Json | null {
  const conValor = (x: Json) => !(x.value === undefined || x.value === null || x.value === "" || (Array.isArray(x.value) && x.value.length === 0));
  const candidatos = (t.custom_fields ?? []).filter((x: Json) => normal(String(x.name).replace(/[^\p{L}\p{N} ()]/gu, "")) === normal(nombre) && (!tipo || x.type === tipo));
  const conEmoji = (x: Json) => (/^[\p{L}\p{N}]/u.test(String(x.name).trim()) ? 1 : 0);
  return [...candidatos].sort((a, b) => conEmoji(a) - conEmoji(b)).find(conValor) ?? null;
}
function texto(t: Json, nombre: string, tipo?: string): string | null {
  const c = campo(t, nombre, tipo);
  if (!c) return null;
  const opciones = c.type_config?.options ?? [];
  if (c.type === "drop_down") return opciones.find((o: Json) => o.orderindex === c.value || o.id === c.value)?.name ?? null;
  return String(c.value).trim() || null;
}
function etiquetasDe(t: Json, nombre: string): string[] {
  const c = campo(t, nombre, "labels");
  if (!c) return [];
  const opciones = c.type_config?.options ?? [];
  return (c.value as string[]).map((id) => String(opciones.find((o: Json) => o.id === id)?.label ?? id).trim());
}
function numero(t: Json, nombre: string): number | null {
  const c = campo(t, nombre);
  if (!c) return null;
  const n = Number(c.value);
  return Number.isFinite(n) ? n : null;
}
const casilla = (t: Json, nombre: string) => {
  const c = campo(t, nombre, "checkbox");
  return !!c && (c.value === true || c.value === "true");
};
const dia = (ms: unknown): string | null => (ms ? new Date(Number(ms)).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) : null);
const fechaCampo = (t: Json, nombre: string) => dia(campo(t, nombre, "date")?.value);
const iso = (ms: unknown): string | null => (ms ? new Date(Number(ms)).toISOString() : null);
function via(t: Json): string[] {
  const vias = etiquetasDe(t, "Shipping").map((l): string | null => {
    const n = normal(l);
    return n.includes("air") ? "aire" : n.includes("sea") ? "mar" : n.includes("truck") ? "tierra" : null;
  });
  return [...new Set(vias)].filter((x): x is string => !!x);
}

/**
 * Los campos de ClickUp que ya no son columnas (migración 0083: su dato pasó a un comentario). Si en ClickUp se cambia uno,
 * el valor nuevo llega como comentario «Track ID: …», igual que hizo la migración.
 */
const EN_COMENTARIO: { titulo: string; leer: (t: Json) => string | null }[] = [
  { titulo: "Cliente", leer: (t) => texto(t, "Cliente") },
  { titulo: "Track ID", leer: (t) => texto(t, "Track ID") },
  { titulo: "Orden", leer: (t) => texto(t, "Orden") },
  { titulo: "Pago Cliente", leer: (t) => texto(t, "Pago Cliente", "drop_down") },
  { titulo: "Cuenta receptora", leer: (t) => texto(t, "Cuenta receptora", "drop_down") },
  ...["Pago Pendiente", "Cobrado Cliente", "Pendiente Cliente"].map((titulo) => ({
    titulo,
    leer: (t: Json) => {
      const n = numero(t, titulo);
      return n ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
    },
  })),
];

/** Los datos de una compra que se sincronizan (columna de `wms_compras` → valor). Sin prioridad, notas, inconveniente ni Revisado AA: ya no se usan. */
function datosDe(t: Json): Json {
  const original = (t.assignees ?? [])[0]?.username ?? null;
  return {
    nombre: normalizarCodigos(String(t.name).trim()) || "(sin nombre)",
    codigo: normalizarCodigos(String(t.name)).match(/\b([A-Z]{2,5}\d{0,2}-\d{3,5})\b/)?.[1] ?? null,
    estado: mapEstado(t.status?.status),
    etapa: mapEtapa(texto(t, "Etapa", "drop_down")),
    proveedor: texto(t, "Proveedor", "drop_down") ?? texto(t, "Proveedor", "short_text"),
    tienda: texto(t, "Tienda", "drop_down"),
    planificacion: texto(t, "Planificación", "drop_down"),
    url_producto: texto(t, "URL", "url"),
    qty_total: numero(t, "QTY Total"),
    monto_total: numero(t, "Monto Total"),
    primer_pago: numero(t, "Primer Pago"),
    segundo_pago: numero(t, "Segundo Pago"),
    pagado_a_proveedor: numero(t, "Pagado a Proveedor"),
    factura: casilla(t, "Factura"),
    financiamiento: casilla(t, "Financiamiento"),
    fecha_pago_1: fechaCampo(t, "Fecha de Pago (1)"),
    fecha_pago_2: fechaCampo(t, "Fecha de Pago (2)"),
    fecha_envio: fechaCampo(t, "Fecha de Envío"),
    fecha_llegada: fechaCampo(t, "Fecha de llegada"),
    fecha_limite: dia(t.due_date),
    via_envio: via(t),
    paises_destino: etiquetasDe(t, "Países").map((p) => p.replace(/[^\p{L} ]/gu, "").trim()),
    etiquetas: (t.tags ?? []).map((x: Json) => String(x.name)),
    responsable_nombre: original ? (REASIGNAR[normal(original)] ?? original) : null,
    descripcion: (t.markdown_description ?? t.text_content ?? "").trim() || null,
  };
}

// Cómo se llama cada columna en la Actividad (la clave de `CAMPOS_EDITABLES`, o un nombre de la ficha).
const PROP_DE_COLUMNA: Record<string, string> = {
  ...Object.fromEntries(Object.entries(CAMPOS_EDITABLES).map(([clave, def]) => [def.columna, clave])),
  nombre: "nombre",
  descripcion: "descripcion",
  url_producto: "urlProducto",
  paises_destino: "paisesDestino",
  codigo: "codigo",
  responsable_nombre: "responsable",
};
const textoSimple = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? (v.length ? v.join(", ") : "—") : String(v));
function textoActividad(columna: string, v: unknown): string {
  const def = CAMPOS_EDITABLES[PROP_DE_COLUMNA[columna]];
  return def ? textoDeValor(def, v) : textoSimple(v);
}
/** Para comparar: listas en orden fijo, números como número, vacío = null. */
function clave(v: unknown): string {
  if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0)) return "null";
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v)) && /^-?\d+(\.\d+)?$/.test(v.trim())) return String(Number(v));
  return JSON.stringify(v);
}

const eventoAutor = (t: Json) => ((t.assignees ?? [])[0]?.username ? `${t.assignees[0].username} (en ClickUp)` : "ClickUp");

async function main() {
  const datos = JSON.parse(readFileSync("datos-privados/clickup-compras.json", "utf8"));
  console.log(`Exportación de ClickUp: ${datos.exportado_en}`);
  const { data: paises } = await supabase.from("paises").select("id, codigo");
  const paisId = new Map((paises ?? []).map((p) => [p.codigo as string, p.id as string]));
  const { data: perfiles } = await supabase.from("perfiles").select("id, nombre");
  const perfilPorNombre = new Map((perfiles ?? []).filter((p) => p.nombre).map((p) => [normal(p.nombre as string), p.id as string]));

  const columnas = Object.keys(datosDe({}));
  const enBase = new Map<string, Json>();
  for (let i = 0; ; i += 500) {
    const { data, error } = await supabase
      .from("wms_compras")
      .select(`id, numero, tipo, clickup_id, clickup, ${columnas.join(", ")}, wms_compra_items(count)`)
      .not("clickup_id", "is", null)
      .order("numero")
      .range(i, i + 499);
    if (error) throw error;
    for (const c of (data ?? []) as unknown as Json[]) enBase.set(c.clickup_id as string, c);
    if ((data ?? []).length < 500) break;
  }

  let traidos = 0;
  const conflictos: string[] = [];
  const cambiosPorCompra: string[] = [];
  const nuevas: { clave: string; lista: Json; t: Json }[] = [];
  const tocadas = new Map<string, string>(); // clickup_id → id de la compra (para comentarios, adjuntos, historial)

  for (const { clave: claveLista, lista, tareas } of datos.listas as { clave: string; lista: Json; tareas: Json[] }[]) {
    if (claveLista === "chat_compras") continue;
    for (const t of tareas.filter((x) => !x.parent)) {
      const fila = enBase.get(t.id);
      if (!fila) {
        nuevas.push({ clave: claveLista, lista, t });
        continue;
      }
      const base = fila.clickup as Json | null;
      if (!base || Number(base.date_updated) >= Number(t.date_updated)) continue; // sin cambios en ClickUp
      tocadas.set(t.id, fila.id);
      const antes = datosDe(base);
      const ahora = datosDe(t);
      const conProductos = (fila.wms_compra_items?.[0]?.count ?? 0) > 0;
      const actualizar: Json = {};
      const eventos: Json[] = [];
      const lineas: string[] = [];
      let n = 0;
      for (const col of columnas) {
        if (clave(antes[col]) === clave(ahora[col])) continue; // no cambió en ClickUp
        if (clave(fila[col]) === clave(ahora[col])) continue; // ya está igual aquí
        if (col === "codigo" && !ahora.codigo) continue; // ClickUp le quitó el código: el ECOM del sistema se queda
        if ((col === "qty_total" || col === "monto_total") && conProductos) {
          conflictos.push(`${fila.codigo ?? fila.numero} · ${col}: en ClickUp ${textoSimple(ahora[col])}, pero la compra tiene productos (se calcula de ellos)`);
          continue;
        }
        if (clave(fila[col]) !== clave(antes[col]) && col !== "codigo") {
          conflictos.push(`${fila.codigo ?? fila.numero} · ${col}: ClickUp ${textoSimple(antes[col])} → ${textoSimple(ahora[col])}, pero aquí ya dice ${textoSimple(fila[col])} (se deja lo del sistema)`);
          continue;
        }
        actualizar[col] = ahora[col];
        lineas.push(`${col}: ${textoSimple(fila[col])} → ${textoSimple(ahora[col])}`);
        const campoEvento = col === "etapa" || col === "estado" ? col : (PROP_DE_COLUMNA[col] ?? col);
        const valorEvento = (v: unknown) => (col === "etapa" || col === "estado" ? ((v as string | null) ?? null) : textoActividad(col, v));
        eventos.push({
          compra_id: fila.id,
          campo: campoEvento,
          valor_antes: valorEvento(fila[col]),
          valor_despues: valorEvento(ahora[col]),
          ocurrido_en: new Date(Number(t.date_updated) + n++).toISOString(),
          autor: eventoAutor(t),
          origen: "clickup_sync",
        });
      }
      const comentariosCampo: Json[] = [];
      for (const c of EN_COMENTARIO) {
        const v = c.leer(t);
        if (v && v !== c.leer(base)) {
          comentariosCampo.push({ compra_id: fila.id, autor: eventoAutor(t), texto: `${c.titulo}: ${v}`, creado_en: new Date(Number(t.date_updated)).toISOString() });
          lineas.push(`${c.titulo} (a comentario): ${v}`);
        }
      }
      if ("responsable_nombre" in actualizar) actualizar.asignado_a = actualizar.responsable_nombre ? (perfilPorNombre.get(normal(actualizar.responsable_nombre)) ?? null) : null;
      if ("etapa" in actualizar) {
        const cerrada = ["completado", "descartado"].includes(actualizar.etapa);
        actualizar.cerrado_en = cerrada ? (iso(t.date_closed) ?? new Date(Number(t.date_updated)).toISOString()) : null;
      }
      if (lineas.length) {
        traidos += lineas.length;
        cambiosPorCompra.push(`${fila.codigo ?? `OC ${fila.numero}`} · ${ahora.nombre.slice(0, 60)}\n    ${lineas.join("\n    ")}`);
      }
      if (!aplicar) continue;
      const { _comentarios, _tiempo_en_estado, ...crudo } = t;
      void _comentarios;
      const { error } = await supabase
        .from("wms_compras")
        .update({ ...actualizar, clickup: { ...crudo, _tiempo_en_estado }, actualizado_en: new Date().toISOString() })
        .eq("id", fila.id);
      if (error) {
        console.error(`✗ ${t.id}: ${error.message}`);
        continue;
      }
      if (eventos.length) await supabase.from("wms_compra_eventos").insert(eventos);
      if (comentariosCampo.length) await supabase.from("wms_compra_comentarios").insert(comentariosCampo);
    }
  }

  // Tareas nuevas en ClickUp.
  const creadas: string[] = [];
  for (const { clave: claveLista, lista, t } of nuevas) {
    const d = datosDe(t);
    const esImportadora = claveLista === "importadora";
    creadas.push(`${lista.name.trim()} · ${d.nombre}${d.codigo ? ` (${d.codigo})` : ""}`);
    if (!aplicar) continue;
    let codigo = d.codigo;
    if (!codigo) {
      const { data } = await supabase.rpc("wms_siguiente_codigo_compra", { p_clave: esImportadora ? "importacion" : claveLista });
      codigo = (data as string | null) ?? null;
    }
    const { _comentarios, _tiempo_en_estado, ...crudo } = t;
    void _comentarios;
    const { data, error } = await supabase
      .from("wms_compras")
      .insert({
        ...d,
        codigo,
        tipo: esImportadora ? "importacion" : "pais",
        pais_id: esImportadora ? null : paisId.get(claveLista),
        clickup_id: t.id,
        clickup_lista: lista.name,
        clickup: { ...crudo, _tiempo_en_estado },
        asignado_a: d.responsable_nombre ? (perfilPorNombre.get(normal(d.responsable_nombre)) ?? null) : null,
        creador_nombre: t.creator?.username ?? null,
        creado_en: iso(t.date_created),
        actualizado_en: iso(t.date_updated),
        cerrado_en: iso(t.date_closed),
        fecha_inicio: dia(t.start_date),
      })
      .select("id")
      .single();
    if (error) {
      console.error(`✗ nueva ${t.id}: ${error.message}`);
      continue;
    }
    tocadas.set(t.id, data.id);
  }

  // Comentarios, subtareas, adjuntos e historial de estados de las compras tocadas (se agregan; nada se borra ni se pisa).
  let comentariosNuevos = 0;
  const yaComentados = new Set<string>();
  if (tocadas.size) {
    const ids = [...tocadas.values()];
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await supabase.from("wms_compra_comentarios").select("clickup_id").in("compra_id", ids.slice(i, i + 100)).not("clickup_id", "is", null);
      for (const c of data ?? []) yaComentados.add(c.clickup_id as string);
    }
  }
  for (const { tareas } of datos.listas as { tareas: Json[] }[]) {
    for (const t of tareas) {
      const compraId = tocadas.get(t.parent ?? t.id);
      if (!compraId) continue;
      const prefijo = t.parent ? `[Subtarea: ${t.name}] ` : "";
      const comentarios = (t._comentarios ?? [])
        .filter((c: Json) => !yaComentados.has(String(c.id)))
        .map((c: Json) => ({ compra_id: compraId, clickup_id: String(c.id), autor: c.user?.username ?? null, texto: prefijo + String(c.comment_text ?? ""), creado_en: iso(c.date), clickup: c }));
      comentariosNuevos += comentarios.length;
      if (!aplicar) continue;
      if (comentarios.length) await supabase.from("wms_compra_comentarios").upsert(comentarios, { onConflict: "clickup_id", ignoreDuplicates: true });
      if (t.parent) {
        const asignado = (t.assignees ?? [])[0]?.username ?? null;
        await supabase.from("wms_compra_subtareas").upsert(
          {
            compra_id: compraId,
            clickup_id: t.id,
            nombre: t.name,
            estado: t.status?.status ?? null,
            responsable_nombre: asignado ? (REASIGNAR[normal(asignado)] ?? asignado) : null,
            descripcion: (t.markdown_description ?? "").trim() || null,
            creado_en: iso(t.date_created),
            cerrado_en: iso(t.date_closed),
            clickup: { ...t, _comentarios: undefined },
          },
          { onConflict: "clickup_id" },
        );
      }
      const deCampo = (nombre: string, origen: string) => ((campo(t, nombre, "attachment")?.value as Json[] | undefined) ?? []).map((a) => ({ ...a, _origen: origen }));
      const todos: Json[] = [...(t.attachments ?? []).map((a: Json) => ({ ...a, _origen: "adjunto" })), ...deCampo("Foto del Producto", "campo_foto"), ...deCampo("Documentos", "campo_documentos")];
      const adjuntos = todos.map((a) => {
        const ext = String(a.extension ?? String(a.title ?? "").split(".").pop() ?? "").toLowerCase();
        const foto = ["jpg", "jpeg", "png", "webp", "gif", "avif", "jfif", "heic"].includes(ext);
        const video = ["mp4", "mov", "avi", "webm", "mkv"].includes(ext);
        return {
          compra_id: compraId,
          clickup_id: `${a._origen}:${a.id}`,
          nombre: String(a.title ?? a.id),
          extension: ext || null,
          tamano: a.size ? Number(a.size) : null,
          clase: foto ? "foto" : video ? "video" : "documento",
          origen: a._origen,
          url_clickup: a.url ?? null,
          subido_por: a.user?.username ?? null,
          creado_en: iso(a.date) ?? iso(t.date_created),
        };
      });
      if (adjuntos.length) await supabase.from("wms_compra_adjuntos").upsert(adjuntos, { onConflict: "compra_id,clickup_id", ignoreDuplicates: true });
      if (!t.parent && t._tiempo_en_estado) {
        const pasos = [...(t._tiempo_en_estado.status_history ?? [])]
          .filter((h: Json) => h.total_time?.since)
          .sort((a: Json, b: Json) => Number(a.total_time.since) - Number(b.total_time.since));
        const estadoH = (s: string | undefined) => ESTADOS[normal(s ?? "")] ?? String(s ?? "").trim();
        const eventos = pasos.map((h: Json, i: number) => ({
          compra_id: compraId,
          campo: "estado",
          valor_antes: i === 0 ? null : estadoH(pasos[i - 1].status),
          valor_despues: estadoH(h.status),
          ocurrido_en: iso(h.total_time.since),
          origen: "clickup_estado",
        }));
        if (eventos.length) await supabase.from("wms_compra_eventos").upsert(eventos, { onConflict: "compra_id,campo,valor_despues,ocurrido_en", ignoreDuplicates: true });
      }
    }
  }

  console.log(`\nCompras con cambios en ClickUp: ${[...tocadas.keys()].length - (aplicar ? creadas.length : 0)}`);
  console.log(`Datos que se traen: ${traidos}`);
  if (cambiosPorCompra.length) console.log(`\n${cambiosPorCompra.join("\n")}`);
  console.log(`\nConflictos (se deja lo del sistema): ${conflictos.length}`);
  for (const c of conflictos) console.log(`  ${c}`);
  console.log(`\nCompras nuevas en ClickUp: ${creadas.length}`);
  for (const c of creadas) console.log(`  ${c}`);
  console.log(`\nComentarios nuevos: ${comentariosNuevos}`);
  if (!aplicar) console.log("\n(Solo informe: no se escribió nada. Para aplicar: --aplicar)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
