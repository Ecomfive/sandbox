import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { descripcionPorDefecto, enlaceValido, faltantesCrearDrop, skuDeDrop, type DatosCrearDrop } from "./crear";

const base: DatosCrearDrop = { nombre: "Crema Nida", descripcion: "Crema Nida", categoria: "Belleza", precio: 12000, imagenes: 3, enlaceCreativos: "" };

describe("crear un producto en Drop", () => {
  it("con lo mínimo se puede crear: no pide precio sugerido, peso, medidas ni público o privado", () => {
    assert.deepEqual(faltantesCrearDrop(base), []);
  });
  it("el SKU es el nombre y la descripción se propone igual", () => {
    assert.equal(skuDeDrop("  Crema Nida "), "Crema Nida");
    assert.equal(descripcionPorDefecto(" Crema Nida"), "Crema Nida");
  });
  it("dice lo que falta", () => {
    assert.deepEqual(faltantesCrearDrop({ ...base, nombre: " ", categoria: "", precio: null }), ["Nombre", "Categoría", "Precio de venta"]);
    assert.deepEqual(faltantesCrearDrop({ ...base, precio: 0 }), ["Precio de venta"]);
  });
  it("las imágenes son de 1 a 5", () => {
    assert.deepEqual(faltantesCrearDrop({ ...base, imagenes: 0 }), ["Imágenes (de 1 a 5)"]);
    assert.deepEqual(faltantesCrearDrop({ ...base, imagenes: 5 }), []);
    assert.deepEqual(faltantesCrearDrop({ ...base, imagenes: 6 }), ["Imágenes (máximo 5)"]);
  });
  it("el enlace de creativos es opcional, pero si se escribe debe ser un enlace", () => {
    assert.deepEqual(faltantesCrearDrop({ ...base, enlaceCreativos: "https://drive.google.com/drive/folders/abc" }), []);
    assert.deepEqual(faltantesCrearDrop({ ...base, enlaceCreativos: "mis creativos" }), ["Enlace de creativos (debe empezar con https://)"]);
    assert.equal(enlaceValido("https://u:p@sitio.com"), false);
    assert.equal(enlaceValido("javascript:alert(1)"), false);
  });
});
