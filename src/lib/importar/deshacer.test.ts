import assert from "node:assert/strict";
import test from "node:test";
import { TABLAS_IMPORTADAS, MODULOS_DESHACER, columnasDeshacer, decidirDeshacer, filaCreada, nuevasYActualizadas, sumarDecisiones, textoConservadas } from "./deshacer";
import { ORDEN_CARGA } from "./reconocer";

const cerrados = new Set(["2026-01-01"]);

test("todos los importadores tienen sus tablas para deshacer", () => {
  assert.deepEqual([...MODULOS_DESHACER].sort(), [...ORDEN_CARGA].sort());
});

test("deshacer no borra lo corregido a mano ni lo de un mes cerrado", () => {
  const t = TABLAS_IMPORTADAS["libro-movimientos"][0];
  const d = decidirDeshacer(
    t,
    [
      { id: "a", fechas: ["2026-02-01", "2026-02-10"] },
      { id: "b", fechas: ["2026-02-01", null], editado: true },
      { id: "c", fechas: ["2026-02-01", "2026-01-31"] },
    ],
    cerrados,
  );
  assert.deepEqual(d.borrar, ["a"]);
  assert.deepEqual(d.conservadas, { editadas: 1, enMesCerrado: 1, protegidas: 0 });
});

test("deliverys: lo que ya entró a un cierre del repartidor se conserva", () => {
  const t = TABLAS_IMPORTADAS.deliverys[0];
  const filas = [
    filaCreada(t, { id: "x", fecha: "2026-03-05", cierre_id: null }, new Set()),
    filaCreada(t, { id: "y", fecha: "2026-03-05", cierre_id: "c1" }, new Set()),
  ];
  const d = decidirDeshacer(t, filas, cerrados);
  assert.deepEqual(d.borrar, ["x"]);
  assert.equal(d.conservadas.protegidas, 1);
});

test("conciliación: solo se borran las líneas pendientes y los cobros sin pareja", () => {
  const [lineas, cobros] = TABLAS_IMPORTADAS["conciliacion-bancaria"];
  const dl = decidirDeshacer(lineas, [filaCreada(lineas, { id: "1", fecha: "2026-03-01", estado: "pendiente" }, new Set()), filaCreada(lineas, { id: "2", fecha: "2026-03-01", estado: "conciliada" }, new Set())], cerrados);
  assert.deepEqual(dl.borrar, ["1"]);
  const dc = decidirDeshacer(cobros, [filaCreada(cobros, { id: "3", fecha: "2026-03-01" }, new Set(["3"])), filaCreada(cobros, { id: "4", fecha: "2026-03-01" }, new Set())], cerrados);
  assert.deepEqual(dc.borrar, ["4"]);
  const s = sumarDecisiones([dl, dc]);
  assert.equal(s.borrar.length, 2);
  assert.equal(textoConservadas(s.conservadas, ["ya conciliadas"]), "2 ya conciliadas");
});

test("columnas a leer y nuevas contra actualizadas", () => {
  assert.deepEqual(columnasDeshacer(TABLAS_IMPORTADAS.nomina[0]), ["id", "periodo", "editado_a_mano"]);
  assert.deepEqual(nuevasYActualizadas(10, 3), { nuevas: 3, actualizadas: 7 });
  assert.deepEqual(nuevasYActualizadas(2, 5), { nuevas: 5, actualizadas: 0 });
});
