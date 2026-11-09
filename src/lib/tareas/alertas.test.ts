import assert from "node:assert/strict";
import test from "node:test";
import { agruparAlertas, alertasTesoreriaANuevas, armarAlertas, cambiosAlertas, DEF_ALERTA, leerFotoProyeccion, lunesDe, partirMensajeTesoreria, TIPOS_ALERTA, type DatosAlertas } from "./alertas";

const VACIO: DatosAlertas = { hoy: "2026-10-12", caja: null, cxpPorVencer: null, cxcVencidos: null, cierreAnterior: null, costoVentas: null, inventarioSinCosto: null };

test("armarAlertas: cada situación con su clave estable; una fuente sin leer no se evalúa", () => {
  const { alertas, evaluados } = armarAlertas({
    hoy: "2026-10-12",
    caja: { saldoMinimo: -500, fecha: "2026-10-20", minimo: 1000 },
    cxpPorVencer: [{ id: "d1", contraparte: "PROVEEDOR DEMO", documento: "F-1", saldo: 120, vencimiento: "2026-10-15" }],
    cxcVencidos: [{ id: "d2", contraparte: "CLIENTE DEMO", documento: null, saldo: 80, vencimiento: "2026-10-09" }],
    cierreAnterior: { periodo: "2026-09-01", estado: "en_revision" },
    costoVentas: { periodo: "2026-09-01", ingresos: 1000, costo: 800 },
    inventarioSinCosto: { productos: 3, unidades: 40 },
  });
  assert.deepEqual(evaluados, ["caja_minima", "cxp_vence", "cxc_vencido", "cierre_pendiente", "costo_ventas", "inventario_sin_costo"]);
  assert.deepEqual(
    alertas.map((a) => [a.clave, a.severidad, a.modulo]),
    [
      ["caja-minima:2026-10-12", "critica", "flujo-caja"],
      ["cxp-vence:d1", "aviso", "cuentas-por-pagar"],
      ["cxc-vencido:d2", "aviso", "cuentas-por-cobrar"],
      ["cierre:2026-09", "aviso", "cierre-mes"],
      ["costo-ventas:2026-09", "aviso", "estado-resultados"],
      ["inventario-sin-costo", "info", "rentabilidad"],
    ],
  );
  assert.equal(alertas.find((a) => a.tipo === "cierre_pendiente")!.enlace, "/cierre-mes/2026-09");
  assert.match(alertas.find((a) => a.tipo === "costo_ventas")!.mensaje, /80\.0 %/);
  assert.deepEqual(armarAlertas(VACIO), { alertas: [], evaluados: [] });
});

test("armarAlertas: sin problema no hay alerta, pero el tipo queda evaluado", () => {
  const { alertas, evaluados } = armarAlertas({
    ...VACIO,
    hoy: "2026-10-05",
    caja: { saldoMinimo: 5000, fecha: null, minimo: 1000 },
    cxpPorVencer: [],
    cierreAnterior: { periodo: "2026-09-01", estado: "abierto" },
    costoVentas: { periodo: "2026-09-01", ingresos: 1000, costo: 400 },
    inventarioSinCosto: { productos: 0, unidades: 0 },
  });
  assert.equal(alertas.length, 0);
  assert.deepEqual(evaluados, ["caja_minima", "cxp_vence", "cierre_pendiente", "costo_ventas", "inventario_sin_costo"]);
  // Al día 15 o después, el cierre pendiente es crítico.
  assert.equal(armarAlertas({ ...VACIO, hoy: "2026-10-16", cierreAnterior: { periodo: "2026-09-01", estado: "abierto" } }).alertas[0].severidad, "critica");
  assert.equal(armarAlertas({ ...VACIO, hoy: "2026-10-16", cierreAnterior: { periodo: "2026-09-01", estado: "cerrado" } }).alertas.length, 0);
});

test("cambiosAlertas: resuelve lo que dejó de pasar solo en los tipos evaluados", () => {
  const { alertas } = armarAlertas({ ...VACIO, cxpPorVencer: [{ id: "d1", contraparte: "P", documento: null, saldo: 1, vencimiento: "2026-10-13" }] });
  const r = cambiosAlertas(
    [
      { clave: "cxp-vence:d1", tipo: "cxp_vence", resuelta_en: null },
      { clave: "cxp-vence:d0", tipo: "cxp_vence", resuelta_en: null },
      { clave: "cxp-vence:dx", tipo: "cxp_vence", resuelta_en: "2026-10-01T00:00:00Z" },
      { clave: "cxc-vencido:d9", tipo: "cxc_vencido", resuelta_en: null },
    ],
    alertas,
    ["cxp_vence"],
  );
  assert.deepEqual(r.resolver, ["cxp-vence:d0"]);
});

test("leerFotoProyeccion y lunesDe", () => {
  assert.equal(leerFotoProyeccion([]), null);
  assert.deepEqual(
    leerFotoProyeccion([
      { tomada_en: "2026-10-05T10:00:00Z", saldo_minimo: 100 },
      { tomada_en: "2026-10-12T10:00:00Z", saldo_minimo: "-50.5", fecha_minimo: "2026-10-30" },
    ]),
    { saldoMinimo: -50.5, fecha: "2026-10-30" },
  );
  assert.equal(leerFotoProyeccion([{ creado_en: "2026-10-12", otra: 1 }]), null);
  assert.equal(lunesDe("2026-10-18"), "2026-10-12");
  assert.equal(lunesDe("2026-10-12"), "2026-10-12");
});

test("agruparAlertas: una fila por tipo, la más grave primero, solo de los módulos de la persona", () => {
  const filas = agruparAlertas(
    [
      { tipo: "cxp_vence", severidad: "aviso", mensaje: "a", enlace: "/cuentas-por-pagar" },
      { tipo: "cxp_vence", severidad: "aviso", mensaje: "b", enlace: "/cuentas-por-pagar" },
      { tipo: "caja_minima", severidad: "critica", mensaje: "c", enlace: "/flujo-caja" },
      { tipo: "cierre_pendiente", severidad: "aviso", mensaje: "d", enlace: "/cierre-mes/2026-09" },
    ],
    ["cuentas-por-pagar", "flujo-caja", "panel-financiero"],
  );
  assert.deepEqual(
    filas.map((f) => [f.clave, f.cantidad, f.descripcion]),
    [
      ["alerta-caja_minima", 1, "c"],
      ["alerta-cxp_vence", 2, "a y 1 más"],
    ],
  );
});

test("cierre pendiente con fecha objetivo (Cierre de mes › Configuración)", () => {
  const base = { ...VACIO, cierreAnterior: { periodo: "2026-09-01", estado: "abierto", fechaObjetivo: "2026-10-07" } };
  assert.equal(armarAlertas({ ...base, hoy: "2026-10-07" }).alertas.length, 0, "el mismo día todavía no");
  assert.equal(armarAlertas({ ...base, hoy: "2026-10-08" }).alertas[0].severidad, "aviso");
  assert.equal(armarAlertas({ ...base, hoy: "2026-10-13" }).alertas[0].severidad, "critica");
});

test("las alertas de Tesorería se guardan con su tipo, la clave con «tes:» y se vuelven a partir para su página", () => {
  const nuevas = alertasTesoreriaANuevas([
    { clave: "dropi-retiro", severidad: "aviso", titulo: "Conviene pedir un retiro de Dropi", mensaje: "Wallet en $1.000: supera $500", href: "/retiros?nuevo=1" },
    { clave: "linea-uso:Banco X", severidad: "aviso", titulo: "Línea de crédito casi agotada", mensaje: "Banco X: usada al 95 %", href: "/tesoreria/deuda" },
    { clave: "otra-cosa", severidad: "info", titulo: "x", mensaje: "y", href: "/" },
  ]);
  assert.deepEqual(nuevas.map((n) => [n.clave, n.tipo, n.modulo]), [
    ["tes:dropi-retiro", "tesoreria_dropi", "tesoreria"],
    ["tes:linea-uso:Banco X", "tesoreria_linea_uso", "tesoreria"],
  ]);
  assert.deepEqual(partirMensajeTesoreria(nuevas[0].mensaje, "tesoreria_dropi"), { titulo: "Conviene pedir un retiro de Dropi", mensaje: "Wallet en $1.000: supera $500" });
  assert.ok(TIPOS_ALERTA.every((t) => DEF_ALERTA[t]));
});
