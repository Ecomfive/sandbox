import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { esPeticionDeCron } from "../seguridad/cron";
import { CLAVES_TAREA, cronUtc, cronsVercel, esClaveTarea, mesesAbiertos, pendienteDeHoy, resumenCorto } from "./definiciones";

test("cronUtc: Panamá es UTC−5 (y corre el día si cruza la medianoche)", () => {
  assert.equal(cronUtc(5, 10), "10 10 * * *");
  assert.equal(cronUtc(6, 0, [1]), "0 11 * * 1");
  assert.equal(cronUtc(21, 30, [0, 6]), "30 2 * * 0,1");
});

test("vercel.json tiene un cron por cada horario de las tareas", () => {
  const vercel = JSON.parse(readFileSync(new URL("../../../vercel.json", import.meta.url), "utf8")) as { crons: { path: string; schedule: string }[] };
  for (const c of cronsVercel()) assert.ok(vercel.crons.some((x) => x.path === c.path && x.schedule === c.schedule), `falta ${c.path} ${c.schedule}`);
  for (const t of CLAVES_TAREA) assert.ok(vercel.crons.some((x) => x.path === `/api/cron/${t}`), t);
});

test("mesesAbiertos: los dos últimos sin cerrar", () => {
  assert.deepEqual(mesesAbiertos("2026-10-01", new Set()), ["2026-10-01", "2026-09-01"]);
  assert.deepEqual(mesesAbiertos("2026-10-01", new Set(["2026-09-01"])), ["2026-10-01", "2026-08-01"]);
  assert.deepEqual(mesesAbiertos("2026-01-01", new Set(["2026-01-01"])), ["2025-12-01", "2025-11-01"]);
});

test("pendienteDeHoy: solo lo que dejó una ejecución de hoy (hora de Panamá)", () => {
  assert.deepEqual(pendienteDeHoy({ inicio: "2026-10-23T15:00:00Z", pendiente: ["x"] }, "2026-10-23"), ["x"]);
  // 02:00 UTC del 23 son las 21:00 del 22 en Panamá.
  assert.equal(pendienteDeHoy({ inicio: "2026-10-23T02:00:00Z", pendiente: ["x"] }, "2026-10-23"), null);
  assert.equal(pendienteDeHoy({ inicio: "2026-10-23T15:00:00Z", pendiente: null }, "2026-10-23"), null);
  assert.equal(pendienteDeHoy(null, "2026-10-23"), null);
});

test("esClaveTarea y resumenCorto", () => {
  assert.ok(esClaveTarea("alertas"));
  assert.ok(!esClaveTarea("borrar-todo"));
  assert.equal(resumenCorto("x".repeat(1200)).length, 998);
});

test("las rutas de cron exigen el secreto (sin secreto configurado, nunca)", () => {
  const previo = process.env.CRON_SECRET;
  const pedido = (h?: string) => new Request("https://ejemplo.test/api/cron/alertas", h ? { headers: { authorization: h } } : undefined);
  try {
    delete process.env.CRON_SECRET;
    assert.equal(esPeticionDeCron(pedido("Bearer ")), false);
    process.env.CRON_SECRET = "secreto-de-prueba";
    assert.equal(esPeticionDeCron(pedido("Bearer secreto-de-prueba")), true);
    assert.equal(esPeticionDeCron(pedido("Bearer secreto-de-prueb")), false);
    assert.equal(esPeticionDeCron(pedido()), false);
  } finally {
    if (previo === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previo;
  }
});

test("cronUtc con día del mes: el informe del día 5 a las 7:00 de Panamá", async () => {
  const { cronUtc: c, TAREAS_PROGRAMADAS } = await import("./definiciones");
  assert.equal(c(7, 0, [], 5), "0 12 5 * *");
  assert.equal(c(21, 0, [], 5), "0 2 6 * *");
  for (const t of TAREAS_PROGRAMADAS) for (const h of t.horas) assert.equal(h.minuto % 10, 0, `${t.clave}: minutos múltiplos de 10 (Netlify)`);
});
