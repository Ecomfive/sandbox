// Importa a wms_productos_test (Panamá) los 168 productos de septiembre de 2026 (filas 666-833 de la
// pestaña "Panamá" del sheet "Control de Testing en Países", según la columna "Fecha" de test), a partir
// del CSV exportado en .scratch-productos-test/panama.csv.
//
// Por defecto NO escribe nada: solo dice qué haría y para cuántos productos. Para aplicar de verdad:
//
// Uso: npx tsx scripts/importar-productos-test-sept.ts [--aplicar]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const aplicar = process.argv.includes("--aplicar");
const PAIS_ID_PANAMA = "d558eb6f-601c-4f1d-84f0-10b6c0c491da";
const CSV_PATH = ".scratch-productos-test/panama.csv";
// Sheet rows 666..833 (1-based) = array indices 665..832 (fila 6 = índice 5 son los encabezados).
const PRIMERA_FILA = 665;
const ULTIMA_FILA = 832;

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\r") {
        // skip
      } else if (c === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const ESTADOS_VALIDOS = new Set(["pendiente", "backlog", "testeando", "reserva", "consulta", "winner", "enviado_a_compras", "fallido", "descartado"]);
const ESTADO_MAPA: Record<string, string> = {
  Pendiente: "pendiente",
  Backlog: "backlog",
  Testeando: "testeando",
  Reserva: "reserva",
  Consulta: "consulta",
  Winner: "winner",
  "Enviado a Compras": "enviado_a_compras",
  Fallido: "fallido",
  Descartado: "descartado",
};
const TEST_NUMERO_MAPA: Record<string, string> = { "Test 1": "test_1", "Test 2": "test_2", "Test 3": "test_3" };
const EXPLOTACION_MAPA: Record<string, string> = { Baja: "baja", Media: "media", Alta: "alta", "No aplica": "no_aplica" };

const textoOpt = (v: string | undefined): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};
/** "Worldwide 🌎" y "AD LIBRARY" son el texto por defecto del desplegable sin elegir — no un valor real. */
const textoOptSinDefecto = (v: string | undefined, defecto: string): string | null => {
  const t = textoOpt(v);
  return t && t !== defecto ? t : null;
};
const dineroOpt = (v: string | undefined): number | null => {
  const t = textoOpt(v);
  if (!t) return null;
  const n = Number(t.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
};
const porcentajeOpt = (v: string | undefined): number | null => {
  const t = textoOpt(v);
  if (!t) return null;
  const n = Number(t.replace(/%/g, ""));
  return Number.isFinite(n) ? n : null;
};
const enteroOpt = (v: string | undefined): number | null => {
  const t = textoOpt(v);
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
};
/** DD/MM/AAAA (como lo muestra el sheet) -> AAAA-MM-DD (como lo espera Postgres). */
const fechaOpt = (v: string | undefined): string | null => {
  const t = textoOpt(v);
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};
const boolOpt = (v: string | undefined): boolean => (v ?? "").trim().toUpperCase() === "TRUE";

interface Registro {
  nombre: string;
  fecha_creacion: string | null;
  fuente: string | null;
  pagina_producto_url: string | null;
  video_url: string | null;
  categoria: string | null;
  angulo_venta: string | null;
  worldwide: string | null;
  ad_library: string | null;
  fecha_test: string | null;
  estado: string;
  clickup: boolean;
  test_numero: string | null;
  calculadora_url: string | null;
  campana_url: string | null;
  metrica_oferta: number | null;
  metrica_cpm: number | null;
  metrica_efectividad: number | null;
  metrica_hook_rate: number | null;
  metrica_ctr: number | null;
  metrica_cpa: number | null;
  metrica_gasto: number | null;
  metrica_compras: number | null;
  metrica_cvr: number | null;
  revisado: boolean;
  ultima_revision: string | null;
  observacion: string | null;
  explotacion: string | null;
}

function transformar(fila: string[]): Registro | null {
  const nombre = textoOpt(fila[8]);
  if (!nombre) return null;

  const estadoTexto = textoOpt(fila[11]);
  const estado = (estadoTexto && ESTADO_MAPA[estadoTexto]) || "pendiente";
  if (!ESTADOS_VALIDOS.has(estado)) throw new Error(`Estado desconocido: "${estadoTexto}" en "${nombre}"`);

  const testTexto = textoOpt(fila[13]);
  const explotacionTexto = textoOpt(fila[36]);

  return {
    nombre,
    fecha_creacion: fechaOpt(fila[0]),
    fuente: textoOpt(fila[1]),
    pagina_producto_url: textoOpt(fila[2]),
    video_url: textoOpt(fila[3]),
    categoria: textoOpt(fila[4]),
    angulo_venta: textoOpt(fila[5]),
    worldwide: textoOptSinDefecto(fila[6], "Worldwide 🌎"),
    ad_library: textoOptSinDefecto(fila[9], "AD LIBRARY"),
    fecha_test: fechaOpt(fila[10]),
    estado,
    clickup: boolOpt(fila[12]),
    test_numero: testTexto ? TEST_NUMERO_MAPA[testTexto] ?? null : null,
    calculadora_url: textoOpt(fila[14]),
    campana_url: textoOpt(fila[16]),
    metrica_oferta: dineroOpt(fila[15]),
    metrica_cpm: dineroOpt(fila[17]),
    metrica_efectividad: porcentajeOpt(fila[18]),
    metrica_hook_rate: porcentajeOpt(fila[19]),
    metrica_ctr: porcentajeOpt(fila[20]),
    metrica_cpa: dineroOpt(fila[21]),
    metrica_gasto: dineroOpt(fila[22]),
    metrica_compras: enteroOpt(fila[23]),
    metrica_cvr: porcentajeOpt(fila[24]),
    revisado: boolOpt(fila[25]),
    ultima_revision: fechaOpt(fila[26]),
    observacion: textoOpt(fila[35]),
    explotacion: explotacionTexto ? EXPLOTACION_MAPA[explotacionTexto] ?? null : null,
  };
}

async function main() {
  const texto = readFileSync(CSV_PATH, "utf8");
  const filas = parseCSV(texto);
  const filasSept = filas.slice(PRIMERA_FILA, ULTIMA_FILA + 1);
  console.log(`${filasSept.length} fila(s) de septiembre en el CSV (filas ${PRIMERA_FILA + 1}-${ULTIMA_FILA + 1} del sheet).`);

  const registros = filasSept.map(transformar).filter((r): r is Registro => r !== null);
  console.log(`${registros.length} producto(s) con nombre para importar.`);

  const { data: existentes, error: errorExistentes } = await supabase
    .from("wms_productos_test")
    .select("nombre")
    .eq("pais_id", PAIS_ID_PANAMA);
  if (errorExistentes) throw new Error(`Error leyendo productos existentes: ${errorExistentes.message}`);
  const nombresExistentes = new Set((existentes ?? []).map((r) => r.nombre));

  let insertados = 0;
  let saltados = 0;
  let errores = 0;
  const conteoEstados: Record<string, number> = {};

  for (const r of registros) {
    conteoEstados[r.estado] = (conteoEstados[r.estado] ?? 0) + 1;
    if (nombresExistentes.has(r.nombre)) {
      console.log(`  = "${r.nombre}" ya existe, se salta.`);
      saltados++;
      continue;
    }

    console.log(`  + "${r.nombre}" — ${r.estado}${r.test_numero ? "/" + r.test_numero : ""}, gasto: ${r.metrica_gasto ?? "—"}`);
    if (!aplicar) continue;

    const { error: errorInsert } = await supabase.from("wms_productos_test").insert({ pais_id: PAIS_ID_PANAMA, ...r });
    if (errorInsert) {
      console.log(`    ! Error insertando "${r.nombre}": ${errorInsert.message}`);
      errores++;
      continue;
    }
    insertados++;
  }

  console.log("Estados encontrados:", conteoEstados);
  console.log(
    aplicar
      ? `Listo: ${insertados} insertado(s), ${saltados} saltado(s) (ya existían), ${errores} error(es).`
      : `Modo de prueba (sin --aplicar): se insertarían ${registros.length - saltados} producto(s) (${saltados} ya existen). Corre con --aplicar para guardarlo de verdad.`
  );
}

main();
