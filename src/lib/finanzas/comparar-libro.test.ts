import assert from "node:assert/strict";
import test from "node:test";
import { compararLibro, type FilaComparable } from "./comparar-libro";

const F = (clave: string, x: Partial<FilaComparable> = {}): FilaComparable => ({
  clave,
  periodo: "2026-03-01",
  fecha_pago: "2026-03-05",
  fecha_servicio: null,
  tienda: "TIENDA UNO",
  tipo: "Packaging",
  descripcion: "CAJAS DE CARTON",
  monto: 100,
  cuenta: "BANCO X",
  en_eerr: true,
  en_flujo: true,
  factura_numero: null,
  ruc_proveedor: null,
  ...x,
});

test("separa lo que se agrega, lo que cambia y lo que ya no viene", () => {
  const base = [
    F("a"),
    F("b", { descripcion: "ALQUILER", monto: 500 }), // en el archivo con otro monto (otra huella)
    F("c", { descripcion: "LUZ", monto: 80 }), // ya no viene
    F("d", { descripcion: "AGUA", monto: 20, en_eerr: true, editado: true }), // misma huella, otro EERR, editada a mano
  ];
  const archivo = [
    F("a"),
    F("b2", { descripcion: "Alquiler", monto: 550 }),
    F("d", { descripcion: "AGUA", monto: 20, en_eerr: false }),
    F("e", { descripcion: "INTERNET", monto: 45 }),
  ];
  const r = compararLibro(archivo, base);
  assert.equal(r.iguales, 1);
  assert.deepEqual(r.agrega.map((f) => f.clave), ["e"]);
  assert.deepEqual(r.quita.map((f) => f.clave), ["c"]);
  assert.equal(r.cambia.length, 2);
  const agua = r.cambia.find((c) => c.antes.clave === "d")!;
  assert.deepEqual(agua.campos, [{ campo: "EERR", antes: "Sí", despues: "No" }]);
  assert.equal(agua.conservado, true);
  const alquiler = r.cambia.find((c) => c.antes.clave === "b")!;
  assert.deepEqual(alquiler.campos, [{ campo: "Monto", antes: "500.00", despues: "550.00" }]); // descripción igual sin mayúsculas
});

test("tienda y tipo se comparan como en el catálogo (sin acentos ni mayúsculas)", () => {
  const r = compararLibro([F("a", { tienda: "Tienda Uno", tipo: "packaging" })], [F("a")]);
  assert.equal(r.cambia.length, 0);
  assert.equal(r.iguales, 1);
});
