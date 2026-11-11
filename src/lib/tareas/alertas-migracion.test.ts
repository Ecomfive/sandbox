// La lista de tipos del `check` de `fin_alertas` de la ÚLTIMA migración que lo redefine debe contener todos los tipos de
// `TIPOS_ALERTA`: si un lote suma un tipo en el código y no en la migración, la tarea de alertas falla al guardar.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { TIPOS_ALERTA } from "./alertas";

const DIR = join(process.cwd(), "supabase", "migrations");
const PATRON = /add constraint fin_alertas_tipo_check check \(tipo in \(([\s\S]*?)\)\)/i;

test("el check de fin_alertas de la última migración que lo redefine tiene todos los TIPOS_ALERTA", () => {
  const archivos = readdirSync(DIR)
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .sort();
  let ultima: { archivo: string; tipos: string[] } | null = null;
  for (const archivo of archivos) {
    const m = PATRON.exec(readFileSync(join(DIR, archivo), "utf8"));
    if (m) ultima = { archivo, tipos: [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]) };
  }
  assert.ok(ultima, "ninguna migración define fin_alertas_tipo_check");
  const faltan = TIPOS_ALERTA.filter((t) => !ultima.tipos.includes(t));
  assert.deepEqual(faltan, [], `faltan en ${ultima.archivo}: ${faltan.join(", ")}`);
});
