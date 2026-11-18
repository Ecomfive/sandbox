import assert from "node:assert/strict";
import test from "node:test";
import { unidadesDeVariante } from "./vincular-variante";

const u = (sku: string | null, varianteTitulo: string | null, productoTitulo = "Producto") => unidadesDeVariante({ sku, varianteTitulo, productoTitulo });

test("unidades por venta: por el final del SKU", () => {
  assert.equal(u("PESTAÑAS MAGNÉTICAS/X3", "Lleva 3 kit por $39.99"), 3);
  assert.equal(u("LA/CEJAS/NEGRO/X2", "Negro #04 / Compra 2 und. B/. 35.98"), 2);
  assert.equal(u("PACK4/ESTUFA/X2", "Compra 2 Pack B/. 29.99 (14.99c/u)"), 2);
  assert.equal(u("Cinta súper impermeable/X3", "3 cintas x B/. 34.99"), 3);
});

test("unidades por venta: por el nombre de la variante (lo que recibe, no lo que paga)", () => {
  assert.equal(u(null, "Paga 1 kit y lleva 2"), 2);
  assert.equal(u(null, "Lleva 3 kit por $39.99"), 3);
  assert.equal(u("", "2 cintas x B/. 29.99"), 2);
  assert.equal(u(null, "2x1"), 2);
  assert.equal(u(null, "PACK 2"), 2);
  // Lo que recibe: «Compra 4 Lleva 8» son 8; «4 y Lleva 2 gratis» son 6.
  assert.equal(u("Suzuki/Compra 4 Unidades Lleva 8", "¡Compra 4 Unidades Lleva 8! / Suzuki"), 8);
  assert.equal(u(null, "4 y Lleva 2 gratis / Azul / 3XL"), 6);
  assert.equal(u(null, "Compra 4 y Recibe 2 Gratis: 2 Blanco + 2 Negro + 2 Marrón / L (55 - 63Kg)"), 6);
  assert.equal(u(null, "2 Negro + 1 Blanco / XL"), 3);
  assert.equal(u(null, "3 Pack / Disponible en tienda."), 3);
  assert.equal(u(null, "Lleva 2 Kits"), 2);
});

test("unidades por venta: lo que no es un paquete no sugiere nada", () => {
  assert.equal(u("Correa fija - Versión dorada/Bronceado/3XL", "Bronceado / 3XL / Correa fija - Versión dorada"), null);
  assert.equal(u(null, "M / Negro"), null);
  assert.equal(u(null, "5 metros"), null);
  assert.equal(u(null, "3 meses"), null);
  assert.equal(u(null, "1 kit"), null);
  // Un tono con cero adelante no es una cantidad; el número al inicio del nombre del producto tampoco.
  assert.equal(u("DELINEADOR.PEEL.OFF-02.NEUTRAL.MAUVE.", "02 MUAH-ve (Neutral Mauve)"), null);
  assert.equal(u("0004/7DAYS/GOTAS/HONGOS", "Default Title", "7 Days Fungus Free Nails"), null);
  assert.equal(u("SET/PESTANAS/MAGNETICAS", "Default Title", "Set de pestañas"), null);
  // Sin variantes, cuenta el nombre del producto.
  assert.equal(u(null, "Default Title", "Shampoo 2x1"), 2);
});

test("unidades por venta: el SKU manda y los kits de cosas distintas no son paquetes", () => {
  assert.equal(u("PINZA/CABELLO/X-1", "Default Title", "Pinzas Para el Cabello (Pack 6 und)"), null);
  assert.equal(u("REBAN/AGUACATE/X-2", "Compra 2 und. B/. 29.99"), 2);
  assert.equal(u(null, "Default Title", "Kit de 11 herramientas para puntos negros"), null);
  assert.equal(u("LIBRO / CALIGRAFIA", "4 libros + 1 bolígrafo mágico + 5 recargas + 1 atril"), null);
  assert.equal(u(null, "Default Title", "Cinta para cabello Pack de 3 OFERTA"), 3);
});
