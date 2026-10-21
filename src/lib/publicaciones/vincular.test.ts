import assert from "node:assert/strict";
import test from "node:test";
import { detectarPack, nombreBase, prepararContexto, sugerirSku, type SkuParaVincular } from "./vincular";

const SKUS: SkuParaVincular[] = [
  { id: "s1", codigo: "LEMME/BURN", nombre: "Lemme Burn 60 Capsulas", tipo: "simple", huella: "0f0f0f0f0f0f0f0f" },
  { id: "s2", codigo: "CINTURON/LUMBAR", nombre: "Cinturon Lumbar", tipo: "simple", huella: "aaaaaaaaaaaaaaaa" },
  { id: "c1", codigo: "LEMME/BURN/X2", nombre: "Lemme Burn 2x1", tipo: "combo", huella: null },
  { id: "s3", codigo: "TRULY/BUNS", nombre: "Truly Buns Of Glowry", tipo: "simple", huella: null },
  { id: "s4", codigo: "TRULY/SMOOTH", nombre: "Truly Smooth After Shave", tipo: "simple", huella: null },
  { id: "c2", codigo: "COMBO/TRULY", nombre: "Combo Truly Smooth y Truly Buns", tipo: "combo", huella: null },
  { id: "s5", codigo: "CAMARA/ESPIA", nombre: "Mini camara espia HD", tipo: "simple", huella: null },
  { id: "s6", codigo: "SERUM/VITC", nombre: "Serum Vitamina C", tipo: "simple", huella: null },
  { id: "s7", codigo: "SERUM/VITC/2", nombre: "Serum Vitamina C Facial", tipo: "simple", huella: null },
];
const ctx = prepararContexto(SKUS, [
  { comboId: "c1", componenteId: "s1", cantidad: 2 },
  { comboId: "c2", componenteId: "s3", cantidad: 1 },
  { comboId: "c2", componenteId: "s4", cantidad: 1 },
]);

test("detectarPack y nombreBase", () => {
  assert.deepEqual(detectarPack("P-JS Lemme Burn 60 Capsulas PACK 2"), { unidades: 2, combo: false });
  assert.deepEqual(detectarPack("Mini camara espia PACK-2"), { unidades: 2, combo: false });
  assert.deepEqual(detectarPack("Shampoo Excalvo 2x1"), { unidades: 2, combo: false });
  assert.deepEqual(detectarPack("Serum Roll-on (PACK 2)"), { unidades: 2, combo: false });
  assert.deepEqual(detectarPack("Combo Truly Smooth y Truly Buns"), { unidades: null, combo: true });
  assert.deepEqual(detectarPack("Crema 20G"), { unidades: null, combo: false });
  assert.equal(nombreBase("P-JS Lemme Burn 60 Capsulas PACK 2"), "Lemme Burn 60 Capsulas");
  assert.equal(nombreBase("Mini camara espia PACK-2"), "Mini camara espia");
});

test("exacta por código o nombre (también con lo que dice Dropi)", () => {
  assert.deepEqual(sugerirSku({ nombre: "Cinturon Lumbar", huella: null }, ctx), { tipo: "seguro", skuId: "s2", metodo: "nombre", parecido: 1, alternativas: [], pack: null });
  assert.equal(sugerirSku({ nombre: "Quema grasa", huella: null, textosDropi: ["LEMME/BURN"] }, ctx).metodo, "codigo");
});

test("un pack va a su compuesto; si no existe, «falta el compuesto» (nunca al simple)", () => {
  const conCompuesto = sugerirSku({ nombre: "P-JS Lemme Burn 60 Capsulas PACK 2", huella: null }, ctx);
  assert.equal(conCompuesto.tipo, "sugerido");
  assert.equal(conCompuesto.skuId, "c1");
  assert.equal(conCompuesto.pack, 2);
  const sinCompuesto = sugerirSku({ nombre: "Mini camara espia PACK-2", huella: null }, ctx);
  assert.equal(sinCompuesto.tipo, "falta_compuesto");
  assert.equal(sinCompuesto.skuId, "s5");
});

test("un combo solo busca entre compuestos", () => {
  const r = sugerirSku({ nombre: "Combo Truly Buns y Truly Smooth", huella: null }, ctx);
  assert.equal(r.skuId, "c2");
});

test("por foto (con alguna palabra en común) y varios posibles", () => {
  const foto = sugerirSku({ nombre: "Faja Cinturon Ciatica", huella: "aaaaaaaaaaaaaaab" }, ctx);
  assert.equal(foto.tipo, "sugerido");
  assert.equal(foto.metodo, "foto");
  assert.equal(foto.skuId, "s2");
  const varios = sugerirSku({ nombre: "Serum Vitamina", huella: null }, ctx);
  assert.equal(varios.tipo, "varios");
  assert.deepEqual([...varios.alternativas].sort(), ["s6", "s7"]);
  assert.equal(sugerirSku({ nombre: "Algo que no existe", huella: null }, ctx).tipo, "ninguno");
});
