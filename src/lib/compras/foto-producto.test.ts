import { test } from "node:test";
import assert from "node:assert/strict";
import { indexar } from "@/lib/scraping/cruces";
import { claveNombre, fotoDeProducto, fotosPorNombre, productoDeCompra } from "./foto-producto";

test("la foto del producto o la de otro con el mismo nombre", () => {
  const mapa = fotosPorNombre([
    { nombre: "Cayenne Peppper Vivonu 240 Softgel", foto: "a.webp" },
    { nombre: "CAYENNE PEPPPER VIVONU softgel", foto: "b.webp" },
    { nombre: "Rollos para Impresora Zebra", foto: null },
  ]);
  assert.equal(claveNombre("Cayenne Peppper Vivonu 240 Softgel"), claveNombre("softgel CAYENNE peppper VIVONU"));
  assert.equal(fotoDeProducto({ nombre: "Otro", foto: "propia.jpg" }, mapa), "propia.jpg");
  assert.equal(fotoDeProducto({ nombre: "cayenne pepper vivonu SOFTGEL 240", foto: null }, mapa), null);
  assert.equal(fotoDeProducto({ nombre: "Cayenne Peppper Vivonu Softgel", foto: null }, mapa), "a.webp");
  assert.equal(fotoDeProducto({ nombre: "Rollos para Impresora Zebra", foto: null }, mapa), null);
});

test("el producto de una compra sin productos, por nombre o por foto", () => {
  const indice = indexar([
    { tipo: "producto", id: "p1", nombre: "Mini Ventilador con Clip Recargable", huella: "6464504c5cf4f4d4", detalle: "MINI/VENT" },
    { tipo: "producto", id: "p2", nombre: "Lámpara de sal himalaya", huella: "7c3c8c1c5cd83c87", detalle: "LAMP" },
  ]);
  assert.deepEqual(productoDeCompra("Mini Ventilador con Clip, Recargable con 100 Niveles", null, indice), { id: "p1", como: "nombre" });
  assert.deepEqual(productoDeCompra("Lámpara decorativa", "7c3c8c1c5cd83c87", indice), { id: "p2", como: "foto" });
  assert.equal(productoDeCompra("Cuchillo para pescado", null, indice), null);
});
