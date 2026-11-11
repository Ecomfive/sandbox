import assert from "node:assert/strict";
import test from "node:test";
import { catalogoDunamixfy, fotoDunamixfy, idDeProveedorDunamixfy, normalizarCompetenciaDunamixfy } from "./dunamixfy";

const inv = (extra: Record<string, unknown> = {}) => ({ precio: 5899, sugerido: 15000, stock: 86, activo: true, eliminado: false, privado: false, ...extra });
const producto = (extra: Record<string, unknown> = {}) => ({
  num: 837,
  nombre: "  ACEITE   TRULY ",
  proveedorId: "cmhq3x0aa0001abcd1234efgh",
  proveedor: "Dunamix NS",
  categoria: "Salud y Bienestar",
  creado: "2026-11-09T21:52:49.953Z",
  foto: "https://pub-faea91bb41dc46c1befa25688e8d9876.r2.dev/products/8f094a0b.png",
  inventarios: [inv()],
  ...extra,
});

test("un producto del Marketplace: número, nombre limpio, proveedor, precio y sugerido en colones, stock, categoría, foto y fecha", () => {
  assert.deepEqual(normalizarCompetenciaDunamixfy(producto()), {
    clave: "837",
    nombre: "ACEITE TRULY",
    proveedorId: "cmhq3x0aa0001abcd1234efgh",
    proveedorNombre: "Dunamix NS",
    esNuestro: false,
    precio: 5899,
    precioSugerido: 15000,
    stock: 86,
    categoria: "Salud y Bienestar",
    foto: "https://pub-faea91bb41dc46c1befa25688e8d9876.r2.dev/products/8f094a0b.png",
    creadoEnDunamixfy: "2026-11-09T21:52:49.953Z",
  });
  assert.equal(normalizarCompetenciaDunamixfy(producto({ proveedor: "Dunamix EF" }))!.esNuestro, true, "nuestro proveedor es «Dunamix EF»");
});

test("con variantes: suma el stock de los inventarios activos y públicos, y el precio es el menor (con su sugerido)", () => {
  const v = normalizarCompetenciaDunamixfy(
    producto({
      inventarios: [
        inv({ precio: 7000, sugerido: 16000, stock: 10 }),
        inv({ precio: 6500, sugerido: 14000, stock: 5 }),
        inv({ precio: 1, stock: 99, activo: false }),
        inv({ precio: 1, stock: 99, eliminado: true }),
        inv({ precio: 1, stock: 99, privado: true }),
        inv({ precio: 8000, stock: -3 }),
      ],
    }),
  )!;
  assert.equal(v.stock, 15);
  assert.equal(v.precio, 6500);
  assert.equal(v.precioSugerido, 14000);
});

test("lo que no sirve no entra: sin número, sin nombre, proveedor raro o sin inventario activo", () => {
  assert.equal(normalizarCompetenciaDunamixfy(producto({ num: "837" })), null);
  assert.equal(normalizarCompetenciaDunamixfy(producto({ nombre: "   " })), null);
  assert.equal(normalizarCompetenciaDunamixfy(producto({ proveedorId: "x;drop table" })), null);
  assert.equal(normalizarCompetenciaDunamixfy(producto({ inventarios: [inv({ activo: false })] })), null);
  assert.equal(normalizarCompetenciaDunamixfy(null), null);
  assert.equal(normalizarCompetenciaDunamixfy(producto({ inventarios: [inv({ precio: -5 })] }))!.precio, null, "un precio negativo no se guarda");
});

test("las fotos: R2 tal cual, un código de Cloudinary se vuelve su dirección y otra dirección no se acepta", () => {
  assert.equal(fotoDunamixfy("qkjta8yaakegdemtjc18"), "https://res.cloudinary.com/dw3jc9fg5/image/upload/qkjta8yaakegdemtjc18");
  assert.equal(fotoDunamixfy("https://res.cloudinary.com/dw3jc9fg5/image/upload/abc123.jpg"), "https://res.cloudinary.com/dw3jc9fg5/image/upload/abc123.jpg");
  assert.equal(fotoDunamixfy("https://evil.example.com/x.png"), null);
  assert.equal(fotoDunamixfy("https://res.cloudinary.com/otra-cuenta/image/upload/x.png"), null);
  assert.equal(fotoDunamixfy(null), null);
});

test("el catálogo no repite un producto que vino en dos páginas, y el número del proveedor es estable", () => {
  const c = catalogoDunamixfy([producto(), producto({ nombre: "Otra copia" }), producto({ num: 838 }), "basura"]);
  assert.deepEqual(c.map((v) => v.clave), ["837", "838"]);
  assert.equal(c[0].nombre, "ACEITE TRULY");
  assert.equal(catalogoDunamixfy("no es una lista").length, 0);
  assert.equal(idDeProveedorDunamixfy("cmhq3x0aa0001abcd1234efgh"), idDeProveedorDunamixfy("cmhq3x0aa0001abcd1234efgh"));
  assert.notEqual(idDeProveedorDunamixfy("cmhq3x0aa0001abcd1234efgh"), idDeProveedorDunamixfy("cmhq3x0aa0001abcd1234efgi"));
});
