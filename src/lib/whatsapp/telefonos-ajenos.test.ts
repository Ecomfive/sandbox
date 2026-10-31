import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { avisoTelefonosAjenos, telefonosAjenos, telefonosEnTexto } from "./telefonos-ajenos";

const cifras = (texto: string) => telefonosEnTexto(texto).map((t) => t.cifras);
const PROPIOS = ["+507 6000-1111", "50688887777"];

describe("teléfonos en un mensaje", () => {
  it("encuentra los de Panamá, Costa Rica y México, como se escriban", () => {
    assert.deepEqual(cifras("Escríbele a Juan: 6123-4567"), ["61234567"]);
    assert.deepEqual(cifras("mi número es 61234567."), ["61234567"]);
    assert.deepEqual(cifras("+507 6123 4567 o +506 8888-1234"), ["50761234567", "50688881234"]);
    assert.deepEqual(cifras("al 50761234567"), ["50761234567"]);
    assert.deepEqual(cifras("Llama al (55) 1234-5678"), ["5512345678"]);
    assert.deepEqual(cifras("fijo 223-4567"), ["2234567"]);
    assert.deepEqual(cifras("tel: 2234567"), ["2234567"]);
    assert.deepEqual(cifras("https://wa.me/50761234567"), ["50761234567"]);
  });

  it("no confunde pedidos, guías, precios, fechas ni montos", () => {
    assert.deepEqual(cifras("Tu pedido 61234567 ya salió"), []);
    assert.deepEqual(cifras("Guía: 1000244025 y #61234567"), []);
    assert.deepEqual(cifras("ID 78901234"), []);
    assert.deepEqual(cifras("Son $1,500.00 o 12.50 en total, el 31-10-2026"), []);
    assert.deepEqual(cifras("factura 7123 4567"), []);
    assert.deepEqual(cifras("1000244025"), []);
    assert.deepEqual(cifras("Te llegan 3 cajas de 12 unidades"), []);
  });
});

describe("solo los números de la empresa", () => {
  it("deja pasar los nuestros, como estén escritos", () => {
    assert.deepEqual(telefonosAjenos("Escríbenos al 6000-1111 o al +506 8888 7777", PROPIOS), []);
    assert.equal(avisoTelefonosAjenos("Nuestro WhatsApp: wa.me/50760001111", PROPIOS), null);
  });

  it("frena los de otras personas y dice cuáles, sin repetir", () => {
    const ajenos = telefonosAjenos("El de Ana es 6123-4567 (o +507 6123 4567) y el nuestro 6000-1111", PROPIOS);
    assert.deepEqual(ajenos.map((t) => t.cifras), ["61234567"]);
    assert.match(avisoTelefonosAjenos("Llama a 6123-4567", PROPIOS) ?? "", /«6123-4567» es un número de teléfono que no es de la empresa/);
    assert.match(avisoTelefonosAjenos("6123-4567 y 6987-6543", PROPIOS) ?? "", /son números de teléfono/);
  });

  it("un texto sin teléfonos no avisa", () => {
    assert.equal(avisoTelefonosAjenos("Hola, tu guía es la 1000244025", PROPIOS), null);
  });
});
