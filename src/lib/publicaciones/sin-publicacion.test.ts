import assert from "node:assert/strict";
import test from "node:test";
import type { ProductoProveedor } from "./sincronizar-dropi";
import { enDropiSinPublicacion, esServicioDropi, parecidasA, type PublicacionParaCruzar } from "./sin-publicacion";

const prod = (id: number, nombre: string, extra: Partial<ProductoProveedor> = {}): ProductoProveedor => ({
  id,
  nombre,
  tipo: "SIMPLE",
  archivado: false,
  privado: false,
  precio: 9.99,
  precioSugerido: 9.99,
  stock: 10,
  stockPrivado: 0,
  bodegas: [],
  categorias: [],
  fotos: 3,
  creado: null,
  ...extra,
});
const pub = (id: string, nombre: string, dropiId: string | null, extra: Partial<PublicacionParaCruzar> = {}): PublicacionParaCruzar => ({ id, numero: Number(id.replace(/\D/g, "")) || null, nombre, dropiId, archivada: false, ...extra });

test("esServicioDropi: envíos y seguros de Dropi, con o sin tilde", () => {
  assert.equal(esServicioDropi("ENVÍO PRIORITARIO"), true);
  assert.equal(esServicioDropi("Envío Express 24/48 Horas + Seguro"), true);
  assert.equal(esServicioDropi("SEGURO DE DESPACHO"), true);
  assert.equal(esServicioDropi("Yerba Magic"), false);
  // «envio» dentro de otra palabra no cuenta.
  assert.equal(esServicioDropi("Envioltura de regalo"), false);
});

test("enDropiSinPublicacion: solo activos, sin publicación y sin servicios; los de más stock primero", () => {
  const productos = [
    prod(11331, "Yerba Magic", { stock: 598, bodegas: [{ id: 81, nombre: "Proveedor Ecomfive", stock: 598 }] }),
    prod(11276, "Bodysuit Modelador Viral", { stock: 0 }),
    prod(6980, "ENVÍO PRIORITARIO", { stock: 2634 }),
    prod(7231, "Ya publicado", { stock: 50 }),
    prod(7679, "El segundo ID de una publicación", { stock: 50 }),
    prod(8406, "Archivado en Dropi", { archivado: true }),
    prod(9000, "ID de una archivada", { stock: 5 }),
  ];
  const pubs = [pub("p1", "Ya publicado", "7231-7679"), pub("p2", "Vieja", "9000", { archivada: true }), pub("p3", "Yerba Magica", "8100", { archivada: true })];
  const r = enDropiSinPublicacion(productos, pubs);
  assert.deepEqual(
    r.map((x) => x.dropiId),
    [11331, 11276],
  );
  assert.equal(r[0].bodega, 81);
  assert.equal(r[1].bodega, null);
  assert.deepEqual(
    r[0].parecidas.map((p) => p.id),
    ["p3"],
  );
});

test("parecidasA: pide dos palabras en común y ordena por parecido, las activas antes", () => {
  const pubs = [
    pub("p1", "Espuma de Depilación ELHOOE", "1", { archivada: true }),
    pub("p2", "Espuma de Depilación ELHOOE PACK 2", "2"),
    pub("p3", "Crema Coco Cloud", "3"),
    pub("p4", "Crema Terapia Articular", "4"),
  ];
  // Las dos espumas se parecen igual: primero la activa.
  assert.deepEqual(
    parecidasA("Espuma de Depilación - Pack 2", pubs).map((p) => p.id),
    ["p2", "p1"],
  );
  // Con el mismo parecido, primero la que no tiene palabras de más.
  assert.deepEqual(
    parecidasA("Yerba Magic", [pub("p5", "Yerba Magic PACK-2", "5"), pub("p6", "Yerba Magic", "6")]).map((p) => p.id),
    ["p6", "p5"],
  );
  // «Crema» sola no hace parecidas.
  assert.deepEqual(parecidasA("Crema de Manos", pubs), []);
  assert.deepEqual(parecidasA("", pubs), []);
});
