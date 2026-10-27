import assert from "node:assert/strict";
import { test } from "node:test";
import type { PedidoPortal } from "./datos";
import type { CuotaPorPagar } from "./resumen-pagos";
import { conteoTareas, tareasChin, type EntradaTareas } from "./tareas";

const HOY = "2026-10-23";

const pedido = (p: Partial<PedidoPortal>): PedidoPortal => ({
  id: "p1",
  compraId: "c1",
  referencia: null,
  producto: "Shilajit",
  fotoReferencia: null,
  paisCodigo: "PA",
  via: "mar",
  modalidad: null,
  etapa: "cotizado",
  unidadesPedidas: 1000,
  unidades: 960,
  montoTotal: 1780,
  costoUnitario: 1.8542,
  notaParaProveedor: null,
  fechaEnvio: null,
  fechaLlegada: null,
  primerPago: null,
  fechaPago1: null,
  segundoPago: null,
  fechaPago2: null,
  pagadoAProveedor: null,
  fotoRealRuta: null,
  comentarioProveedor: null,
  cotizadoEn: "2026-10-17T10:00:00Z",
  actualizadoEn: "2026-10-17T10:00:00Z",
  anticipoMonto: null,
  confirmadoEn: null,
  ...p,
});

const cuota = (c: Partial<CuotaPorPagar>): CuotaPorPagar => ({
  clave: "p2:anticipo",
  pedidoId: "p2",
  producto: "FlyCleanse",
  referencia: null,
  paisCodigo: "PA",
  fotoReferencia: null,
  fechaEnvio: "2026-10-15",
  cuota: "anticipo",
  monto: 640,
  vence: "2026-10-25",
  estado: { tono: "info", texto: "Vence en 2 d", clave: "vence_en", n: 2, atraso: 0 },
  avisada: false,
  ...c,
});

const entrada = (e: Partial<EntradaTareas>): EntradaTareas => ({
  pedidos: [],
  plazos: { "PA|mar": { min: 60, max: 62 } },
  porPagar: [],
  avisosSinConfirmar: [],
  nuevos: new Set(),
  creadoEn: {},
  veMontos: true,
  proveedor: "Shen Zhen",
  hoy: HOY,
  ...e,
});

test("decidir: lo que cotizó, hace cuánto y la diferencia de unidades", () => {
  const [t] = tareasChin(entrada({ pedidos: [pedido({})] }));
  assert.equal(t.tipo, "decidir");
  assert.match(t.texto, /Shen Zhen cotizó 960 u\. a \$1\.85 \(= \$1,780\.00\) hace 6 días\./);
  assert.match(t.texto, /Pediste 1,000: vienen 40 menos\./);
  // Sin permiso de montos, la frase no los dice.
  assert.doesNotMatch(tareasChin(entrada({ pedidos: [pedido({})], veMontos: false }))[0].texto, /\$/);
});

test("falta el costo: cotizado sin precio", () => {
  const [t] = tareasChin(entrada({ pedidos: [pedido({ costoUnitario: null, montoTotal: null, unidades: 3000 })] }));
  assert.equal(t.tipo, "falta_costo");
  assert.match(t.texto, /de las 3,000 u\./);
});

test("confirmar llegada: solo lo que pasó su plazo", () => {
  const atrasado = pedido({ id: "p3", etapa: "enviado", fechaEnvio: "2026-08-01" });
  const enPlazo = pedido({ id: "p4", etapa: "enviado", fechaEnvio: "2026-10-01" });
  const ts = tareasChin(entrada({ pedidos: [atrasado, enPlazo] }));
  assert.deepEqual(ts.map((t) => t.id), ["confirmar_llegada:p3"]);
  assert.match(ts[0].texto, /lleva 83 días: pasó 21 días su plazo/);
});

test("pagos: urgente lo vencido o que vence en 3 días, lo más atrasado primero; lo avisado espera al proveedor", () => {
  const vencido = cuota({ pedidoId: "p5", producto: "Crema", vence: "2026-09-12", estado: { tono: "peligro", texto: "", clave: "vencido", n: 41, atraso: 41 } });
  const lejos = cuota({ pedidoId: "p6", producto: "Lejos", vence: "2026-11-01", estado: { tono: "info", texto: "", clave: "vence_en", n: 9, atraso: 0 } });
  const avisado = cuota({ pedidoId: "p7", avisada: true });
  const saldo = cuota({ pedidoId: "p8", cuota: "saldo", estado: { tono: "peligro", texto: "", clave: "vencido", n: 3, atraso: 3 }, vence: "2026-10-20" });
  const ts = tareasChin(entrada({ porPagar: [lejos, vencido, avisado, saldo, cuota({})] }));
  assert.deepEqual(
    ts.map((t) => [t.id, t.urgente]),
    [
      ["pagar_anticipo:p5", true],
      ["pagar_saldo:p8", true],
      ["pagar_anticipo:p2", true],
      ["pagar_anticipo:p6", false],
    ],
  );
  assert.match(ts[0].texto, /El anticipo de \$640\.00 venció el 12 sep: 41 días de atraso\./);
  assert.equal(ts[0].destino, "pagos");
});

test("lo nuevo del proveedor va primero; esperando a Shen Zhen por cotizar y por avisos sin confirmar", () => {
  const ts = tareasChin(
    entrada({
      pedidos: [pedido({ id: "viejo", etapa: "por_cotizar" }), pedido({ id: "reciente", etapa: "por_cotizar" }), pedido({ id: "nuevo" })],
      creadoEn: { viejo: "2026-10-10T00:00:00Z", reciente: "2026-10-21T00:00:00Z" },
      nuevos: new Set(["nuevo"]),
      porPagar: [cuota({ estado: { tono: "peligro", texto: "", clave: "vencido", n: 1, atraso: 1 } })],
      avisosSinConfirmar: [{ id: "a1", fecha: "2026-10-20", monto: 500, productos: ["A", "B"] }],
    }),
  );
  assert.equal(ts[0].id, "decidir:nuevo");
  assert.equal(ts[0].nuevo, true);
  assert.ok(ts.some((t) => t.id === "esperando:viejo" && /13 días en Por cotizar/.test(t.texto)));
  assert.ok(!ts.some((t) => t.id === "esperando:reciente"));
  assert.ok(ts.some((t) => t.id === "esperando:aviso:a1" && t.producto === "Pago de 2 pedidos"));
  assert.deepEqual(conteoTareas(ts), [
    { tipo: "decidir", n: 1 },
    { tipo: "pagar_anticipo", n: 1 },
    { tipo: "esperando", n: 2 },
  ]);
});
