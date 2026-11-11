import assert from "node:assert/strict";
import test from "node:test";
import { validarMapeoProducto, validarOrden } from "./guardar";

const buena = () => ({
  tienda: "OFERFY PAN",
  numero: "#100",
  fecha: "2026-04-01",
  periodo: "2026-04-01",
  estado_pago: "PENDING",
  estado_entrega: "entregada",
  metodo_pago: "yappy",
  total: 37.98,
  costo_envio: 5,
  lineas: [{ producto: "Crema Inventada", producto_clave: "CREMA INVENTADA", cantidad: 2, costo_excel: 3.1, es_servicio: false }],
  cliente: { nombre: "Persona Inventada", telefono: "60000001", direccion: "x".repeat(900) },
  origen_clave: "0123456789abcdef01234567",
  huella_contenido: "abcdef0123456789abcdef01",
});

test("una orden válida pasa limpia y recortada", () => {
  const r = validarOrden(buena());
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.orden.total, 37.98);
  assert.equal(r.orden.subtotal, 37.98);
  assert.equal(r.orden.lineas[0].linea, 1);
  assert.equal(r.orden.cliente.direccion?.length, 500);
  assert.equal(r.orden.cliente.notas, null);
});

test("se rechaza lo que no cuadra: mes distinto de la fecha, estado o método inventado, montos negativos, sin líneas", () => {
  const casos: [Record<string, unknown>, string][] = [
    [{ periodo: "2026-05-01" }, "mes inválido"],
    [{ fecha: "01/04/2026" }, "fecha inválida"],
    [{ estado_entrega: "robada" }, "estado inválido"],
    [{ metodo_pago: "bitcoin" }, "método de pago inválido"],
    [{ total: -1 }, "total inválido"],
    [{ total: "37.98" }, "total inválido"],
    [{ lineas: [] }, "líneas inválidas"],
    [{ lineas: [{ producto: "", producto_clave: "X", cantidad: 1 }] }, "línea inválida"],
    [{ origen_clave: "no-es-huella" }, "huella inválida"],
    [{ tienda: "" }, "sin tienda"],
  ];
  for (const [cambio, motivo] of casos) {
    const r = validarOrden({ ...buena(), ...cambio });
    assert.deepEqual(r, { ok: false, motivo }, JSON.stringify(cambio));
  }
  assert.deepEqual(validarOrden(null), { ok: false, motivo: "fila vacía" });
  const sinMetodo = validarOrden({ ...buena(), metodo_pago: null });
  assert.ok(sinMetodo.ok && sinMetodo.orden.metodo_pago === null);
});

test("mapeo de productos", () => {
  assert.deepEqual(validarMapeoProducto({ producto_clave: "A", producto: "a", costo_clave: "B" }), { producto_clave: "A", producto: "a", costo_clave: "B" });
  assert.equal(validarMapeoProducto({ producto_clave: "A", producto: "a" }), null);
  assert.equal(validarMapeoProducto("x"), null);
});
