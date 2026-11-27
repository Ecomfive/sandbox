import { test } from "node:test";
import assert from "node:assert/strict";
import { agruparPorTienda, avisoFotos, avisoPregunta, cuandoCorto, avisoRespuesta, leerCantidad, leerTipo, limpiarNota, MAX_FOTOS_POR_SUBIDA, rutasDeFotosValidas, tiendasDePersona } from "./reglas";

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

test("al responder, el inventario de Despacho se ajusta a lo contado, salvo lo que no se puede ajustar sin lote o variante", async () => {
  const { decidirConteoDespacho } = await import("./reglas");
  const base = { actual: 120, cantidad: 98, tipo: "simple", clase: "fisico", manejaVencimiento: false, conVariantes: false };
  assert.deepEqual(decidirConteoDespacho(base), { tipo: "ajustar", diferencia: -22 });
  assert.deepEqual(decidirConteoDespacho({ ...base, cantidad: 130 }), { tipo: "ajustar", diferencia: 10 });
  assert.deepEqual(decidirConteoDespacho({ ...base, cantidad: 120 }), { tipo: "igual" });
  assert.deepEqual(decidirConteoDespacho({ ...base, actual: -3, cantidad: 0 }), { tipo: "ajustar", diferencia: 3 });
  for (const caso of [{ tipo: "combo" }, { clase: "test" }, { manejaVencimiento: true }, { conVariantes: true }]) assert.equal(decidirConteoDespacho({ ...base, ...caso }).tipo, "no");
});

test("el motivo del ajuste dice quién contó, quién pidió y de cuánto a cuánto", async () => {
  const { motivoConteoDespacho } = await import("./reglas");
  assert.equal(motivoConteoDespacho({ quien: "Yiletsi", pidio: "Nicol", antes: 120, despues: 98 }), "Conteo de despacho (¿Cuánto hay?) de Yiletsi, pedido por Nicol: 120 → 98");
  assert.equal(motivoConteoDespacho({ quien: "Yiletsi", pidio: null, antes: 0, despues: 5 }), "Conteo de despacho (¿Cuánto hay?) de Yiletsi: 0 → 5");
});

test("lo que se pide: contar (por defecto) o fotos reales", () => {
  assert.equal(leerTipo("fotos"), "fotos");
  assert.equal(leerTipo("cantidad"), "cantidad");
  assert.equal(leerTipo("otra cosa"), "cantidad");
  assert.equal(leerTipo(undefined), "cantidad");
});

test("el aviso a despacho dice si piden fotos o preguntan cuánto hay", () => {
  assert.deepEqual(avisoPregunta({ producto: "Extracto de ajo", tienda: "Proveeduría", nota: null, tipo: "fotos" }, "Nicole"), { titulo: "Proveeduría pide fotos reales de Extracto de ajo", texto: "Nicole pide fotos reales." });
  assert.equal(avisoPregunta({ producto: "Extracto de ajo", tienda: "Kenku", nota: "las dos caras", tipo: "fotos" }, "Ana").texto, "Ana: «las dos caras»");
  assert.equal(avisoPregunta({ producto: "Extracto de ajo", tienda: "Kenku", nota: null }, "Ana").titulo, "Kenku pregunta cuánto hay de Extracto de ajo");
});

test("el aviso de las fotos subidas dice cuántas son", () => {
  assert.equal(avisoFotos({ producto: "Faja", tienda: "Proveeduría" }, 1, "Yiletsi").texto, "Yiletsi subió 1 foto de Faja para Proveeduría.");
  assert.equal(avisoFotos({ producto: "Faja", tienda: "Proveeduría" }, 3, "Yiletsi").titulo, "Fotos reales · Faja (3)");
});

test("solo se registran rutas de la carpeta de ese pedido, sin repetir y con un máximo", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const buena = `fotos/${id}/a-foto.jpg`;
  assert.deepEqual(rutasDeFotosValidas([buena, buena, `fotos/${id}/b.png`], id), [buena, `fotos/${id}/b.png`]);
  assert.deepEqual(rutasDeFotosValidas([`fotos/otro/a.jpg`, `fotos/${id}/../x.jpg`, `fotos/${id}/sub/a.jpg`, `/fotos/${id}/a.jpg`, `fotos/${id}/`, 5, null], id), []);
  assert.deepEqual(rutasDeFotosValidas("no es lista", id), []);
  const muchas = Array.from({ length: 20 }, (_, i) => `fotos/${id}/f${i}.jpg`);
  assert.equal(rutasDeFotosValidas(muchas, id).length, MAX_FOTOS_POR_SUBIDA);
});
