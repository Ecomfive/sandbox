import assert from "node:assert/strict";
import test from "node:test";
import { EDITABLES, difiereDeMatriz, editablePorColumna, resumirParaFinanzas, resumirReporteria, valorEditado, type FilaReporteria } from "./reporteria";

// Datos inventados.
const base: FilaReporteria = {
  id: "o1:1", ordenId: "o1", linea: 1, tiendaId: "t1", tienda: "OFERFY PAN", fecha: "2026-11-02", numero: "#1", origen: "shopify", estadoShopify: "PENDING",
  etiquetas: null, preparacion: null, notas: null, cliente: "Persona Inventada", telefono: null, provincia: null, corregimiento: null, direccion: null, zona: null,
  producto: "Producto", sku: null, cantidad: 1, venta: 30, estado: "entregada", estadoMatriz: null, verificado: null, courier: null, fechaEnvio: null, resultado: null,
  motivo: null, delivery: null, formaPago: "YAPPY", mesCobro: null, pagadoDelivery: null, costo: 8, costoFuente: "matriz", montoEnvio: 3.5, montoEnvioSe: null,
  devueltosSe: null, fechaDevolucion: null, cambioMonto: null, cambioFormaPago: null, cambioEnvio: null, facturado: false, factura: null, bloque: null, editadas: [],
};
const f = (o: Partial<FilaReporteria>): FilaReporteria => ({ ...base, ...o });

test("los conteos van por pedido, no por línea, y dicen lo que le falta a administración", () => {
  const filas = [
    f({}),
    f({ id: "o1:2", linea: 2, venta: null, costo: 2 }),
    f({ id: "o2:1", ordenId: "o2", verificado: "OK", mesCobro: "NOVIEMBRE", facturado: true }),
    f({ id: "o3:1", ordenId: "o3", estado: "devuelta", estadoMatriz: "Entregado" }),
    f({ id: "o4:1", ordenId: "o4", estado: "en_transito" }),
  ];
  assert.deepEqual(resumirReporteria(filas), { pedidos: 4, entregados: 2, devoluciones: 1, anulados: 0, sinEstado: 1, porVerificar: 1, sinMesCobro: 1, sinFacturar: 1, difieren: 1 });
});

test("el estado de la Matriz se compara con el del sistema solo cuando dice algo", () => {
  assert.equal(difiereDeMatriz("entregada", "Entregado"), false);
  assert.equal(difiereDeMatriz("devuelta", "Entregado"), true);
  assert.equal(difiereDeMatriz("cancelada", "Anulado"), false);
  assert.equal(difiereDeMatriz("en_transito", null), false);
  assert.equal(difiereDeMatriz("en_transito", "  "), false);
});

test("lo que pasa a Finanzas: ventas y costo de lo entregado, envío de todo lo que salió", () => {
  const r = resumirParaFinanzas([
    f({}),
    f({ id: "o1:2", linea: 2, venta: null, costo: 2 }),
    f({ id: "o2:1", ordenId: "o2", estado: "devuelta", venta: 25, costo: 9, montoEnvio: null, montoEnvioSe: 4.75 }),
  ]);
  assert.deepEqual(r, [{ tiendaId: "t1", tienda: "OFERFY PAN", pedidos: 2, entregados: 1, ventas: 30, costo: 10, envio: 8.25, margen: 11.75 }]);
});

test("lo editado a mano se limpia antes de guardarse", () => {
  const monto = editablePorColumna("monto_envio")!;
  assert.deepEqual(valorEditado(monto, "$3.50"), { ok: true, valor: 3.5 });
  assert.deepEqual(valorEditado(monto, ""), { ok: true, valor: null });
  assert.equal(valorEditado(monto, "-1").ok, false);
  assert.equal(valorEditado(monto, "abc").ok, false);
  const ver = editablePorColumna("verificado")!;
  assert.deepEqual(valorEditado(ver, "  OK  "), { ok: true, valor: "OK" });
  assert.deepEqual(valorEditado(editablePorColumna("facturado")!, true), { ok: true, valor: true });
  assert.equal(valorEditado(editablePorColumna("facturado")!, "sí").ok, false);
  assert.equal(editablePorColumna("estado_entrega"), null);
  assert.ok(EDITABLES.every((e) => e.columna !== "estado_entrega" && e.columna !== "total"));
});
