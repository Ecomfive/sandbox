import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fotoDeDrop, leerFechaDrop, leerInventarioDrop, leerPrecioDrop, margenDrop, nombreComparable, normalizarFilaDrop, publicacionesDeLectura } from "./lectura";

const fila = {
  dropId: "6ae5e72d907fa0ea62f7ff79",
  producto: "Rhodiola Rosea ID-ONWAG",
  sku: "Rhodiola Rosea",
  estado: "Activo",
  precio: "c5721.45",
  inventario: "494 total",
  creado: "31/10/2026, 08:03 a. m.",
  foto: "/_next/image?url=https%3A%2F%2Fstorage.googleapis.com%2Fboxful-drop-shipping-dev%2F6ae5-foto&w=3840&q=75",
};

describe("lectura de Drop", () => {
  it("lee el precio en colones con cualquier separador", () => {
    assert.equal(leerPrecioDrop("c5721.45"), 5721.45);
    assert.equal(leerPrecioDrop("₡5,721.45"), 5721.45);
    assert.equal(leerPrecioDrop("5.721,45"), 5721.45);
    assert.equal(leerPrecioDrop("c12,500"), 12500);
    assert.equal(leerPrecioDrop("c4303.9"), 4303.9);
    assert.equal(leerPrecioDrop(""), null);
    assert.equal(leerPrecioDrop("sin precio"), null);
  });

  it("lee el inventario", () => {
    assert.equal(leerInventarioDrop("494 total"), 494);
    assert.equal(leerInventarioDrop("0 total"), 0);
    assert.equal(leerInventarioDrop("1,200 total"), 1200);
    assert.equal(leerInventarioDrop("—"), null);
  });

  it("lee la fecha en la hora de Costa Rica", () => {
    assert.equal(leerFechaDrop("31/10/2026, 08:03 a. m."), "2026-10-31T14:03:00.000Z");
    assert.equal(leerFechaDrop("30/10/2026, 04:23 p. m."), "2026-10-30T22:23:00.000Z");
    assert.equal(leerFechaDrop("14/05/2026, 12:10 a. m."), "2026-05-14T06:10:00.000Z");
    assert.equal(leerFechaDrop("14/05/2026, 12:10 p. m."), "2026-05-14T18:10:00.000Z");
    // A las 7 p. m. en Costa Rica ya es el día siguiente en UTC.
    assert.equal(leerFechaDrop("31/12/2026, 07:30 p. m."), "2027-01-01T01:30:00.000Z");
    assert.equal(leerFechaDrop("31/02/2026, 08:00 a. m."), null);
    assert.equal(leerFechaDrop("ayer"), null);
  });

  it("saca la foto real de /_next/image y solo acepta https", () => {
    assert.equal(fotoDeDrop(fila.foto), "https://storage.googleapis.com/boxful-drop-shipping-dev/6ae5-foto");
    assert.equal(fotoDeDrop("https://cdn.example.com/a.png"), "https://cdn.example.com/a.png");
    assert.equal(fotoDeDrop("javascript:alert(1)"), null);
    assert.equal(fotoDeDrop("/_next/image?url=http%3A%2F%2Fx.com%2Fa.png"), null);
    assert.equal(fotoDeDrop(null), null);
  });

  it("revisa una fila: separa el nombre del ID corto", () => {
    assert.deepEqual(normalizarFilaDrop(fila), {
      dropId: "6ae5e72d907fa0ea62f7ff79",
      codigo: "ID-ONWAG",
      nombre: "Rhodiola Rosea",
      skuDrop: "Rhodiola Rosea",
      estado: "activo",
      precio: 5721.45,
      inventario: 494,
      creadoEnDrop: "2026-10-31T14:03:00.000Z",
      fotoUrl: "https://storage.googleapis.com/boxful-drop-shipping-dev/6ae5-foto",
    });
    assert.equal(normalizarFilaDrop({ ...fila, estado: "Inactivo" })?.estado, "inactivo");
  });

  it("descarta lo que no es una fila de Drop", () => {
    assert.equal(normalizarFilaDrop({ ...fila, dropId: "../../etc" }), null);
    assert.equal(normalizarFilaDrop({ ...fila, producto: "ID-ONWAG" }), null);
    assert.equal(normalizarFilaDrop("texto"), null);
    assert.equal(normalizarFilaDrop(null), null);
  });

  it("no repite la misma publicación de dos páginas", () => {
    const l = publicacionesDeLectura([fila, { ...fila, precio: "c1" }, { ...fila, dropId: "6ae5e6f1cbb73bded6ef03f5" }, "basura"]);
    assert.equal(l.length, 2);
    assert.equal(l[0].precio, 5721.45);
    assert.deepEqual(publicacionesDeLectura("no es lista"), []);
  });

  it("compara nombres sin tildes ni signos", () => {
    assert.equal(nombreComparable("Crema  Perfectx — Terapia Articular 30g"), "crema perfectx terapia articular 30g");
    assert.equal(nombreComparable("Clorofila Líquida"), nombreComparable("CLOROFILA LIQUIDA"));
  });

  it("calcula el margen en colones", () => {
    assert.deepEqual(margenDrop(5000, 2000, 840), { utilidad: 2160, margen: 0.432 });
    assert.deepEqual(margenDrop(5000, 2000, null), { utilidad: 3000, margen: 0.6 });
    assert.equal(margenDrop(5000, null, 840), null);
    assert.equal(margenDrop(0, 100, 0), null);
    assert.equal(margenDrop(null, 100, 0), null);
  });
});
