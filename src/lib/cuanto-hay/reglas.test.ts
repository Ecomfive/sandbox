import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparPorTienda, avisoPregunta, cuandoCorto, avisoRespuesta, leerCantidad, limpiarNota, tiendasDePersona } from "./reglas";

test("la nota se limpia y una vacía no se guarda", () => {
  assert.equal(limpiarNota("  es para   un cambio \n"), "es para un cambio");
  assert.equal(limpiarNota("   "), null);
  assert.equal(limpiarNota(5), null);
  assert.equal(limpiarNota("x".repeat(400))?.length, 300);
});

test("la cantidad es un entero de 0 en adelante", () => {
  assert.equal(leerCantidad("14"), 14);
  assert.equal(leerCantidad(0), 0);
  assert.equal(leerCantidad(" 3 "), 3);
  assert.equal(leerCantidad("-1"), null);
  assert.equal(leerCantidad("2.5"), null);
  assert.equal(leerCantidad(2.5), null);
  assert.equal(leerCantidad(""), null);
  assert.equal(leerCantidad("abc"), null);
  assert.equal(leerCantidad(2_000_000), null);
});

test("se agrupan por tienda, en el orden de las tiendas y la más vieja primero; una tienda sin preguntas no sale", () => {
  const tiendas = [
    { id: "k", nombre: "Kenku" },
    { id: "o", nombre: "Oferfy" },
    { id: "n", nombre: "Nuvo" },
  ];
  const g = agruparPorTienda(
    [
      { id: "1", tiendaId: "o", creadoEn: "2026-11-16T10:00:00Z" },
      { id: "2", tiendaId: "k", creadoEn: "2026-11-16T12:00:00Z" },
      { id: "3", tiendaId: "k", creadoEn: "2026-11-16T09:00:00Z" },
    ],
    tiendas,
  );
  assert.deepEqual(
    g.map((x) => [x.tienda.nombre, x.preguntas.map((p) => p.id)]),
    [
      ["Kenku", ["3", "2"]],
      ["Oferfy", ["1"]],
    ],
  );
});

test("sin tiendas asignadas pregunta en todas; con tiendas asignadas, solo en las suyas", () => {
  const tiendas = [
    { id: "k", unidad: "U-KENKU" },
    { id: "o", unidad: "u-oferfy" },
    { id: "x", unidad: null },
  ];
  assert.deepEqual(tiendasDePersona(tiendas, null, (t) => t.unidad).map((t) => t.id), ["k", "o", "x"]);
  assert.deepEqual(tiendasDePersona(tiendas, ["u-kenku"], (t) => t.unidad).map((t) => t.id), ["k"]);
  assert.deepEqual(tiendasDePersona(tiendas, [], (t) => t.unidad), []);
});

test("los avisos dicen la tienda, el producto y la cantidad", () => {
  assert.deepEqual(avisoRespuesta({ producto: "Extracto de ajo", tienda: "Kenku" }, 1400, "Yiletsi"), {
    titulo: "Hay 1,400 · Extracto de ajo",
    texto: "Yiletsi respondió tu pregunta de Kenku: hay 1,400 de Extracto de ajo.",
  });
  assert.equal(avisoPregunta({ producto: "Extracto de ajo", tienda: "Kenku", nota: "para un cambio" }, "Ana").texto, "Ana: «para un cambio»");
  assert.equal(avisoPregunta({ producto: "Extracto de ajo", tienda: "Kenku", nota: null }, "Ana").titulo, "Kenku pregunta cuánto hay de Extracto de ajo");
});

test("cuándo, en hora de Panamá", () => {
  const ahora = new Date("2026-11-16T17:00:00Z"); // 12:00 en Panamá
  assert.equal(cuandoCorto("2026-11-16T16:58:00Z", ahora), "hace 2 min");
  assert.equal(cuandoCorto("2026-11-16T14:40:00Z", ahora), "hoy 09:40");
  assert.equal(cuandoCorto("2026-11-15T21:10:00Z", ahora), "ayer 16:10");
  assert.match(cuandoCorto("2026-11-14T21:10:00Z", ahora), /^14 nov 16:10$/);
});
