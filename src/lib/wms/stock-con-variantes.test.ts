import { test } from "node:test";
import assert from "node:assert/strict";
import { juntarConVariantes, sumarCubetas, tieneAlgo, type CubetasDeBodega, type VarianteConStock } from "./stock-con-variantes";

const cero = { reservado: 0, disponible: 0, danado: 0, inspeccion: 0, retenido: 0, vencido: 0, enCamino: 0 };
const b = (bodegaId: string, fisico: number, extra: Partial<CubetasDeBodega> = {}): CubetasDeBodega => ({ bodegaId, fisico, ...cero, disponible: fisico, ...extra });

  // El caso del Ventilador Portátil MF019 Mini: 125 como stock general (Depósito Externo 25 y iStorage 100) y 146 ya repartidos al color Blanco en Despacho Plaza 100.
  const propias = [b("despacho", 0), b("externo", 25), b("istorage", 100)];
  const blanco: VarianteConStock = { id: "blanco", etiqueta: "Blanco", bodegas: [b("despacho", 146), b("externo", 0), b("istorage", 0)] };
  const verde: VarianteConStock = { id: "verde", etiqueta: "Verde", bodegas: [b("despacho", 0), b("externo", 0), b("istorage", 0)] };

test("suma lo repartido a la variante en la bodega y no lo cuenta dos veces", () => {
    const r = juntarConVariantes(propias, [blanco, verde]);
    assert.deepEqual(r.map((x) => x.total.fisico), [146, 25, 100]);
    assert.equal(r.reduce((t, x) => t + x.total.fisico, 0), 271);
    assert.equal(r.reduce((t, x) => t + x.total.disponible, 0), 271);
  });

test("dice de dónde sale: la variante con algo, y el stock general solo si también tiene algo en esa bodega", () => {
    const r = juntarConVariantes(propias, [blanco, verde]);
    assert.deepEqual(r[0].partes.map((p) => [p.nombre, p.cubetas.fisico]), [["Blanco", 146]]);
    // Sin stock de variantes en la bodega, no hay desglose: el total ya es el stock general.
    assert.deepEqual(r[1].partes, []);
    assert.deepEqual(r[2].partes, []);
  });

test("con stock general y de una variante en la misma bodega, muestra las dos partes y el total las suma", () => {
    const r = juntarConVariantes([b("a", 30)], [{ id: "v1", etiqueta: "M", bodegas: [b("a", 12)] }, { id: "v2", etiqueta: "L", bodegas: [b("a", 8)] }]);
    assert.equal(r[0].total.fisico, 50);
    assert.deepEqual(r[0].partes.map((p) => [p.clave, p.general, p.cubetas.fisico]), [["general", true, 30], ["v1", false, 12], ["v2", false, 8]]);
  });

test("suma también las demás cubetas (reservado, dañado, en camino)", () => {
    const r = juntarConVariantes([b("a", 10, { reservado: 2, disponible: 8, enCamino: 5 })], [{ id: "v1", etiqueta: "M", bodegas: [b("a", 4, { danado: 1, disponible: 3 })] }]);
    assert.deepEqual(r[0].total, { fisico: 14, reservado: 2, disponible: 11, danado: 1, inspeccion: 0, retenido: 0, vencido: 0, enCamino: 5 });
  });

test("sin variantes devuelve lo mismo que había", () => {
    const r = juntarConVariantes(propias, []);
    assert.deepEqual(r.map((x) => x.total.fisico), [0, 25, 100]);
    assert.equal(r.every((x) => x.partes.length === 0), true);
  });

test("un saldo negativo de una variante también se muestra y resta", () => {
    const r = juntarConVariantes([b("a", 20)], [{ id: "v1", etiqueta: "M", bodegas: [b("a", -3)] }]);
    assert.equal(r[0].total.fisico, 17);
    assert.deepEqual(r[0].partes.map((p) => p.cubetas.fisico), [20, -3]);
  });

test("sumarCubetas y tieneAlgo", () => {
    assert.equal(sumarCubetas(b("a", 1), b("a", 2)).fisico, 3);
    assert.equal(tieneAlgo(b("a", 0)), false);
    assert.equal(tieneAlgo(b("a", 0, { enCamino: 1 })), true);
  });
