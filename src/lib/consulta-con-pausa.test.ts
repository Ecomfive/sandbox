import assert from "node:assert/strict";
import test from "node:test";
import { conPausaAlVolver } from "./consulta-con-pausa";

test("al volver a la pestaña se consulta solo si pasó la pausa desde la última consulta", () => {
  let t = 0;
  let vista = true;
  let veces = 0;
  const c = conPausaAlVolver(() => veces++, 20_000, () => vista, () => t);
  c.ahora(); // al entrar
  assert.equal(veces, 1);
  t = 5_000;
  c.alVolver(); // vuelve a los 5 s: no
  assert.equal(veces, 1);
  t = 21_000;
  c.alVolver(); // a los 21 s: sí
  assert.equal(veces, 2);
  t = 30_000;
  c.ahora(); // la vuelta del intervalo consulta siempre
  assert.equal(veces, 3);
  // Con la pestaña oculta no consulta ni cuenta como consultado: al volver, consulta.
  vista = false;
  t = 60_000;
  c.ahora();
  assert.equal(veces, 3);
  vista = true;
  t = 61_000;
  c.alVolver();
  assert.equal(veces, 4);
});

test("la primera vuelta a la pestaña consulta aunque no se haya consultado al entrar", () => {
  let veces = 0;
  const c = conPausaAlVolver(() => veces++, 20_000, () => true, () => 1_000);
  c.alVolver();
  assert.equal(veces, 1);
});
