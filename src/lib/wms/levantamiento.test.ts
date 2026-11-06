import { test } from "node:test";
import assert from "node:assert/strict";
import { itemsParaSumar, quedaDespues, repartirFilas, revisarConteo, varianteDeLinea } from "./levantamiento";

const A = "0194f0a2-0000-7000-8000-000000000001";
const B = "0194f0a2-0000-7000-8000-000000000002";

test("acepta productos simples y con lotes", () => {
  const r = revisarConteo([{ sku: A, cantidad: "147" }, { sku: B, lotes: [{ codigo: "  L1 ", vencimiento: "2030-01-01", cantidad: 10 }, { codigo: "L2", vencimiento: null, cantidad: 0 }] }]);
  assert.deepEqual(r, { items: [{ sku: A, cantidad: 147 }, { sku: B, lotes: [{ codigo: "L1", vencimiento: "2030-01-01", cantidad: 10 }, { codigo: "L2", vencimiento: null, cantidad: 0 }] }] });
});

test("cero es una cantidad válida (se contó y no había)", () => {
  assert.deepEqual(revisarConteo([{ sku: A, cantidad: 0 }]), { items: [{ sku: A, cantidad: 0 }] });
});

test("rechaza lo que no sirve", () => {
  assert.ok("error" in revisarConteo([]));
  assert.ok("error" in revisarConteo([{ sku: "x", cantidad: 1 }]));
  assert.ok("error" in revisarConteo([{ sku: A, cantidad: -1 }]));
  assert.ok("error" in revisarConteo([{ sku: A, cantidad: 1.5 }]));
  assert.ok("error" in revisarConteo([{ sku: A, cantidad: "" }]));
  assert.ok("error" in revisarConteo([{ sku: A, cantidad: 1 }, { sku: A, cantidad: 2 }]));
  assert.ok("error" in revisarConteo([{ sku: B, lotes: [{ codigo: "", cantidad: 1 }] }]));
  assert.ok("error" in revisarConteo([{ sku: B, lotes: [{ codigo: "L1", cantidad: 1 }, { codigo: "l1", cantidad: 2 }] }]));
  assert.ok("error" in revisarConteo([{ sku: B, lotes: [{ codigo: "L1", vencimiento: "31/12/2030", cantidad: 1 }] }]));
});

import { leerLista } from "./levantamiento";

test("lee una lista con punto y coma, tabulador o coma, y salta el encabezado", () => {
  const r = leerLista("﻿Producto;Oficina\nAceite de Batana;850\nBolsas de rollo 17*30;29,900\nLemme Burn\t3.208\nKing Maker,201\nSin cantidad;\n\n");
  assert.deepEqual(r.lineas, [
    { nombre: "Aceite de Batana", cantidad: 850 },
    { nombre: "Bolsas de rollo 17*30", cantidad: 29900 },
    { nombre: "Lemme Burn", cantidad: 3208 },
    { nombre: "King Maker", cantidad: 201 },
  ]);
  assert.equal(r.saltadas, 2);
});

test("una cantidad que no es un número entero se salta", () => {
  assert.deepEqual(leerLista("A;-3\nB;1.5\nC;abc").lineas, []);
});

test("la línea elige su variante: color y talla, graduación escrita de cualquier forma, y nada si no se sabe cuál", () => {
  const faja = ["Beige", "Negro"].flatMap((Color) => ["S", "M", "L", "XL", "XXL"].map((Talla) => ({ id: `${Color}/${Talla}`, opciones: { Color, Talla } })));
  assert.equal(varianteDeLinea("Faja Body Entero FullBody Negro S", faja), "Negro/S");
  assert.equal(varianteDeLinea("Faja Body Entero FullBody Beige XXL", faja), "Beige/XXL");
  assert.equal(varianteDeLinea("Faja Body Beige 2XL", faja), "Beige/XXL");
  assert.equal(varianteDeLinea("Faja Body Entero FullBody Negro", faja), null, "sin talla no se adivina");
  const lentes = ["+1.00", "+1.50", "+4.00"].map((g) => ({ id: g, opciones: { Graduación: g } }));
  assert.equal(varianteDeLinea("Lente de Calidad +150", lentes), "+1.50");
  assert.equal(varianteDeLinea("Lente de Calidad +4.00", lentes), "+4.00");
  assert.equal(varianteDeLinea("Lente de Calidad 1:00", lentes), "+1.00");
  assert.equal(varianteDeLinea("Lente de Calidad +250", lentes), null);
  assert.equal(varianteDeLinea("Corrector de Postura Ortopédico XL", [{ id: "L", opciones: { Talla: "L" } }, { id: "XL", opciones: { Talla: "XL" } }]), "XL");
  assert.equal(varianteDeLinea("Algo", [{ id: "x", opciones: null }]), null);
});

test("cada fila dice lo suyo: contado, sumar o los dos", () => {
  // Contado y sumar: una sola cifra al conteo. Solo sumar: entra sobre lo que hay. Un 0 contado es un conteo; un 0 por sumar no hace nada.
  const filas = [
    { sku: "a", contado: 100, sumar: null },
    { sku: "b", contado: 100, sumar: 50 },
    { sku: "c", contado: null, sumar: 50 },
    { sku: "d", contado: 0, sumar: null },
    { sku: "e", contado: null, sumar: 0 },
    { sku: "f", contado: null, sumar: null },
  ];
  assert.deepEqual(repartirFilas(filas), {
    contados: [{ sku: "a", cantidad: 100 }, { sku: "b", cantidad: 150 }, { sku: "d", cantidad: 0 }],
    sumas: [{ sku: "c", cantidad: 50 }],
  });
  assert.equal(quedaDespues(null, 50, 100), 150);
  assert.equal(quedaDespues(80, 50, 100), 130);
  assert.equal(quedaDespues(80, null, 100), 80);
});

test("una fila con lotes: contar un lote cuenta la fila; si solo se suma, solo entran esos lotes", () => {
  const L = (codigo: string, contado: number | null, sumar: number | null) => ({ codigo, vencimiento: null, contado, sumar });
  assert.deepEqual(repartirFilas([{ sku: "a", lotes: [L("L1", 10, 5), L("L2", null, 3), L("L3", null, null), L(" ", 9, 9)] }]), {
    contados: [{ sku: "a", lotes: [{ codigo: "L1", vencimiento: null, cantidad: 15 }, { codigo: "L2", vencimiento: null, cantidad: 3 }, { codigo: "L3", vencimiento: null, cantidad: 0 }] }],
    sumas: [],
  });
  assert.deepEqual(repartirFilas([{ sku: "b", lotes: [L("L1", null, 5), L("L2", null, null)] }]), { contados: [], sumas: [{ sku: "b", lotes: [{ codigo: "L1", vencimiento: null, cantidad: 5 }] }] });
  assert.deepEqual(repartirFilas([{ sku: "c", lotes: [L("L1", null, null)] }]), { contados: [], sumas: [] });
});

test("para sumar solo cuenta lo que entra", () => {
  const items = [
    { sku: A, cantidad: 25 },
    { sku: B, cantidad: 0 },
    { sku: "c", lotes: [{ codigo: "L1", vencimiento: null, cantidad: 5 }, { codigo: "L2", vencimiento: null, cantidad: 0 }] },
    { sku: "d", lotes: [{ codigo: "L3", vencimiento: null, cantidad: 0 }] },
  ];
  assert.deepEqual(itemsParaSumar(items), [{ sku: A, cantidad: 25 }, { sku: "c", lotes: [{ codigo: "L1", vencimiento: null, cantidad: 5 }] }]);
});
