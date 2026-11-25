import assert from "node:assert/strict";
import { test } from "node:test";
import { COSTOS_DE_LA_HOJA, costoPorVenta, filasDeCostos, revisarCostos, sumarPedidos, tasasDe } from "./costos-operacion";
import { entregasPorProducto } from "./historico-datos";

const redondo = (n: number) => Math.round(n * 100) / 100;

test("las cuentas son las de la hoja: CPA real, envíos y costo por venta entregada", () => {
  // Los valores de la hoja: 53 % de envío, 100 % de entrega, envío $6.27, operativo $2.25 y CPA de Meta $6.86.
  const a = costoPorVenta(6.86, 0.53, 1, COSTOS_DE_LA_HOJA)!;
  assert.deepEqual([redondo(a.cpaReal), a.envios, a.operativo, redondo(a.total)], [12.94, 6.27, 2.25, 21.46]);
  // Lo que no se entrega paga su envío otra vez, y la comisión solo se cobra en lo entregado.
  const b = costoPorVenta(8, 0.8, 0.75, { envio: 6, cod: 1, operativo: 2 })!;
  assert.deepEqual([redondo(b.cpaReal), b.envios, redondo(b.total)], [13.33, 8.25, 23.58]);
  assert.equal(costoPorVenta(null, 0.5, 1, COSTOS_DE_LA_HOJA), null);
  assert.equal(costoPorVenta(8, null, 1, COSTOS_DE_LA_HOJA), null);
  assert.equal(costoPorVenta(8, 0.5, 0, COSTOS_DE_LA_HOJA), null);
});

test("los porcentajes salen de los pedidos: lo pendiente no cuenta como enviado ni como cancelado", () => {
  const lineas = (estado: string, cantidad: number) => ({ producto: "Aceite", cantidad, estado, servicio: false });
  const p = entregasPorProducto([lineas("entregada", 60), lineas("devuelta", 10), lineas("en_transito", 10), lineas("pendiente", 25), lineas("cancelada", 12), lineas("no_gestionada", 8)]).get("Aceite")!;
  assert.deepEqual([p.enCamino, p.sinEnviar], [35, 25]);
  const t = tasasDe(p);
  assert.equal(t.envio, 80 / 100);
  assert.equal(t.entrega, 60 / 70);
  // Con pocos pedidos no hay porcentaje, y un análisis viejo (sin separar lo pendiente) no da el de envío.
  assert.deepEqual(tasasDe({ entregadas: 3, devueltas: 1, canceladas: 2, enCamino: 1, sinEnviar: 0 }), { envio: null, entrega: null });
  assert.deepEqual(tasasDe({ entregadas: 60, devueltas: 10, canceladas: 20, enCamino: 35 }), { envio: null, entrega: 60 / 70 });
  assert.equal(sumarPedidos([p, { entregadas: 1, devueltas: 0, canceladas: 0, enCamino: 4 }]).sinEnviar, undefined);
  assert.equal(sumarPedidos([p, p]).entregadas, 120);
});

test("un producto con pocos pedidos usa el porcentaje de la tienda y lo dice", () => {
  const filas = filasDeCostos(
    [
      { clave: "A", nombre: "A", gasto: 100, compras: 20 },
      { clave: "B", nombre: "B", gasto: 300, compras: 30 },
      { clave: "C", nombre: "C", gasto: 50, compras: 0 },
      { clave: "", nombre: "Sin producto", gasto: 10, compras: 1 },
    ],
    { A: { entregadas: 40, devueltas: 10, canceladas: 50, enCamino: 0, sinEnviar: 0 } },
    { envio: 0.64, entrega: 0.85 },
    COSTOS_DE_LA_HOJA,
  );
  assert.deepEqual(filas.map((f) => f.clave), ["B", "A", "C"]);
  const [b, a, c] = filas;
  assert.deepEqual([a.envio, a.entrega, a.envioDeLaTienda, a.entregaDeLaTienda], [0.5, 0.8, false, false]);
  assert.equal(redondo(a.costo!.cpaReal), 12.5);
  assert.deepEqual([b.envio, b.entrega, b.envioDeLaTienda, b.entregaDeLaTienda], [0.64, 0.85, true, true]);
  assert.equal(c.costo, null);
});

test("lo que se escribe en la pantalla se revisa", () => {
  assert.deepEqual(revisarCostos({ envio: "5,5", cod: 0, operativo: "2.255" }), { costos: { envio: 5.5, cod: 0, operativo: 2.26 } });
  assert.match((revisarCostos({ envio: -1, cod: 0, operativo: 1 }) as { error: string }).error, /envío/);
  assert.match((revisarCostos({ envio: 1, cod: "", operativo: 1 }) as { error: string }).error, /contra entrega/);
  assert.match((revisarCostos({ envio: 1, cod: 0, operativo: 9999 }) as { error: string }).error, /operativo/);
});
