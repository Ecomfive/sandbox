import assert from "node:assert/strict";
import test from "node:test";
import { contar, extremos, origenEntregas, porProducto, type LineaDetalle, type PedidoDetalle } from "./detalle-tienda";

test("contar: confirmados incluye lo que salió; la entrega es sobre lo que salió", () => {
  const c = contar(["nuevo", "confirmado", "en_camino", "entregado", "entregado", "devuelto", "cancelado"]);
  assert.equal(c.pedidos, 7);
  assert.equal(c.porConfirmar, 1);
  assert.equal(c.confirmados, 5);
  assert.equal(c.entregados, 2);
  assert.equal(c.confirmacion, 71.4);
  assert.equal(c.entrega, 50);
  assert.equal(contar([]).confirmacion, null);
  assert.equal(contar(["nuevo"]).entrega, null);
});

test("porProducto: un pedido cuenta una vez por producto; las unidades no cuentan lo cancelado", () => {
  const pedidos: PedidoDetalle[] = [
    { id: "1", estado: "entregado" },
    { id: "2", estado: "cancelado" },
    { id: "3", estado: "en_camino" },
  ];
  const l = (pedidoId: string, clave: string, cantidad = 1): LineaDetalle => ({ pedidoId, clave, nombre: clave.toUpperCase(), vinculado: clave === "a", cantidad });
  const filas = porProducto(pedidos, [l("1", "a"), l("1", "a", 2), l("2", "a"), l("3", "b"), l("9", "b")]);
  assert.equal(filas[0].clave, "a");
  assert.equal(filas[0].pedidos, 2);
  assert.equal(filas[0].unidades, 3);
  assert.equal(filas[0].entregados, 1);
  assert.equal(filas[0].cancelados, 1);
  assert.equal(filas[0].entrega, 100);
  assert.equal(filas[1].pedidos, 1, "la línea de un pedido fuera del periodo no cuenta");
  assert.equal(filas[1].vinculado, false);
});

test("origenEntregas: Servientrega primero, luego Monday, y lo que ninguno registra", () => {
  const r = origenEntregas(["1", "2", "3", "4"], new Map([["2", "entregado"], ["3", "en_ruta"]]), new Map([["1", "entregado"], ["2", "entregado"]]));
  assert.deepEqual(r, { monday: 0, servientrega: 2, sin_registro: 2 });
});

test("extremos: solo productos con suficientes pedidos; con uno solo no hay peor", () => {
  const fila = (clave: string, entregados: number, enCamino: number, pedidos: number, confirmados: number) => ({
    clave,
    nombre: clave,
    vinculado: true,
    unidades: pedidos,
    pedidos,
    porConfirmar: pedidos - confirmados,
    confirmados,
    enCamino,
    entregados,
    devueltos: 0,
    cancelados: 0,
    confirmacion: (confirmados / pedidos) * 100,
    entrega: (entregados / (entregados + enCamino)) * 100,
  });
  const e = extremos([fila("a", 9, 1, 12, 10), fila("b", 4, 6, 20, 10), fila("c", 1, 0, 3, 1)]);
  assert.equal(e.mejorEntrega?.clave, "a");
  assert.equal(e.peorEntrega?.clave, "b");
  assert.equal(e.mejorConfirmacion?.clave, "a");
  assert.equal(e.peorConfirmacion?.clave, "b");
  const solo = extremos([fila("a", 9, 1, 12, 10)]);
  assert.equal(solo.mejorEntrega?.clave, "a");
  assert.equal(solo.peorEntrega, null);
});
