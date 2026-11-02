import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CATEGORIAS_DROP, descripcionPorDefecto, enlaceValido, faltantesCrearDrop, skuDeDrop, sugerirProductos, textoParaDrop, type DatosCrearDrop } from "./crear";

const base: DatosCrearDrop = { nombre: "Crema Nida", descripcion: "Crema Nida", categoria: "Cuidado personal", precio: 12000, imagenes: 3, enlaceCreativos: "" };

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

  it("con nuestro producto, en Drop se escribe su SKU (o, si se prefiere, su nombre)", () => {
    const p = { codigo: "CREMA/NIDA/50ML", nombre: "Crema Nida 50 ml" };
    assert.equal(textoParaDrop(p, "sku"), "CREMA/NIDA/50ML");
    assert.equal(textoParaDrop(p, "nombre"), "Crema Nida 50 ml");
  });
  it("la descripción pide 10 caracteres como mínimo", () => {
    assert.deepEqual(faltantesCrearDrop({ ...base, descripcion: "Bolso" }), ["Descripción (mínimo 10 caracteres)"]);
    assert.deepEqual(faltantesCrearDrop({ ...base, descripcion: "Crema Nida" }), []);
  });
  it("la categoría es una de las 12 de Drop", () => {
    assert.equal(CATEGORIAS_DROP.length, 12);
    assert.deepEqual(faltantesCrearDrop({ ...base, categoria: "Belleza" }), ["Categoría (elige una de la lista)"]);
    for (const c of CATEGORIAS_DROP) assert.deepEqual(faltantesCrearDrop({ ...base, categoria: c }), []);
  });
});

describe("sugerirProductos", () => {
  const productos = [
    { id: "1", codigo: "CREMA/NIDA/50ML", nombre: "Crema Nida 50 ml" },
    { id: "2", codigo: "CREMA/NIDA/100ML", nombre: "Crema Nida 100 ml grande" },
    { id: "3", codigo: "ACEITE/OREGANO", nombre: "Aceite de orégano" },
  ];
  it("vincula solo cuando el nombre o el SKU es igual (sin tildes ni signos)", () => {
    assert.equal(sugerirProductos("crema nida 50 ml", productos).exacto?.id, "1");
    assert.equal(sugerirProductos("CREMA/NIDA/50ML", productos).exacto?.id, "1");
    assert.equal(sugerirProductos("aceite de oregano", productos).exacto?.id, "3");
  });
  it("ofrece los parecidos cuando no es igual", () => {
    const r = sugerirProductos("crema nida", productos);
    assert.equal(r.exacto, null);
    assert.deepEqual(r.parecidos.map((x) => x.id), ["1", "2"]);
  });
  it("con muy poco escrito no sugiere nada", () => {
    assert.deepEqual(sugerirProductos("cr", productos), { exacto: null, parecidos: [] });
    assert.deepEqual(sugerirProductos("zapatos", productos), { exacto: null, parecidos: [] });
  });
});
