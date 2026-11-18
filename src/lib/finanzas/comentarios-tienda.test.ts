import { test } from "node:test";
import assert from "node:assert/strict";
import { clavePanel, filtrarHilos, puedeVerHilo, tramoSuyas, tramoTiendaEerr } from "./comentarios-tienda";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

test("tramoSuyas: la misma lista da el mismo tramo, sin importar el orden ni las mayúsculas", () => {
  assert.match(tramoSuyas([A]), /^suyas-[0-9a-f]{24}$/);
  assert.equal(tramoSuyas([A, B]), tramoSuyas([B.toUpperCase(), A]));
  assert.notEqual(tramoSuyas([A]), tramoSuyas([A, B]));
});

test("tramoTiendaEerr: la tienda elegida, «todas» sin límite y el suyo con límite", () => {
  assert.equal(tramoTiendaEerr(A, [A]), A);
  assert.equal(tramoTiendaEerr(null, null), "todas");
  assert.equal(tramoTiendaEerr(null, [A]), tramoSuyas([A]));
});

test("puedeVerHilo: sin límite, cualquiera", () => {
  assert.ok(puedeVerHilo("estado-resultados", "todo-usd-todas:ingresos|2026-03-01", null));
  assert.ok(puedeVerHilo("panel-financiero", "personas-activo", null));
});

test("puedeVerHilo en el EERR: sus tiendas y su «Todas», no la empresa ni otra tienda", () => {
  const p = [A];
  assert.ok(puedeVerHilo("estado-resultados", `todo-usd-${A}:ingresos|2026-03-01`, p));
  assert.ok(puedeVerHilo("estado-resultados", `PA-usd-${A}-interanual-2026-envios:ebitda|total-2026`, p));
  assert.ok(puedeVerHilo("estado-resultados", `todo-usd-${tramoSuyas(p)}:ingresos|2026-03-01`, p));
  assert.ok(!puedeVerHilo("estado-resultados", "todo-usd-todas:ingresos|2026-03-01", p));
  assert.ok(!puedeVerHilo("estado-resultados", `todo-usd-${B}:ingresos|2026-03-01`, p));
  assert.ok(!puedeVerHilo("estado-resultados", `todo-usd-${tramoSuyas([A, B])}:ingresos|2026-03-01`, p));
  assert.ok(!puedeVerHilo("estado-resultados", `${A}`, p));
  assert.ok(!puedeVerHilo("estado-resultados", "cualquier-cosa", p));
  assert.ok(!puedeVerHilo("estado-resultados", `todo-usd-todas:${A}|ingresos`, p));
  assert.ok(!puedeVerHilo("estado-resultados", `todo-usd-todas:x`, []));
});

test("puedeVerHilo en el Panel: solo las claves con su tramo", () => {
  const p = [A];
  assert.ok(puedeVerHilo("panel-financiero", clavePanel("resultados-todo", p), p));
  assert.ok(!puedeVerHilo("panel-financiero", "resultados-todo", p));
  assert.ok(!puedeVerHilo("panel-financiero", "personas-activo", p));
  assert.ok(!puedeVerHilo("panel-financiero", clavePanel("resultados-todo", [B]), p));
  assert.equal(clavePanel("caja-todo", null), "caja-todo");
});

test("filtrarHilos: deja solo los que puede ver", () => {
  const hilos = { "todo-usd-todas:ingresos|2026-03-01": 2, [`todo-usd-${A}:ingresos|2026-03-01`]: 1, [`todo-usd-${B}:ingresos|2026-03-01`]: 4 };
  assert.deepEqual(filtrarHilos(hilos, "estado-resultados", null), hilos);
  assert.deepEqual(filtrarHilos(hilos, "estado-resultados", [A]), { [`todo-usd-${A}:ingresos|2026-03-01`]: 1 });
});
