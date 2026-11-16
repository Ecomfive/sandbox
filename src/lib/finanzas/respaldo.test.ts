import assert from "node:assert/strict";
import test from "node:test";
import { TABLAS_RESPALDO, carpetasABorrar, compararRespaldo, esTablaRespaldo, ordenDe, rutaArchivo, rutaValida, tablasPendientes, verificacionGuardada } from "./respaldo";

test("solo tablas financieras, sin repetir", () => {
  assert.equal(new Set(TABLAS_RESPALDO).size, TABLAS_RESPALDO.length);
  for (const t of TABLAS_RESPALDO) assert.match(t, /^(fin|nom|ven|conc|del|cli)_/);
  assert.ok(esTablaRespaldo("fin_movimientos"));
  assert.ok(!esTablaRespaldo("perfiles"));
  assert.deepEqual(ordenDe("fin_config"), ["clave"]);
  assert.deepEqual(ordenDe("fin_movimientos"), ["id"]);
});

test("rutas: carpeta con fecha y tabla de la lista", () => {
  assert.equal(rutaArchivo("2026-10-18", "fin_cartera"), "2026-10-18/fin_cartera.json.gz");
  assert.ok(rutaValida("2026-10-18/fin_cartera.json.gz"));
  assert.ok(!rutaValida("../2026-10-18/fin_cartera.json.gz"));
  assert.ok(!rutaValida("2026-10-18/perfiles.json.gz"));
  assert.ok(!rutaValida(5));
});

test("se conservan las N más nuevas y se sigue lo que falta", () => {
  assert.deepEqual(carpetasABorrar(["2026-10-04", "2026-10-18", "2026-10-11", "x"], 2), ["2026-10-04"]);
  assert.deepEqual(carpetasABorrar(["2026-10-04"], 0), []);
  assert.equal(tablasPendientes([...TABLAS_RESPALDO]).length, 0);
  assert.equal(tablasPendientes(["fin_config"])[0], "fin_entidades");
});

test("verificación del respaldo: ok, ilegible, incompleto y lo que no alcanzó", () => {
  const [a, b, c, d] = TABLAS_RESPALDO;
  const v = compararRespaldo({ [a]: 10, [b]: 5, [c]: 3, [d]: -1 }, { [a]: 10, [b]: null }, { [a]: 12 });
  assert.equal(v.ok, false);
  assert.deepEqual(v.tablas.map((t) => t.estado), ["ok", "ilegible"]);
  assert.equal(v.tablas[0].actual, 12);
  assert.deepEqual(v.faltan, [c]);
  assert.equal(compararRespaldo({ [a]: 2 }, { [a]: 1 }, {}).tablas[0].estado, "incompleto");
  assert.equal(compararRespaldo({ [a]: 2 }, { [a]: 2 }, {}).ok, true);
  assert.equal(verificacionGuardada({ ok: true, tablas: [], faltan: [] })?.ok, true);
  assert.equal(verificacionGuardada({ ok: "si" }), null);
});
