// Importa la lista «GCC 🇵🇦 Ecomfive Panamá» de ClickUp (datos-privados/clickup-gcc-panama.json, la baja
// clickup-exportar-publicaciones-dropi.mjs) a Gestión de publicaciones Dropi (`dropi_publicaciones`, migración 0116): una tarea
// es una publicación de Panamá, con su tarea original completa en `clickup` (nada se pierde). Se puede repetir: actualiza por
// `clickup_id` y no duplica; la foto solo se copia si la publicación aún no tiene una.
//
// Por defecto NO escribe nada: dice qué haría y qué valores no reconoce.
//   npx tsx scripts/importar-publicaciones-dropi.ts            → informe
//   npx tsx scripts/importar-publicaciones-dropi.ts --aplicar  → importa (y copia las fotos a Storage)

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { leerTareaGcc, type TareaClickup } from "../src/lib/publicaciones/publicacion";
import { detectarImagen } from "../src/lib/seguridad/imagen";
import { huellaFoto } from "../src/lib/wms/huella-foto";

const aplicar = process.argv.includes("--aplicar");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const BUCKET = "wms-productos";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

async function main() {
  const { tareas } = JSON.parse(readFileSync("datos-privados/clickup-gcc-panama.json", "utf8")) as { tareas: TareaClickup[] };
  const { data: pais } = await supabase.from("paises").select("id").eq("codigo", "PA").single();
  if (!pais) throw new Error("No existe el país PA.");

  // Responsables: por nombre (en ClickUp usan otros correos que en el sistema) y, si no, por correo.
  const { data: perfiles } = await supabase.from("perfiles").select("id, nombre, email");
  const porNombre = new Map((perfiles ?? []).filter((p) => p.nombre).map((p) => [norm(p.nombre as string), p.id as string]));
  const porCorreo = new Map((perfiles ?? []).map((p) => [String(p.email).toLowerCase(), p.id as string]));
  // Todos los asignados de la tarea que tienen usuario, en orden (migración 0119); el primero queda en `responsable_id`.
  const responsablesDe = (t: TareaClickup) => [...new Set(t.assignees.map((a) => porNombre.get(norm(a.username)) ?? porCorreo.get(a.email?.toLowerCase())).filter((x): x is string => !!x))];

  const { data: existentes, error: errorExistentes } = await supabase.from("dropi_publicaciones").select("id, clickup_id, foto_url").not("clickup_id", "is", null);
  if (errorExistentes) throw new Error(`Falta correr la migración 0116: ${errorExistentes.message}`);
  const yaEsta = new Map((existentes ?? []).map((e) => [e.clickup_id as string, e]));

  const avisos: Record<string, number> = {};
  let nuevas = 0;
  let actualizadas = 0;
  let fotos = 0;
  const sinResponsable = new Set<string>();
  const idPorClickup = new Map<string, string>();
  const relacionadosDe = new Map<string, string[]>();

  for (const t of tareas) {
    const p = leerTareaGcc(t);
    for (const a of p.avisos) avisos[a] = (avisos[a] ?? 0) + 1;
    const responsables = responsablesDe(t);
    const resp = responsables[0] ?? null;
    if (!resp && t.assignees.length) sinResponsable.add(t.assignees.map((a) => a.username).join("+"));
    const previa = yaEsta.get(t.id);
    if (previa) actualizadas++;
    else nuevas++;
    if (!aplicar) continue;

    const { relacionadosClickup, foto } = p;
    const datos = Object.fromEntries(Object.entries(p).filter(([k]) => !["avisos", "relacionadosClickup", "foto", "responsables"].includes(k)));
    const fila = { ...datos, pais_id: pais.id, responsable_id: resp, responsables, clickup_id: t.id, clickup: t, actualizado_en: new Date().toISOString() };
    const { data, error } = previa
      ? await supabase.from("dropi_publicaciones").update(fila).eq("id", previa.id).select("id, foto_url").single()
      : await supabase.from("dropi_publicaciones").insert({ ...fila, creado_en: new Date(Number(t.date_created)).toISOString() }).select("id, foto_url").single();
    if (error || !data) throw new Error(`${t.name}: ${error?.message}`);
    idPorClickup.set(t.id, data.id);
    relacionadosDe.set(data.id, relacionadosClickup);

    // La foto se copia a la carpeta del módulo (no se comparte la dirección de ClickUp).
    if (foto && !data.foto_url) {
      try {
        const r = await fetch(foto.url);
        const bytes = new Uint8Array(await r.arrayBuffer());
        const tipo = r.ok ? detectarImagen(bytes.slice(0, 64)) : null;
        if (tipo) {
          const ruta = `publicaciones/${data.id}/${Date.now()}.${tipo.extension}`;
          const { error: e2 } = await supabase.storage.from(BUCKET).upload(ruta, bytes, { contentType: tipo.tipo });
          if (!e2) {
            const url = supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
            // La huella de la foto sirve para sugerir su producto de Producto (migración 0117; sin ella se guarda solo la foto).
            const huella = await huellaFoto(bytes);
            const { error: e3 } = await supabase.from("dropi_publicaciones").update({ foto_url: url, foto_huella: huella }).eq("id", data.id);
            if (e3) await supabase.from("dropi_publicaciones").update({ foto_url: url }).eq("id", data.id);
            fotos++;
          }
        }
      } catch {
        // Sin foto: se puede subir después desde la ficha.
      }
    }
  }

  if (aplicar) {
    // Relacionados: ahora que todas tienen id, se enlazan.
    for (const [id, clickups] of relacionadosDe) {
      const ids = clickups.map((c) => idPorClickup.get(c)).filter((x): x is string => !!x);
      await supabase.from("dropi_publicaciones").update({ relacionados: ids }).eq("id", id);
    }
  }

  console.log(`${aplicar ? "Importadas" : "Se importarían"}: ${nuevas} nuevas y ${actualizadas} actualizadas (de ${tareas.length}).${aplicar ? ` Fotos copiadas: ${fotos}.` : ""}`);
  console.log("Valores no reconocidos:", Object.keys(avisos).length ? avisos : "ninguno");
  if (sinResponsable.size) console.log("Responsables sin usuario en el sistema:", [...sinResponsable]);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
