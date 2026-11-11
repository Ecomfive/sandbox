import assert from "node:assert/strict";
import test from "node:test";
import { TABLAS_RESPALDO, carpetasABorrar, esTablaRespaldo, ordenDe, rutaArchivo, rutaValida, tablasPendientes } from "./respaldo";

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
