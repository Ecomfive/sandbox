import assert from "node:assert/strict";
import test from "node:test";
import type { Celda } from "../finanzas/libro-excel";
import { leerGestionDeliverys, ubicarEstructura } from "./excel";

// Una hoja inventada con la misma forma que «GESTION DELIVERY II» (bloques por tarifa, columnas por tienda).
function hoja(datos: Record<string, Celda>[]): Celda[][] {
  const cols: { bloque?: string; titulo: string; clave: string }[] = [
    { bloque: "GESTIÓN DE DELIVERYS", titulo: " FECHA", clave: "fecha" },
    { titulo: "MES", clave: "mes" },
    { titulo: "NOMBRE DEL DELIVERY", clave: "nombre" },
    { bloque: "TIENDAS", titulo: "OFERFY", clave: "r_oferfy" },
    { titulo: "NUVO", clave: "r_nuvo" },
    { titulo: "CLICKSI", clave: "r_clicksi" },
    { bloque: "ANÁLISIS DE PEDIDOS EN RUTA", titulo: "PEDIDOS EN RUTA", clave: "ruta" },
    { bloque: "ENTREGAS COMPARTIDAS   (COSTE DE ENVIO $1.83 cada uno)", titulo: " OFERFY", clave: "c_oferfy" },
    { titulo: "FALLIDOS OFERFY", clave: "cf_oferfy" },
    { bloque: "CAMBIOS/RETIROS/COMPLEMENTOS (COSTE DE ENVIO $2.50 cada uno)", titulo: " NUVO", clave: "k_nuvo" },
    { bloque: "PAGO POR ENTREGAS (COSTE DE ENVIO $3.65 cada uno)", titulo: "ENTREGADO NUVO", clave: "e_nuvo" },
    { titulo: "FALLIDO NUVO", clave: "ef_nuvo" },
    { titulo: "ENTREGADO  OFERFY", clave: "e_oferfy" },
    { titulo: "ENTREGADO  CLICKSI", clave: "e_clicksi" },
    { bloque: " FUERA DE RUTAS (COSTYE DE ENVIO $4 cada uno)", titulo: "ENTREGADO  OFERFY", clave: "fr_oferfy" },
    { bloque: " PAGO POR ENTREGAS (COSTE DE ENVIO $5 cada uno)", titulo: "ENTREGADO NUVO", clave: "cinco_nuvo" },
    { bloque: " PROPINAS", titulo: "ENTREGADO NUVO", clave: "p_nuvo" },
    { bloque: "CALCULOS DE PAGOS DE ENVIOS", titulo: "TOTAL DE PEDIDOS ENTREGADOS", clave: "tot" },
    { titulo: "Pagar por envíos NUVO", clave: "pg_nuvo" },
    { titulo: "Pagar por envíos OFERFY", clave: "pg_oferfy" },
    { titulo: "Pagar por envíos CLICKSI", clave: "pg_clicksi" },
    { titulo: "CÁLCULO TOTAL A PAGAR POR ENTREGAS", clave: "total" },
  ];
  return [
    cols.map((c) => c.bloque ?? null),
    cols.map((c) => c.titulo),
    ...datos.map((d) => cols.map((c) => d[c.clave] ?? null)),
  ];
}

const FECHA = 46303; // 08/10/2026 en serie de Excel

test("ubica los bloques por título, no por letra", () => {
  const e = ubicarEstructura(hoja([]))!;
  assert.ok(e);
  assert.deepEqual(e.ruta.map((r) => r.tienda), ["OFERFY", "NUVO", "CLICKSI"]);
  assert.deepEqual(
    e.tarifas.map((t) => `${t.tienda}:${t.categoria}:${t.tarifa}:${t.estado}`),
    [
      "OFERFY:compartida:1.83:entregado",
      "OFERFY:compartida:1.83:fallido",
      "NUVO:cambio:2.5:entregado",
      "NUVO:entrega:3.65:entregado",
      "NUVO:entrega:3.65:fallido",
      "OFERFY:entrega:3.65:entregado",
      "CLICKSI:entrega:3.65:entregado",
      "OFERFY:fuera_ruta:4:entregado",
      "NUVO:entrega:5:entregado",
      "NUVO:propina:1:entregado",
    ],
  );
  assert.equal(ubicarEstructura([["algo"], ["otra"]]), null);
});

test("cada celda con número es una línea; lo que salió y no se pagó queda devuelto", () => {
  const l = leerGestionDeliverys(
    hoja([
      // NUVO: 6 en ruta, 4 entregados a 3.65 y 1 fallido pagado → 1 devuelto. OFERFY: 5 en ruta, 2 compartidas.
      { fecha: FECHA, nombre: "Repartidor  Uno ", r_oferfy: 5, r_nuvo: 6, r_clicksi: 1, e_nuvo: 4, ef_nuvo: 1, c_oferfy: 2, e_clicksi: 1, p_nuvo: 0.5, pg_nuvo: 18.75, pg_oferfy: 3.66, pg_clicksi: 3.65, total: 26.06 },
      { fecha: FECHA + 1, nombre: "ZONA 3 UNO", r_nuvo: 2, cinco_nuvo: 2, k_nuvo: 0, pg_nuvo: 10, total: 10 },
    ]),
  )!;
  assert.equal(l.filas, 2);
  assert.deepEqual(l.etiquetas, ["REPARTIDOR UNO", "ZONA 3 UNO"]);
  assert.equal(l.desde, "2026-10-08");
  assert.equal(l.hasta, "2026-10-09");
  const de = (estado: string, tienda: string) => l.entregas.filter((e) => e.fila === 3 && e.estado === estado && e.tienda === tienda);
  assert.equal(de("entregado", "NUVO").find((e) => e.categoria === "entrega")!.cantidad, 4);
  assert.equal(de("fallido", "NUVO")[0].cantidad, 1);
  assert.equal(de("devuelto", "NUVO")[0].cantidad, 1);
  assert.equal(de("devuelto", "NUVO")[0].tarifa, 0);
  assert.equal(de("devuelto", "OFERFY")[0].cantidad, 3);
  assert.equal(de("devuelto", "CLICKSI").length, 0);
  const propina = l.entregas.find((e) => e.categoria === "propina")!;
  assert.equal(propina.cantidad, 1);
  assert.equal(propina.tarifa, 0.5);
  assert.equal(l.noCuadran.length, 0);
  assert.equal(l.totalExcel, 36.06);
  assert.equal(l.totalCalculado, 36.06);
  // Huellas únicas y estables.
  const claves = l.entregas.map((e) => e.origen_clave);
  assert.equal(new Set(claves).size, claves.length);
  assert.deepEqual(leerGestionDeliverys(hoja([{ fecha: FECHA, nombre: "Repartidor Uno", e_nuvo: 4, r_nuvo: 4 }]))!.entregas[0].origen_clave, l.entregas.find((e) => e.categoria === "entrega" && e.tienda === "NUVO" && e.fila === 3)!.origen_clave);
});

test("avisa lo que el Excel no suma y lo que no cuadra con su fórmula", () => {
  const l = leerGestionDeliverys(
    hoja([
      // Propina escrita como texto: la hoja no la suma, aquí tampoco.
      { fecha: FECHA, nombre: "REPARTIDOR DOS", r_nuvo: 1, e_nuvo: 1, p_nuvo: "0.6", pg_nuvo: 3.65, total: 3.65 },
      // La columna de pago del Excel dice otra cosa (una fórmula que toma la columna de otra tienda).
      { fecha: FECHA, nombre: "REPARTIDOR TRES", r_nuvo: 2, k_nuvo: 2, pg_nuvo: 0, pg_oferfy: 5, total: 5 },
      // Más pagados que los que salieron a ruta.
      { fecha: FECHA, nombre: "REPARTIDOR CUATRO", r_oferfy: 1, e_oferfy: 2, pg_oferfy: 7.3, total: 7.3 },
      { nombre: "SIN FECHA", e_nuvo: 1 },
    ]),
  )!;
  assert.ok(l.avisos.some((a) => a.fila === 3 && a.mensaje.includes("texto")));
  assert.equal(l.entregas.filter((e) => e.categoria === "propina").length, 0);
  assert.deepEqual(
    l.noCuadran.map((x) => [x.fila, x.tienda, x.excel, x.calculado]),
    [
      [4, "NUVO", 0, 5],
      [4, "OFERFY", 5, 0],
    ],
  );
  assert.ok(l.avisos.some((a) => a.fila === 5 && a.mensaje.includes("solo salieron 1")));
  assert.ok(l.avisos.some((a) => a.fila === 6));
  assert.equal(l.filas, 3);
});

test("una hoja sin la estructura no se lee", () => {
  assert.equal(leerGestionDeliverys([]), null);
  assert.equal(leerGestionDeliverys([["FECHA", "NOMBRE DEL DELIVERY"]]), null);
});
