// Importa las compras de ClickUp (datos-privados/clickup-compras.json, lo baja clickup-exportar-compras.mjs) al tablero de
// Compras: cada tarea principal es una compra (de su país, o de Importadora sin país), con sus comentarios, subtareas,
// adjuntos y el historial de estados con sus horas. Cada compra guarda además su tarea original completa (`clickup`), así
// que nada se pierde. Se puede repetir: actualiza por `clickup_id` y no duplica.
//
// Por defecto NO escribe nada: dice qué haría y qué valores no reconoce.
//   npx tsx scripts/importar-compras-clickup.ts              → informe
//   npx tsx scripts/importar-compras-clickup.ts --aplicar    → importa los datos (los adjuntos quedan como enlace a ClickUp)
//   npx tsx scripts/importar-compras-clickup.ts --aplicar --subir-adjuntos → además copia los adjuntos (fotos, documentos y videos) a Storage
//
// Responsables (decisión de Hernán, 5 oct 2026): lo de Zeylimar Moreno, Maria Jose Aponte y Fabiola Concha pasa a Francis
// Aponte; lo de Alcides Andrade se queda a su nombre.

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const subirAdjuntos = process.argv.includes("--subir-adjuntos");

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const tokenClickup = (env.CLICKUP_TOKEN ?? "").replace(/^["']|["']$/g, "");

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const REASIGNAR: Record<string, string> = {
  "zeylimar moreno": "Francis Aponte",
  "maria jose aponte": "Francis Aponte",
  "maría josé aponte": "Francis Aponte",
  "fabiola concha": "Francis Aponte",
};
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
// La Etapa de ClickUp por su número («03 - Cotizar», «04- Cotizado»…).
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
const PRIORIDAD: Record<string, string> = { urgent: "urgente", high: "alta", normal: "normal", low: "baja" };

const noReconocidos = new Map<string, number>();
const anotar = (que: string) => noReconocidos.set(que, (noReconocidos.get(que) ?? 0) + 1);

function mapEstado(s: string | undefined): string {
  const v = ESTADOS[normal(s ?? "")];
  if (!v) anotar(`estado «${s}»`);
  return v ?? "backlog";
}
function mapEtapa(nombre: string | null): string {
  if (!nombre) return "backlog";
  const n = normal(nombre);
  if (n.startsWith("backlog")) return "backlog";
  if (n.startsWith("descartado")) return "descartado";
  const m = n.match(/^(\d{2})/);
  if (m && ETAPA_POR_NUMERO[m[1]]) return ETAPA_POR_NUMERO[m[1]];
  anotar(`etapa «${nombre}»`);
  return "backlog";
}

/** El valor legible de un campo personalizado por el nombre del campo (sin emojis), y su tipo. */
function campo(t: Json, nombre: string, tipo?: string): Json | null {
  const c = (t.custom_fields ?? []).find((x: Json) => normal(String(x.name).replace(/[^\p{L}\p{N} ()]/gu, "")) === normal(nombre) && (!tipo || x.type === tipo));
  if (!c || c.value === undefined || c.value === null || c.value === "" || (Array.isArray(c.value) && c.value.length === 0)) return null;
  return c;
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
/** Una fecha de ClickUp (milisegundos) como día de Panamá. */
const dia = (ms: unknown): string | null =>
  ms ? new Date(Number(ms)).toLocaleDateString("en-CA", { timeZone: "America/Panama" }) : null;
const fechaCampo = (t: Json, nombre: string) => dia(campo(t, nombre, "date")?.value);
const iso = (ms: unknown): string | null => (ms ? new Date(Number(ms)).toISOString() : null);

function via(t: Json): string[] {
  return [
    ...new Set(
      etiquetasDe(t, "Shipping").map((l): string | null => {
        const n = normal(l);
        if (n.includes("air")) return "aire";
        if (n.includes("sea")) return "mar";
        if (n.includes("truck")) return "tierra";
        anotar(`vía «${l}»`);
        return null;
      }),
    ),
  ].filter((x): x is string => !!x);
}

const EXT_FOTO = ["jpg", "jpeg", "png", "webp", "gif", "avif", "jfif", "heic"];
const EXT_VIDEO = ["mp4", "mov", "avi", "webm", "mkv"];
const claseDe = (ext: string) => (EXT_FOTO.includes(ext) ? "foto" : EXT_VIDEO.includes(ext) ? "video" : "documento");

async function main() {
  const datos = JSON.parse(readFileSync("datos-privados/clickup-compras.json", "utf8"));
  const { data: paises } = await supabase.from("paises").select("id, codigo");
  const paisId = new Map((paises ?? []).map((p) => [p.codigo as string, p.id as string]));
  const { data: perfiles } = await supabase.from("perfiles").select("id, nombre");
  const perfilPorNombre = new Map((perfiles ?? []).filter((p) => p.nombre).map((p) => [normal(p.nombre as string), p.id as string]));

  const resumen: string[] = [];
  let totalCompras = 0;
  for (const { clave, lista, tareas } of datos.listas as { clave: string; lista: Json; tareas: Json[] }[]) {
    if (clave === "chat_compras") {
      resumen.push(`${lista.name}: se omite (${tareas.length} tareas de conversación, sin datos de compras).`);
      continue;
    }
    const esImportadora = clave === "importadora";
    if (!esImportadora && !paisId.has(clave)) {
      resumen.push(`${lista.name}: FALTA el país ${clave} (corre la migración 0076).`);
      continue;
    }
    const principales = tareas.filter((t) => !t.parent);
    const subtareas = tareas.filter((t) => t.parent);
    totalCompras += principales.length;
    resumen.push(
      `${lista.name}: ${principales.length} compras, ${subtareas.length} subtareas, ${tareas.reduce((n, t) => n + (t._comentarios ?? []).length, 0)} comentarios, ${tareas.reduce((n, t) => n + (t.attachments ?? []).length, 0)} adjuntos`,
    );

    const idCompra = new Map<string, string>(); // clickup_id → id en la base
    for (const t of principales) {
      const asignados: string[] = (t.assignees ?? []).map((a: Json) => String(a.username));
      const original = asignados[0] ?? null;
      const responsable = original ? (REASIGNAR[normal(original)] ?? original) : null;
      const asignadoA = responsable ? (perfilPorNombre.get(normal(responsable)) ?? null) : null;
      if (responsable && !asignadoA) anotar(`responsable sin usuario «${responsable}»`);
      const { _comentarios, _tiempo_en_estado, ...crudo } = t;
      void _comentarios;
      const fila = {
        tipo: esImportadora ? "importacion" : "pais",
        pais_id: esImportadora ? null : paisId.get(clave),
        clickup_id: t.id,
        clickup_lista: lista.name,
        clickup: { ...crudo, _tiempo_en_estado },
        nombre: String(t.name).trim() || "(sin nombre)",
        codigo: String(t.name).match(/\b([A-Z]{2,3}-\d{3,})\b/)?.[1] ?? null,
        estado: mapEstado(t.status?.status),
        etapa: mapEtapa(texto(t, "Etapa", "drop_down")),
        proveedor: texto(t, "Proveedor", "drop_down") ?? texto(t, "Proveedor", "short_text"),
        cliente: texto(t, "Cliente"),
        tienda: texto(t, "Tienda", "drop_down"),
        cuenta_receptora: texto(t, "Cuenta receptora", "drop_down"),
        pago_cliente: texto(t, "Pago Cliente", "drop_down"),
        planificacion: texto(t, "Planificación", "drop_down"),
        track_id: texto(t, "Track ID"),
        orden: texto(t, "Orden"),
        inconveniente: texto(t, "Inconveniente"),
        url_producto: texto(t, "URL", "url"),
        qty_total: numero(t, "QTY Total"),
        monto_total: numero(t, "Monto Total"),
        primer_pago: numero(t, "Primer Pago"),
        segundo_pago: numero(t, "Segundo Pago"),
        pagado_a_proveedor: numero(t, "Pagado a Proveedor"),
        pago_pendiente: numero(t, "Pago Pendiente"),
        cobrado_cliente: numero(t, "Cobrado Cliente"),
        pendiente_cliente: numero(t, "Pendiente Cliente"),
        factura: casilla(t, "Factura"),
        financiamiento: casilla(t, "Financiamiento"),
        revisado_aa: casilla(t, "Revisado AA"),
        fecha_pago_1: fechaCampo(t, "Fecha de Pago (1)"),
        fecha_pago_2: fechaCampo(t, "Fecha de Pago (2)"),
        fecha_envio: fechaCampo(t, "Fecha de Envío"),
        fecha_llegada: fechaCampo(t, "Fecha de llegada"),
        fecha_limite: dia(t.due_date),
        fecha_inicio: dia(t.start_date),
        via_envio: via(t),
        paises_destino: etiquetasDe(t, "Países").map((p) => p.replace(/[^\p{L} ]/gu, "").trim()),
        prioridad: t.priority?.priority ? (PRIORIDAD[t.priority.priority] ?? null) : null,
        etiquetas: (t.tags ?? []).map((x: Json) => String(x.name)),
        responsable_nombre: responsable,
        asignado_a: asignadoA,
        creador_nombre: t.creator?.username ?? null,
        descripcion: (t.markdown_description ?? t.text_content ?? "").trim() || null,
        creado_en: iso(t.date_created),
        actualizado_en: iso(t.date_updated),
        cerrado_en: iso(t.date_closed),
      };
      if (!aplicar) continue;
      const { data, error } = await supabase.from("wms_compras").upsert(fila, { onConflict: "clickup_id" }).select("id").single();
      if (error) {
        console.error(`✗ ${t.id} ${t.name}: ${error.message}`);
        continue;
      }
      idCompra.set(t.id, data.id);
    }
    if (!aplicar) continue;

    // Subtareas, comentarios, adjuntos e historial de estados (de las compras y de sus subtareas, colgados de la compra).
    for (const t of tareas) {
      const compraId = idCompra.get(t.parent ?? t.id);
      if (!compraId) continue;
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
      const prefijo = t.parent ? `[Subtarea: ${t.name}] ` : "";
      const comentarios = (t._comentarios ?? []).map((c: Json) => ({
        compra_id: compraId,
        clickup_id: String(c.id),
        autor: c.user?.username ?? null,
        texto: prefijo + String(c.comment_text ?? ""),
        creado_en: iso(c.date),
        clickup: c,
      }));
      for (let i = 0; i < comentarios.length; i += 200) {
        const { error } = await supabase.from("wms_compra_comentarios").upsert(comentarios.slice(i, i + 200), { onConflict: "clickup_id" });
        if (error) console.error(`✗ comentarios de ${t.id}: ${error.message}`);
      }

      // Adjuntos de la tarea y de los campos «Foto del Producto» y «Documentos».
      const deCampo = (nombre: string, origen: string) => ((campo(t, nombre, "attachment")?.value as Json[] | undefined) ?? []).map((a) => ({ ...a, _origen: origen }));
      const todos: Json[] = [...(t.attachments ?? []).map((a: Json) => ({ ...a, _origen: "adjunto" })), ...deCampo("Foto del Producto", "campo_foto"), ...deCampo("Documentos", "campo_documentos")];
      const adjuntos = todos.map((a) => {
        const ext = String(a.extension ?? String(a.title ?? "").split(".").pop() ?? "").toLowerCase();
        return {
          compra_id: compraId,
          clickup_id: `${a._origen}:${a.id}`,
          nombre: String(a.title ?? a.id),
          extension: ext || null,
          tamano: a.size ? Number(a.size) : null,
          clase: claseDe(ext),
          origen: a._origen,
          url_clickup: a.url ?? null,
          subido_por: a.user?.username ?? null,
          creado_en: iso(a.date) ?? iso(t.date_created),
        };
      });
      if (adjuntos.length) {
        const { error } = await supabase.from("wms_compra_adjuntos").upsert(adjuntos, { onConflict: "compra_id,clickup_id" });
        if (error) console.error(`✗ adjuntos de ${t.id}: ${error.message}`);
      }

      // Historial de Estado de ClickUp: cada estado desde su hora de inicio, en orden.
      if (!t.parent && t._tiempo_en_estado) {
        const pasos = [...(t._tiempo_en_estado.status_history ?? [])]
          .filter((h: Json) => h.total_time?.since)
          .sort((a: Json, b: Json) => Number(a.total_time.since) - Number(b.total_time.since));
        const eventos = pasos.map((h: Json, i: number) => ({
          compra_id: compraId,
          campo: "estado",
          valor_antes: i === 0 ? null : mapEstado(pasos[i - 1].status),
          valor_despues: mapEstado(h.status),
          ocurrido_en: iso(h.total_time.since),
          origen: "clickup_estado",
        }));
        if (eventos.length) await supabase.from("wms_compra_eventos").upsert(eventos, { onConflict: "compra_id,campo,valor_despues,ocurrido_en", ignoreDuplicates: true });
      }
    }
  }

  console.log(resumen.join("\n"));
  console.log(`\nTotal: ${totalCompras} compras.`);
  if (noReconocidos.size) {
    console.log("\nValores que no reconocí (van con un valor por defecto):");
    for (const [k, n] of noReconocidos) console.log(`  ${k}: ${n}`);
  }
  if (!aplicar) console.log("\n(Solo informe: no se escribió nada. Para importar: --aplicar)");

  if (aplicar && subirAdjuntos) await copiarAdjuntos();
}

/** Copia a Storage (bucket privado wms-compras) los adjuntos que aún no están: fotos, documentos y videos (plan Pro). Si uno falla, queda con su enlace de ClickUp. */
async function copiarAdjuntos() {
  const pendientes: Json[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data } = await supabase.from("wms_compra_adjuntos").select("id, compra_id, clickup_id, extension, clase, origen, url_clickup").is("ruta", null).range(desde, desde + 999);
    if (!data?.length) break;
    pendientes.push(...data);
  }
  let ok = 0;
  let fallos = 0;
  for (const a of pendientes) {
    if (!a.url_clickup) continue;
    try {
      const r = await fetch(a.url_clickup, { headers: tokenClickup ? { Authorization: tokenClickup } : {} });
      if (!r.ok) throw new Error(String(r.status));
      const cuerpo = Buffer.from(await r.arrayBuffer());
      const ruta = `${a.compra_id}/${String(a.clickup_id).replace(/[^a-zA-Z0-9._-]+/g, "_")}.${a.extension || "bin"}`;
      const { error } = await supabase.storage.from("wms-compras").upload(ruta, cuerpo, { upsert: true, contentType: r.headers.get("content-type") ?? undefined });
      if (error) throw new Error(error.message);
      await supabase.from("wms_compra_adjuntos").update({ ruta }).eq("id", a.id);
      // La «📸 Foto del Producto» es además la miniatura de la tabla: va al bucket público de fotos de producto.
      if (a.origen === "campo_foto") {
        const rutaPublica = `compras/clickup/${ruta}`;
        const subida = await supabase.storage.from("wms-productos").upload(rutaPublica, cuerpo, { upsert: true, contentType: r.headers.get("content-type") ?? undefined });
        if (!subida.error) {
          const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/wms-productos/${rutaPublica}`;
          await supabase.from("wms_compras").update({ foto_url: url }).eq("id", a.compra_id).is("foto_url", null);
        }
      }
      ok++;
    } catch (e) {
      fallos++;
      if (fallos <= 10) console.error(`✗ adjunto ${a.id}: ${(e as Error).message}`);
    }
  }
  console.log(`Adjuntos copiados: ${ok}; fallidos: ${fallos} (quedan con su enlace de ClickUp).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
