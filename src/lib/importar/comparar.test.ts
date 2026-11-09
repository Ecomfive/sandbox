import assert from "node:assert/strict";
import test from "node:test";
import { compararLibro } from "@/lib/finanzas/comparar-libro";
import { TABLAS_COMPARAR, comparable, docCartera, enTandas, esModuloComparable, igualarTiendaVacia } from "./comparar";
import { ORDEN_CARGA } from "./reconocer";

// Datos inventados.
test("todos los importadores salvo el libro se pueden comparar", () => {
  assert.deepEqual(
    Object.keys(TABLAS_COMPARAR).sort(),
    ORDEN_CARGA.filter((m) => m !== "libro-movimientos").sort(),
  );
  assert.ok(!esModuloComparable("libro-movimientos"));
});

test("lo de la base y lo del archivo se comparan en la misma forma", () => {
  const [cartera] = TABLAS_COMPARAR["cuentas-por-cobrar"];
  const base = cartera.fila({ origen_clave: "a#1", fecha: "2026-03-04", contraparte: "Cliente X", documento: "F-1", monto: "100", editado_a_mano: true, fin_unidades: { nombre: "TIENDA" } });
  assert.equal(base.descripcion, docCartera("F-1", "Cliente X"));
  assert.equal(base.periodo, "2026-03-01");
  assert.equal(base.editado, true);
  const archivo = [comparable("a#1", "2026-03-04", "F-1 · Cliente X", "TIENDA", 120), comparable("b#1", "2026-03-05", "F-2 · Cliente Y", "TIENDA", 50)];
  const c = compararLibro(archivo, [base, comparable("z#1", "2026-02-01", "F-0 · Viejo", "TIENDA", 10)]);
  assert.equal(c.agrega.length, 1);
  assert.equal(c.cambia.length, 1);
  assert.equal(c.cambia[0].conservado, true);
  assert.deepEqual(c.cambia[0].campos.map((x) => x.campo), ["Monto"]);
  assert.equal(c.quita.length, 1);
});

test("una fecha vacía no inventa un mes; tandas y tienda vacía de la nómina", () => {
  assert.equal(comparable("x", "", "Lote", "", 1).periodo, "");
  assert.deepEqual(enTandas([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  const r = igualarTiendaVacia([comparable("n1", "2026-03-01", "Ana · 1ª", "", 300)], [comparable("n1", "2026-03-01", "Ana · 1ª", "TIENDA", 300)]);
  assert.equal(r[0].tienda, "TIENDA");
});
