import assert from "node:assert/strict";
import test from "node:test";
import { enEspera, motivoDeAdelanto, zonasDeAdelanto } from "./adelanto";
import { mensajePagoAdelantado } from "./combinar";
import type { ReglaZona } from "./zonas";

const z = (texto: string): ReglaZona => ({ id: texto, texto, clave: texto.toLowerCase().normalize("NFD").replace(/\p{M}/gu, ""), resultado: "interior" });

test("una zona de pago por adelantado sale en la dirección o en la ciudad, completa", () => {
  const zonas = [z("Bocas del Toro"), z("Puerto Armuelles")];
  assert.deepEqual(zonasDeAdelanto("Calle 3, Almirante, Bocas del Toro", null, zonas).map((r) => r.texto), ["Bocas del Toro"]);
  assert.deepEqual(zonasDeAdelanto("Barrio Balboa", "Puerto Armuelles", zonas).map((r) => r.texto), ["Puerto Armuelles"]);
  assert.deepEqual(zonasDeAdelanto("Casa 5 en Bocas", "Panamá", zonas), [], "una palabra de la zona no basta");
  assert.deepEqual(zonasDeAdelanto("Calle 3", "Panamá", zonas), []);
});

test("sin zonas cargadas el pago por adelantado no se activa", () => {
  assert.deepEqual(zonasDeAdelanto("Bocas del Toro", "Bocas del Toro", []), []);
});

test("el motivo dice qué zona salió", () => {
  assert.match(motivoDeAdelanto([z("Bocas del Toro"), z("Bocas del Toro")]), /Bocas del Toro\. No se propone etiqueta/);
});

test("enEspera separa los que siguen sin etiqueta de los que ya la tienen", () => {
  const filas = [
    { estado: "adelantado", etiquetaActual: null },
    { estado: "adelantado", etiquetaActual: "INTERIOR/SERVIENTREGA" },
    { estado: "listo", etiquetaActual: null },
  ];
  const r = enEspera(filas);
  assert.equal(r.esperando.length, 1);
  assert.equal(r.etiquetados.length, 1);
});

test("el mensaje al cliente lleva los métodos de pago de la tienda, o dice que un asesor le indica", () => {
  const con = mensajePagoAdelantado({ nombre: "maría pérez", numero: "#1234", tienda: "Kenku", metodos: "Yappy: 6000-0000\nTransferencia: Banco General 04-00-00-000000" });
  assert.match(con, /^Hola María 👋 Tu pedido #1234 de Kenku es para una zona con pago por adelantado/);
  assert.match(con, /Puedes pagar así:\nYappy: 6000-0000/);
  assert.match(con, /comprobante por este chat/);
  const sin = mensajePagoAdelantado({ nombre: null, numero: null, tienda: null, metodos: null });
  assert.match(sin, /^Hola 👋 Tu pedido es para una zona con pago por adelantado/);
  assert.match(sin, /Un asesor te indicará cómo pagar/);
  assert.doesNotMatch(sin, /Puedes pagar así/);
});
