import assert from "node:assert/strict";
import test from "node:test";
import { analizarRuc, separarDv, validarRucDv } from "./ruc-panama";

// RUC inventados; los DV salen de la implementación de referencia del algoritmo de la DGI (panama-ruc-dv-calculator).
const CASOS: [string, string, string][] = [
  ["4-512-1987", "02", "natural"],
  ["8-1000-77", "79", "natural"],
  ["13-25-3001", "02", "natural"],
  ["E-8-123456", "04", "extranjero"],
  ["E-1234-12345", "26", "extranjero"],
  ["PE-9-777", "71", "panameno-extranjero"],
  ["N-20-1500", "04", "naturalizado"],
  ["8AV-12-345", "37", "antes-vigencia"],
  ["2PI-1234-56789", "09", "indigena"],
  ["2471893-1-821234", "38", "juridica"],
  ["155000-1-2015", "67", "juridica"], // jurídica antigua (referencia cruzada)
  ["30120-34-123456", "70", "juridica"],
  ["1000-200-3000", "60", "juridica"],
  ["8-NT-12-34567", "07", "natural-nt"],
  ["8-NT-123-123456", "71", "natural-nt"],
  ["8-NT-12-1234567", "00", "juridica-nt"],
];

test("calcula el DV de cada tipo de RUC", () => {
  for (const [ruc, dv, tipo] of CASOS) {
    const r = analizarRuc(ruc);
    assert.equal(r.valido, true, ruc);
    assert.equal(r.tipo, tipo, ruc);
    assert.ok(r.dvs.includes(dv), `${ruc}: ${r.dvs.join(",")} ≠ ${dv}`);
  }
  // Un NT con asiento de 6 cifras puede ser natural o jurídico: valen los dos.
  assert.ok(analizarRuc("3-NT-1-123456").dvs.includes("48"));
});

test("rechaza formatos que no son RUC", () => {
  for (const malo of ["", "ABC", "8-12", "8--12", "X-1-2", "99-1-2-3", "8-NT-1234-1", "1234567890-1-1", "1-12345-1"]) {
    assert.equal(analizarRuc(malo).valido, false, malo);
  }
});

test("separa el DV escrito junto al RUC y valida que coincida", () => {
  assert.deepEqual(separarDv("2471893-1-821234 DV 38"), { ruc: "2471893-1-821234", dv: "38" });
  assert.deepEqual(separarDv("4-512-1987 d.v. 2"), { ruc: "4-512-1987", dv: "02" });
  assert.equal(validarRucDv("2471893-1-821234 DV 38").error, null);
  assert.match(validarRucDv("2471893-1-821234", "39").error ?? "", /es 38/);
  // Sin DV escrito se completa el calculado.
  assert.equal(validarRucDv("4-512-1987").dv, "02");
  // Vacío es válido (proveedor del exterior).
  assert.equal(validarRucDv("").error, null);
  assert.ok(validarRucDv("hola").error);
});
