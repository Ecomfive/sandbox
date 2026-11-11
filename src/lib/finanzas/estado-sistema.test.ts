import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describirPrueba, diasDesde, enlaceManual, estadoTarea, estadoVariables, horasEsperadas, MIGRACIONES_CLAVE, pruebasParaSql, ultimaPor, VARIABLES_ENTORNO } from "./estado-sistema";

const ahora = new Date("2026-10-26T12:00:00Z");

test("variables: solo dice si están, nunca el valor", () => {
  const r = estadoVariables({ CRON_SECRET: "secreto", RESEND_API_KEY: "  " });
  const cron = r.find((v) => v.nombre === "CRON_SECRET")!;
  assert.equal(cron.configurada, true);
  assert.equal(r.find((v) => v.nombre === "RESEND_API_KEY")!.configurada, false);
  assert.ok(!JSON.stringify(r).includes("secreto"));
  assert.equal(new Set(VARIABLES_ENTORNO.map((v) => v.nombre)).size, VARIABLES_ENTORNO.length);
  for (const v of VARIABLES_ENTORNO) assert.ok(!v.nombre.startsWith("NEXT_PUBLIC_") || !/KEY_SECRET|SERVICE/.test(v.nombre));
});

test("migraciones: una prueba por migración, nombres seguros", () => {
  assert.equal(new Set(MIGRACIONES_CLAVE.map((m) => m.migracion)).size, MIGRACIONES_CLAVE.length);
  for (const m of MIGRACIONES_CLAVE) assert.match(m.prueba.nombre, /^[a-z0-9_-]+$/);
  const sql = pruebasParaSql();
  assert.equal(sql.find((x) => x.migracion === "0916")?.extra, "del_semana");
  assert.equal(describirPrueba({ tipo: "check", nombre: "c", valor: "v" }), "«v» en c");
});

test("migraciones: Estado del sistema lista todos los archivos desde la 0900", () => {
  const archivos = readdirSync(join(process.cwd(), "supabase", "migrations"))
    .map((f) => /^(\d{4})_.*\.sql$/.exec(f)?.[1])
    .filter((n): n is string => !!n && Number(n) >= 900);
  const listadas = new Set(MIGRACIONES_CLAVE.map((m) => m.migracion));
  assert.deepEqual([...new Set(archivos)].filter((n) => !listadas.has(n)), []);
});

test("tareas: diaria, semanal y mensual con su margen", () => {
  assert.equal(horasEsperadas({ dias: [], diaMes: undefined }), 26);
  assert.equal(horasEsperadas({ dias: [1], diaMes: undefined }), 180);
  assert.equal(horasEsperadas({ dias: [], diaMes: 5 }), 768);
  const diaria = { dias: [] as number[] };
  assert.equal(estadoTarea(diaria, null, ahora), "nunca");
  assert.equal(estadoTarea(diaria, { inicio: "2026-10-26T10:00:00Z", fin: "2026-10-26T10:01:00Z", ok: true }, ahora), "ok");
  assert.equal(estadoTarea(diaria, { inicio: "2026-10-24T10:00:00Z", fin: "2026-10-24T10:01:00Z", ok: true }, ahora), "atrasada");
  assert.equal(estadoTarea(diaria, { inicio: "2026-10-26T11:00:00Z", fin: null, ok: null }, ahora), "corriendo");
  assert.equal(estadoTarea(diaria, { inicio: "2026-10-26T06:00:00Z", fin: null, ok: null }, ahora), "error");
  assert.equal(estadoTarea(diaria, { inicio: "2026-10-26T10:00:00Z", fin: "2026-10-26T10:01:00Z", ok: false }, ahora), "error");
});

test("enlace al manual, días y última por clave", () => {
  const secciones = [{ titulo: "A" }, { titulo: "B" }];
  assert.equal(enlaceManual(secciones, "B"), "/ayuda/guias/operacion-contingencia#seccion-1");
  assert.equal(enlaceManual(secciones, "Z"), "/ayuda/guias/operacion-contingencia");
  assert.equal(diasDesde("2026-10-24T13:00:00Z", ahora), 1);
  assert.equal(diasDesde(null, ahora), null);
  const m = ultimaPor([{ k: "a", n: 1 }, { k: "a", n: 2 }, { k: "b", n: 3 }], (f) => f.k);
  assert.equal(m.get("a")!.n, 1);
});

test("cada sección que enlaza la página existe en la guía y en el manual borrador", async () => {
  const { GUIAS } = await import("../ayuda/contenido");
  const { MANUALES_BORRADOR } = await import("../ayuda/manuales-borrador");
  const { SECCION_MANUAL, CLAVE_GUIA_OPERACION } = await import("./estado-sistema");
  const guia = GUIAS.find((g) => g.clave === CLAVE_GUIA_OPERACION)!;
  assert.ok(guia);
  for (const t of Object.values(SECCION_MANUAL)) assert.ok(guia.secciones.some((s) => s.titulo === t), t);
  const manual = MANUALES_BORRADOR.find((m) => m.titulo.startsWith("Operación"))!;
  for (const t of Object.values(SECCION_MANUAL)) assert.ok(manual.contenido.includes(`## ${t}`), t);
});
