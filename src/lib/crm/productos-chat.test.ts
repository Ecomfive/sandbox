import assert from "node:assert/strict";
import { test } from "node:test";
import { cuantoFalta, diasHasta, idsDropiEnTexto, productosDeLaConversacion, productosMencionados, productosPorPalabra } from "./productos-chat";

// Se corre con: npm run test:seguridad (incluye estas pruebas del CRM)

const CATALOGO = [
  { id: "1", nombre: "Aceite de Semilla de Calabaza", codigo: "ACEITE/SEMILLA/CALABAZA" },
  { id: "2", nombre: "Vivonu Aceite de Semilla de Calabaza", codigo: "VIVONU/ACEITE/SEMILLA" },
  { id: "3", nombre: "Cutting Mix", codigo: "CUTTING/MIX" },
  { id: "4", nombre: "Aceite de Oregano 300 capsulas Blanco", codigo: "ACEITE/OREGANO" },
  { id: "5", nombre: "Shilajit", codigo: "SHILAJIT" },
  { id: "6", nombre: "Mix", codigo: "MIX" },
];

test("encuentra los productos que pregunta el dropshipper (el chat de Gisav Panamá)", () => {
  const r = productosMencionados("Buen día cuando podrá tener el cutting mix y semilla de calabaza", CATALOGO).map((p) => p.id);
  // El producto base antes que su versión de otra marca; una palabra corta suelta («mix») no basta, ni «aceite» solo.
  assert.deepEqual(r, ["3", "1", "2"]);
});

test("sin tildes ni mayúsculas, y una sola palabra larga cuenta", () => {
  assert.deepEqual(productosMencionados("¿Tienen SHILAJIT? y el aceite de orégano", CATALOGO).map((p) => p.id), ["5", "4"]);
  assert.deepEqual(productosMencionados("hola, buenas tardes", CATALOGO), []);
});

test("cuánto falta para la llegada", () => {
  assert.equal(diasHasta("2026-11-12", "2026-10-29T15:00:00Z"), 14);
  assert.equal(cuantoFalta("2026-11-12", "2026-10-29"), "en 14 días");
  assert.equal(cuantoFalta("2026-10-30", "2026-10-29"), "mañana");
  assert.equal(cuantoFalta("2026-10-29", "2026-10-29"), "hoy");
  assert.equal(cuantoFalta("2026-10-26", "2026-10-29"), "atrasada 3 días");
});

const CREATINAS = [
  { id: "c1", nombre: "Creatina For Women", codigo: "CREATINA/FOR/WOMEN" },
  { id: "c2", nombre: "Creatina Monohidratada Gomitas", codigo: "CREATINA/GOMITAS" },
  { id: "c3", nombre: "Creatina 300g", codigo: "CREATINA/300" },
  { id: "c4", nombre: "Creatina en polvo", codigo: "CREATINA/POLVO" },
  { id: "p1", nombre: "Producto de Prueba", codigo: "PRUEBA/X" },
];

test("una sola palabra que dice cuál es el producto («para la creatina»), solo entre lo que se vende en el país", () => {
  // Entre lo que se vende en Panamá hay una sola creatina: esa.
  assert.deepEqual(productosPorPalabra("Para la creatina", [CREATINAS[0], CATALOGO[2]]).map((p) => p.id), ["c1"]);
  // En plural también.
  assert.deepEqual(productosPorPalabra("tienen creatinas?", [CREATINAS[0]]).map((p) => p.id), ["c1"]);
  // Si la palabra sale en más de 3 productos no dice cuál.
  assert.deepEqual(productosPorPalabra("Para la creatina", CREATINAS), []);
  // Las palabras de la charla nunca bastan, aunque salgan en un nombre.
  assert.deepEqual(productosPorPalabra("es una prueba", CREATINAS), []);
});

test("los ID de Dropi se reconocen después de «ID» o solos, no los precios ni las guías", () => {
  assert.deepEqual(idsDropiEnTexto("El ID es 51188"), ["51188"]);
  assert.deepEqual(idsDropiEnTexto("id: 62783 y ID51190"), ["62783", "51190"]);
  assert.deepEqual(idsDropiEnTexto("  51188 "), ["51188"]);
  assert.deepEqual(idsDropiEnTexto("cuesta 25000 y la guía 123456789"), []);
  assert.deepEqual(idsDropiEnTexto(null), []);
});

test("recuerda toda la conversación: lo más reciente primero, con la frase y cuántas veces", () => {
  const vendidos = [CREATINAS[0], CATALOGO[0], CATALOGO[2]];
  const porId = new Map([["51188", CATALOGO[4]]]);
  const r = productosDeLaConversacion(
    [
      { direccion: "entrante", texto: "cuando llega la semilla de calabaza", momento: "2026-10-20T10:00:00Z" },
      { direccion: "entrante", texto: "Pregunta", momento: "2026-10-29T14:22:00Z" },
      { direccion: "entrante", texto: "Si salió el id", momento: "2026-10-29T14:23:00Z" },
      { direccion: "entrante", texto: "Para la creatina", momento: "2026-10-29T14:23:30Z" },
      { direccion: "saliente", texto: "Sí, claro. El ID es 51188", momento: "2026-10-29T14:29:00Z" },
      { direccion: "entrante", texto: "y el cutting mix?", momento: "2026-10-21T10:00:00Z" },
      { direccion: "entrante", texto: "Buen día cuando podrá tener el cutting mix y semilla de calabaza", momento: "2026-10-19T10:00:00Z" },
      { direccion: "entrante", texto: "otra vez: semilla de calabaza", momento: "2026-10-22T10:00:00Z" },
      { direccion: "nota", texto: "creatina", momento: "2026-10-29T15:00:00Z" },
    ],
    [...CATALOGO, ...CREATINAS],
    vendidos,
    porId,
  );
  assert.deepEqual(
    r.map((x) => [x.p.id, x.mencion.como, x.mencion.veces]),
    [
      ["5", "id", 1],
      ["c1", "palabra", 1],
      // La de Vivonu (2) también se llama «semilla de calabaza», pero no se vende en este país.
      ["1", "nombre", 3],
      ["3", "nombre", 2],
    ],
  );
  assert.equal(r[1].mencion.cita, "Para la creatina");
  assert.equal(r[0].mencion.direccion, "saliente");
  assert.equal(r[2].mencion.momento, "2026-10-22T10:00:00Z");
  // Si lo que nombra no se vende en el país, vale lo del catálogo; sin país, todo el catálogo.
  const fuera = productosDeLaConversacion([{ direccion: "entrante", texto: "y el aceite de orégano?", momento: "2026-10-29T10:00:00Z" }], CATALOGO, vendidos, new Map());
  assert.deepEqual(fuera.map((x) => x.p.id), ["4"]);
  // Lo que se vende en el país y lo nombrado con dos palabras que no se vende allá salen juntos (el chat de Gisav, sin Cutting Mix en el país).
  const gisav = productosDeLaConversacion([{ direccion: "entrante", texto: "cuando podrá tener el cutting mix y semilla de calabaza", momento: "2026-10-29T10:00:00Z" }], CATALOGO, [CATALOGO[0]], new Map());
  assert.deepEqual(gisav.map((x) => x.p.id), ["1", "3"]);
  const sinPais = productosDeLaConversacion([{ direccion: "entrante", texto: "Para la creatina", momento: "2026-10-29T10:00:00Z" }], [CREATINAS[0], ...CATALOGO], [], new Map());
  assert.deepEqual(sinPais.map((x) => x.p.id), ["c1"]);
});
