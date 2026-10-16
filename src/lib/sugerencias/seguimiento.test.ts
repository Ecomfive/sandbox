import assert from "node:assert/strict";
import { test } from "node:test";
import { aciertoCliente, armarSeguimiento, exclusividadDe, type DatosRecorrido } from "./seguimiento";

const base: DatosRecorrido = { recomendado: "2026-10-01T10:00:00Z", sugerencia: { estado: "nuevo", actualizadoEn: "2026-10-01T10:00:00Z" }, seleccion: null, test: null, compra: null };

test("recién recomendado: está en Recomendado y lo demás pendiente", () => {
  const s = armarSeguimiento(base, "2026-10-05");
  assert.equal(s.actual, "recomendado");
  assert.equal(s.dias, 4);
  assert.equal(s.terminado, false);
  assert.equal(s.etapas.find((e) => e.clave === "completado")?.estado, "pendiente");
});

test("descartado en Sugerencias: termina en «No se seleccionó»", () => {
  const s = armarSeguimiento({ ...base, sugerencia: { estado: "descartado", actualizadoEn: "2026-10-03T00:00:00Z" } }, "2026-10-20");
  assert.equal(s.actual, "descartado");
  assert.equal(s.terminado, true);
  assert.equal(s.dias, 2);
});

test("en test: la etapa actual es En test", () => {
  const s = armarSeguimiento(
    { ...base, sugerencia: { estado: "seleccionado", actualizadoEn: "2026-10-02" }, seleccion: { estado: "en_test", creadoEn: "2026-10-02", enOfertaEn: "2026-10-03" }, test: { estado: "testeando", creadoEn: "2026-10-04", resultadoEn: null } },
    "2026-10-06",
  );
  assert.equal(s.actual, "test");
  assert.equal(s.winner, false);
});

test("fallido en el test: termina en «No pasó el test»", () => {
  const s = armarSeguimiento(
    { ...base, sugerencia: { estado: "seleccionado", actualizadoEn: "2026-10-02" }, seleccion: { estado: "en_test", creadoEn: "2026-10-02", enOfertaEn: null }, test: { estado: "fallido", creadoEn: "2026-10-04", resultadoEn: "2026-10-09" } },
    "2026-10-20",
  );
  assert.equal(s.actual, "resultado");
  assert.equal(s.terminado, true);
  assert.equal(s.dias, 8);
});

test("winner comprado y en camino: cuenta como winner y comprado, sigue abierto", () => {
  const s = armarSeguimiento(
    {
      ...base,
      sugerencia: { estado: "seleccionado", actualizadoEn: "2026-10-02" },
      seleccion: { estado: "en_test", creadoEn: "2026-10-02", enOfertaEn: "2026-10-03" },
      test: { estado: "winner", creadoEn: "2026-10-04", resultadoEn: "2026-10-08" },
      compra: { etapa: "tracking", anulada: false, etapas: { cotizar: "2026-10-09", produccion: "2026-10-12", tracking: "2026-10-20" } },
    },
    "2026-10-25",
  );
  assert.equal(s.actual, "camino");
  assert.equal(s.etapas.find((e) => e.clave === "llego")?.estado, "pendiente");
  assert.equal(s.winner && s.comprado, true);
  assert.equal(s.dias, 24);
});

test("% de acierto: winners sobre recomendados", () => {
  const a = armarSeguimiento(base, "2026-10-05");
  const b = armarSeguimiento(
    { ...base, sugerencia: { estado: "seleccionado", actualizadoEn: "2026-10-02" }, seleccion: { estado: "en_test", creadoEn: "2026-10-02", enOfertaEn: null }, test: { estado: "winner", creadoEn: "2026-10-04", resultadoEn: null } },
    "2026-10-05",
  );
  assert.deepEqual(aciertoCliente([a, b]), { recomendados: 2, winners: 1, comprados: 0, pct: 50 });
  assert.equal(aciertoCliente([]).pct, null);
});

test("exclusividad: pendiente mientras no esté disponible, vigente 30 días desde Completado y luego vencida", () => {
  const enCamino = armarSeguimiento(
    {
      ...base,
      sugerencia: { estado: "seleccionado", actualizadoEn: "2026-10-02" },
      seleccion: { estado: "en_test", creadoEn: "2026-10-02", enOfertaEn: null },
      test: { estado: "winner", creadoEn: "2026-10-04", resultadoEn: null },
      compra: { etapa: "tracking", anulada: false, etapas: { cotizar: "2026-10-09" } },
    },
    "2026-10-25",
  );
  assert.equal(exclusividadDe(enCamino, 30, "2026-10-25").estado, "pendiente");

  const disponible = armarSeguimiento(
    {
      ...base,
      sugerencia: { estado: "seleccionado", actualizadoEn: "2026-10-02" },
      seleccion: { estado: "en_test", creadoEn: "2026-10-02", enOfertaEn: null },
      test: { estado: "winner", creadoEn: "2026-10-04", resultadoEn: null },
      compra: { etapa: "completado", anulada: false, etapas: { cotizar: "2026-10-09", completado: "2026-11-01T15:00:00Z" } },
    },
    "2026-11-10",
  );
  assert.deepEqual(exclusividadDe(disponible, 30, "2026-11-10"), { dias: 30, estado: "vigente", desde: "2026-11-01", hasta: "2026-12-01", quedan: 21 });
  assert.equal(exclusividadDe(disponible, 30, "2026-12-02").estado, "vencida");
  assert.equal(exclusividadDe(disponible, 90, "2026-12-02").estado, "vigente");
});

test("exclusividad: no aplica si el recorrido terminó sin compra", () => {
  const s = armarSeguimiento({ ...base, sugerencia: { estado: "descartado", actualizadoEn: "2026-10-03" } }, "2026-10-20");
  assert.equal(exclusividadDe(s, 30, "2026-10-20").estado, "no_aplica");
});
