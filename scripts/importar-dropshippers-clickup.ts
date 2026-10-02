// Migra la lista «CRM DROPI» de ClickUp (datos-privados/clickup-crm.json, ver clickup-exportar-crm.mjs) al CRM.
//
// Uso:
//   npx tsx scripts/importar-dropshippers-clickup.ts            # prueba: no escribe nada, deja el informe
//   npx tsx scripts/importar-dropshippers-clickup.ts --aplicar  # escribe en Supabase (necesita la migración 0064)
//
// Reglas:
//  - Una persona puede estar en ClickUp varias veces (por ejemplo «privado» y «dropshippers»): se junta en un solo
//    dropshipper por teléfono, o por correo, o por nombre igual si no hay otro dato que lo contradiga.
//  - Nada se pierde: cada tarea de origen queda completa en `dropshippers.clickup`, y los comentarios pasan a
//    interacciones.
//  - Es seguro repetirlo: lo que ya se importó (por id de tarea) se salta.
//  - No imprime datos de personas: el detalle va al informe local datos-privados/informe-importacion.txt.

import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { listaDePaises, normalizarTelefono } from "../src/lib/crm/telefono";

const APLICAR = process.argv.includes("--aplicar");

interface Tarea {
  id: string;
  nombre: string;
  estado: string | null;
  creado_ms: number;
  responsables: string[];
  etiquetas: string[];
  descripcion: string;
  url: string;
  campos: Record<string, unknown>;
  comentarios: { autor: string | null; fecha_ms: number; texto: string }[];
}

const tareas: Tarea[] = JSON.parse(readFileSync("datos-privados/clickup-crm.json", "utf8"));

// Del estado de ClickUp al del CRM, y qué tan «avanzada» es la etapa cuando una persona tiene varias tareas.
const ESTADO_CRM: Record<string, "activo" | "prospecto" | "inactivo"> = {
  dropshippers: "activo",
  privado: "activo",
  archivado: "inactivo",
};
const PRIORIDAD_ETAPA = ["dropshippers", "privado", "seguimiento", "solicitud de datos", "pendiente de respuesta", "nueva consulta", "interesados en importación", "leads", "ramdon", "archivado"];
const prioridad = (e: string | null) => {
  const i = PRIORIDAD_ETAPA.indexOf(e ?? "");
  return i === -1 ? 99 : i;
};

const sinTildes = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const lista = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []);
const sinBandera = (s: string) => s.replace(/[\u{1F1E6}-\u{1F1FF}]/gu, "").trim();

interface Persona {
  tareas: Tarea[];
  telefono: string | null;
  telefonoAlterno: string | null;
  paisOrigen: string | null;
  correo: string | null;
  codigosPais: string[];
}

function datosDe(t: Tarea) {
  const paisesTxt = lista(t.campos["🗺️ Países"]).map(sinBandera).join(",");
  const { codigos, noReconocidos } = listaDePaises(paisesTxt);
  const defecto = codigos[0] ?? null;
  const tels = [t.campos["📞 Telefono"], t.campos["Celular"]]
    .map((x) => normalizarTelefono(texto(x), defecto))
    .filter((x): x is NonNullable<typeof x> => !!x);
  const correo = texto(t.campos["✉️ Correo Electrónico"]).toLowerCase() || null;
  return { codigos, noReconocidos, tels, correo };
}

// ---- 1) Juntar tareas de una misma persona
const personas: Persona[] = [];
const porTelefono = new Map<string, Persona>();
const porCorreo = new Map<string, Persona>();
const porNombre = new Map<string, Persona>();
const sinTelefonoValido: string[] = [];
const paisesNoReconocidos = new Set<string>();

for (const t of [...tareas].sort((a, b) => a.creado_ms - b.creado_ms)) {
  const d = datosDe(t);
  d.noReconocidos.forEach((p) => paisesNoReconocidos.add(p));
  if (d.tels.length === 0 && (t.campos["📞 Telefono"] || t.campos["Celular"])) sinTelefonoValido.push(`${t.nombre} (${t.id})`);

  let p: Persona | undefined;
  for (const tel of d.tels) p ??= porTelefono.get(tel.e164);
  if (!p && d.correo) p = porCorreo.get(d.correo);
  if (!p) {
    // Mismo nombre sin teléfono distinto: es la misma persona repetida en otro estado.
    const candidata = porNombre.get(sinTildes(t.nombre));
    if (candidata && (d.tels.length === 0 || !candidata.telefono)) p = candidata;
  }
  if (!p) {
    p = { tareas: [], telefono: null, telefonoAlterno: null, paisOrigen: null, correo: null, codigosPais: [] };
    personas.push(p);
  }
  p.tareas.push(t);
  if (!p.telefono && d.tels[0]) {
    p.telefono = d.tels[0].e164;
    p.paisOrigen = d.tels[0].pais;
  }
  for (const tel of d.tels) {
    if (tel.e164 !== p.telefono && !p.telefonoAlterno) p.telefonoAlterno = tel.e164;
    porTelefono.set(tel.e164, p);
  }
  if (!p.correo && d.correo) p.correo = d.correo;
  if (d.correo) porCorreo.set(d.correo, p);
  porNombre.set(sinTildes(t.nombre), p);
  for (const c of d.codigos) if (!p.codigosPais.includes(c)) p.codigosPais.push(c);
}

// ---- 2) Armar cada dropshipper
const filas = personas.map((p) => {
  const mejor = [...p.tareas].sort((a, b) => prioridad(a.estado) - prioridad(b.estado))[0];
  const reciente = [...p.tareas].sort((a, b) => b.creado_ms - a.creado_ms)[0];
  const tienda =
    p.tareas.map((t) => texto(t.campos["Tienda (short_text)"]) || texto(t.campos["Tienda (drop_down)"])).find(Boolean) || null;
  const productos = [
    ...new Set(p.tareas.flatMap((t) => [...lista(t.campos["Productos Ofrecidos"]), ...lista(t.campos["📦 Producto"])])),
  ];
  const etiquetas = [...new Set(p.tareas.flatMap((t) => t.etiquetas))];
  const asignados = [...new Set(p.tareas.flatMap((t) => t.responsables))];
  const descripciones = p.tareas.map((t) => t.descripcion.trim()).filter(Boolean);
  return {
    nombre: reciente.nombre.replace(/[\s,]+$/g, "").replace(/\s+/g, " ").trim(),
    estado: ESTADO_CRM[mejor.estado ?? ""] ?? "prospecto",
    etapa: mejor.estado,
    tienda,
    contacto_email: p.correo,
    contacto_telefono: p.telefono,
    telefono_alterno: p.telefonoAlterno,
    pais_origen: p.paisOrigen,
    productos,
    etiquetas,
    asignado_clickup: asignados.join(", ") || null,
    notas: descripciones.length ? descripciones.join("\n\n") : null,
    fecha_ingreso: new Date(Math.min(...p.tareas.map((t) => t.creado_ms))).toISOString().slice(0, 10),
    clickup_ids: p.tareas.map((t) => t.id),
    clickup: p.tareas,
    codigosPais: p.codigosPais,
    comentarios: p.tareas.flatMap((t) => t.comentarios.map((c) => ({ ...c, etapa: t.estado }))),
  };
});

// ---- 3) Informe
const conteo = (xs: (string | null)[]) => xs.reduce<Record<string, number>>((a, x) => ((a[x ?? "(sin dato)"] = (a[x ?? "(sin dato)"] ?? 0) + 1), a), {});
const sinPais = filas.filter((f) => f.codigosPais.length === 0);
const juntados = personas.filter((p) => p.tareas.length > 1);
const informe = [
  `Tareas de ClickUp: ${tareas.length}`,
  `Dropshippers resultantes: ${filas.length} (${tareas.length - filas.length} repetidos juntados)`,
  `Estado en el CRM: ${JSON.stringify(conteo(filas.map((f) => f.estado)))}`,
  `Etapa (ClickUp): ${JSON.stringify(conteo(filas.map((f) => f.etapa)))}`,
  `Con teléfono válido: ${filas.filter((f) => f.contacto_telefono).length}`,
  `Con correo: ${filas.filter((f) => f.contacto_email).length}`,
  `Venden en: ${JSON.stringify(conteo(filas.flatMap((f) => f.codigosPais)))}`,
  `Comentarios a pasar al historial: ${filas.reduce((t, f) => t + f.comentarios.length, 0)}`,
  "",
  `-- Revisar a mano (${sinTelefonoValido.length}) teléfono escrito pero no válido:`,
  ...sinTelefonoValido.map((x) => `   ${x}`),
  `-- Sin país donde vende (${sinPais.length}):`,
  ...sinPais.map((f) => `   ${f.nombre} (${f.clickup_ids.join(", ")})`),
  `-- Países no reconocidos: ${[...paisesNoReconocidos].join(", ") || "ninguno"}`,
  `-- Personas que estaban en varias tareas (${juntados.length}):`,
  ...juntados.map((p) => `   ${p.tareas[0].nombre}: ${p.tareas.map((t) => t.estado).join(" + ")}`),
  `-- Sin teléfono ni correo (${filas.filter((f) => !f.contacto_telefono && !f.contacto_email).length}):`,
  ...filas.filter((f) => !f.contacto_telefono && !f.contacto_email).map((f) => `   ${f.nombre}`),
].join("\n");
writeFileSync("datos-privados/informe-importacion.txt", informe, "utf8");

console.log(`Tareas: ${tareas.length} → dropshippers: ${filas.length}`);
console.log("Estado CRM:", conteo(filas.map((f) => f.estado)));
console.log("Venden en:", conteo(filas.flatMap((f) => f.codigosPais)));
console.log(`Sin teléfono válido: ${filas.filter((f) => !f.contacto_telefono).length} · sin país: ${sinPais.length}`);
console.log("Detalle en datos-privados/informe-importacion.txt");

if (!APLICAR) {
  console.log("\nPrueba: no se escribió nada. Con --aplicar se guarda en Supabase.");
  process.exit(0);
}

// ---- 4) Escribir en Supabase
async function aplicar() {
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !clave) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.");
  process.exit(1);
}
const supabase = createClient(url, clave, { auth: { persistSession: false } });

const { data: paises, error: errPaises } = await supabase.from("paises").select("id, codigo");
if (errPaises) throw errPaises;
const idPais = new Map((paises ?? []).map((p) => [p.codigo as string, p.id as string]));
const faltan = [...new Set(filas.flatMap((f) => f.codigosPais).filter((c) => !idPais.has(c)))];
if (faltan.length) {
  console.error(`Faltan países en la tabla paises: ${faltan.join(", ")}. Corre antes la migración 0064.`);
  process.exit(1);
}

// Lo ya importado se salta (se puede repetir sin duplicar).
const { data: existentes, error: errEx } = await supabase.from("dropshippers").select("clickup_ids");
if (errEx) throw errEx;
const yaImportados = new Set((existentes ?? []).flatMap((e) => (e.clickup_ids as string[]) ?? []));

let creados = 0;
let saltados = 0;
const fallos: string[] = [];
for (const f of filas) {
  if (f.clickup_ids.some((id) => yaImportados.has(id))) {
    saltados++;
    continue;
  }
  const principal = f.codigosPais[0] ?? (f.pais_origen && idPais.has(f.pais_origen) ? f.pais_origen : null);
  if (!principal) {
    fallos.push(`${f.nombre}: sin país donde vende (se debe asignar a mano)`);
    continue;
  }
  const { codigosPais, comentarios, ...datos } = f;
  const { data, error } = await supabase
    .from("dropshippers")
    .insert({ ...datos, pais_id: idPais.get(principal) })
    .select("id")
    .single();
  if (error) {
    fallos.push(`${f.nombre}: ${error.message}`);
    continue;
  }
  const paisesVende = codigosPais.length ? codigosPais : [principal];
  const { error: e2 } = await supabase
    .from("dropshipper_paises")
    .insert(paisesVende.map((c) => ({ dropshipper_id: data.id, pais_id: idPais.get(c) })));
  if (e2) fallos.push(`${f.nombre}: países: ${e2.message}`);
  if (comentarios.length) {
    const { error: e3 } = await supabase.from("interacciones_dropshipper").insert(
      comentarios.map((c) => ({
        dropshipper_id: data.id,
        fecha: new Date(c.fecha_ms).toISOString().slice(0, 10),
        tipo: "otro",
        nota: `${c.autor ? `${c.autor} (ClickUp)` : "ClickUp"}: ${c.texto}`.trim(),
      })),
    );
    if (e3) fallos.push(`${f.nombre}: comentarios: ${e3.message}`);
  }
  creados++;
}
console.log(`\nCreados: ${creados} · ya estaban: ${saltados} · con problema: ${fallos.length}`);
if (fallos.length) writeFileSync("datos-privados/informe-importacion-fallos.txt", fallos.join("\n"), "utf8");
}

aplicar().catch((e) => {
  console.error(e);
  process.exit(1);
});
