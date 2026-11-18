import assert from "node:assert/strict";
import { test } from "node:test";
import { resolverAfinado, type FilaAfinada } from "../permisos/afinado";
import { CATALOGO_COMPRAS } from "../permisos/catalogo";
import type { FilaCompra } from "../../app/(app)/compras/def-compras";
import {
  SIN_RESTRICCIONES,
  accionPermitidaEnCompras,
  cambioVisibleEnActividad,
  celdaEditable,
  columnasOcultas,
  dentroDelAlcance,
  enmascarar,
  restriccionesDe,
  sinColumnasBloqueadas,
} from "../../app/(app)/compras/permisos-compras";

const fila = (tipo: FilaAfinada["tipo"], clave: string, valor: string): FilaAfinada => ({ modulo: "compras", tipo, clave, valor });
const restricciones = (...filas: FilaAfinada[]) => restriccionesDe(resolverAfinado(CATALOGO_COMPRAS, filas));

const COMPRA = {
  id: "1",
  montoTotal: 1000,
  primerPago: 400,
  segundoPago: 300,
  pagadoAProveedor: 700,
  fechaPago1: "2026-01-01",
  fechaPago2: "2026-02-01",
  proveedor: "Shen Zhen",
  agenteEnvio: "Avery",
  viaEnvio: ["mar"],
  tiendas: ["Wao"],
  etiquetas: ["urgente"],
  asignadoNombre: "Carmen",
  fechaLimite: "2026-03-01",
  etapa: "cotizar",
  estado: "backlog",
} as unknown as FilaCompra;

test("sin ajustes no se restringe nada", () => {
  assert.deepEqual(restricciones(), SIN_RESTRICCIONES);
  assert.equal(enmascarar(COMPRA, SIN_RESTRICCIONES), COMPRA);
});

test("un campo oculto no llega a la pantalla, ni sus fechas ni su columna", () => {
  const r = restricciones(fila("campo", "pago1", "oculto"), fila("campo", "monto", "oculto"));
  const c = enmascarar(COMPRA, r);
  assert.equal(c.primerPago, null);
  assert.equal(c.fechaPago1, null);
  assert.equal(c.montoTotal, null);
  assert.equal(c.segundoPago, 300);
  assert.equal(c.proveedor, "Shen Zhen");
  assert.deepEqual(columnasOcultas(r).sort(), ["fechaPago1", "montoTotal", "primerPago", "valorUnitario"]);
  assert.ok(r.ocultos.includes("unitario"));
});

test("los datos en forma de lista salen como lista vacía", () => {
  const r = restricciones(fila("campo", "etiquetas", "oculto"), fila("campo", "via", "oculto"), fila("campo", "tienda", "oculto"));
  const c = enmascarar(COMPRA, r);
  assert.deepEqual([c.etiquetas, c.viaEnvio, c.tiendas], [[], [], []]);
});

test("solo ver no se edita en la celda; oculto tampoco; lo que ningún rol gobierna, sí", () => {
  const r = restricciones(fila("campo", "proveedor", "ver"), fila("campo", "pago2", "oculto"));
  assert.ok(!celdaEditable(r, "proveedor"));
  assert.ok(!celdaEditable(r, "segundoPago"));
  assert.ok(!celdaEditable(r, "fechaPago2"));
  assert.ok(celdaEditable(r, "agenteEnvio"));
  assert.ok(celdaEditable(r, "factura"));
});

test("al guardar la ficha no se pisan los datos que la persona no puede cambiar", () => {
  const r = restricciones(fila("campo", "pago1", "oculto"), fila("campo", "proveedor", "ver"));
  const cambios = { proveedor: null, primer_pago: null, fecha_pago_1: null, segundo_pago: 5, nombre: "x" };
  assert.deepEqual(sinColumnasBloqueadas(cambios, r), { segundo_pago: 5, nombre: "x" });
});

test("las acciones bloqueadas se reconocen", () => {
  const r = restricciones(fila("accion", "anular", "bloqueada"));
  assert.ok(!accionPermitidaEnCompras(r, "anular"));
  assert.ok(accionPermitidaEnCompras(r, "crear"));
});

test("la Actividad no muestra cambios de un dato que no se ve", () => {
  const r = restricciones(fila("campo", "pagado", "oculto"));
  assert.ok(!cambioVisibleEnActividad(r, "pagadoAProveedor"));
  assert.ok(cambioVisibleEnActividad(r, "proveedor"));
  assert.ok(cambioVisibleEnActividad(r, "nombre"));
});

test("el alcance limita a las compras asignadas o creadas por la persona", () => {
  const yo = { id: "u1", nombre: "Carmen Pérez", email: "carmen@x.com" };
  assert.ok(dentroDelAlcance("todas", {}, yo));
  assert.ok(dentroDelAlcance("asignadas", { asignadoId: "u1" }, yo));
  assert.ok(dentroDelAlcance("asignadas", { responsableNombre: " carmen pérez " }, yo));
  assert.ok(!dentroDelAlcance("asignadas", { asignadoId: "u2", responsableNombre: "Otra" }, yo));
  assert.ok(!dentroDelAlcance("asignadas", {}, yo));
  assert.ok(dentroDelAlcance("creadas", { creadoPorId: "u1" }, yo));
  assert.ok(dentroDelAlcance("creadas", { creadorNombre: "carmen@x.com" }, yo));
  assert.ok(!dentroDelAlcance("creadas", { asignadoId: "u1" }, yo));
});

test("sin ver el monto, las líneas de la Actividad quedan solo con sus unidades", async () => {
  const { textoSinMonto } = await import("../../app/(app)/compras/permisos-compras");
  assert.equal(textoSinMonto("ABC · Crema · 1.040 u. · $1.270,00"), "ABC · Crema · 1.040 u.");
  assert.equal(textoSinMonto("1.040 u. · $1.270,00"), "1.040 u.");
  assert.equal(textoSinMonto("900 u."), "900 u.");
});

test("sin ver el monto: la Actividad no trae el Registro de pagos ni los montos de la cotización del proveedor (auditoría, 18 nov 2026)", async () => {
  const { comentarioSinMonto } = await import("../../app/(app)/compras/permisos-compras");
  const r = restricciones(fila("campo", "monto", "oculto"));
  assert.ok(!cambioVisibleEnActividad(r, "registroPagos"));
  assert.ok(cambioVisibleEnActividad(SIN_RESTRICCIONES, "registroPagos"));
  assert.equal(comentarioSinMonto("Cotización de Shen Zhen: 1.000 u. · $1,25 por unidad · $1.250,00"), "Cotización de Shen Zhen: 1.000 u.");
  assert.equal(comentarioSinMonto("Cotización corregida en producción de Shen Zhen: 10 u. · $2,00 por unidad · $20,00\nPrecio $5 por caja"), "Cotización corregida en producción de Shen Zhen: 10 u.\nPrecio $5 por caja");
  assert.equal(comentarioSinMonto("Pagamos $500 ayer"), "Pagamos $500 ayer");
});

test("el pedido del Tablero de Shen Zhen llega sin los montos y pagos que la persona no ve (auditoría, 18 nov 2026)", async () => {
  const { pedidoSinOcultos } = await import("../../app/(app)/compras/permisos-compras");
  const p = { id: "p1", unidades: 10, montoTotal: 100, costoUnitario: 10, primerPago: 50, fechaPago1: "2026-01-01", segundoPago: 50, fechaPago2: "2026-02-01", pagadoAProveedor: 50, anticipoMonto: 40 };
  assert.equal(pedidoSinOcultos(p, SIN_RESTRICCIONES), p);
  assert.deepEqual(pedidoSinOcultos(p, restricciones(fila("campo", "monto", "oculto"))), { id: "p1", unidades: 10, montoTotal: null, costoUnitario: null, primerPago: null, fechaPago1: null, segundoPago: null, fechaPago2: null, pagadoAProveedor: null, anticipoMonto: null });
  assert.deepEqual(pedidoSinOcultos(p, restricciones(fila("campo", "pago2", "oculto"))), { ...p, segundoPago: null, fechaPago2: null });
});

test("la etiqueta de la auditoría lleva a su campo del catálogo", async () => {
  const { campoDeEtiqueta } = await import("../../app/(app)/compras/permisos-compras");
  assert.equal(campoDeEtiqueta("Monto Total"), "monto");
  assert.equal(campoDeEtiqueta("Fecha de Pago (2)"), "pago2");
  assert.equal(campoDeEtiqueta("Agente de envío"), "agente");
  assert.equal(campoDeEtiqueta("Cantidad total"), undefined);
  assert.equal(campoDeEtiqueta("constructor"), undefined);
});

test("los pagos a Shen Zhen solo los ve quien no tiene oculto ningún campo de dinero (auditoría, 18 nov 2026)", async () => {
  const { vePagosProveedor } = await import("../../app/(app)/compras/permisos-compras");
  assert.ok(vePagosProveedor(SIN_RESTRICCIONES));
  assert.ok(vePagosProveedor(restricciones(fila("campo", "proveedor", "oculto"))));
  for (const clave of ["monto", "pago1", "pago2", "pagado"]) {
    const r = restricciones(fila("campo", clave, "oculto"));
    assert.ok(!vePagosProveedor(r), clave);
    assert.ok(!cambioVisibleEnActividad(r, "registroPagos"), clave);
  }
});
