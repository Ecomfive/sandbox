import assert from "node:assert/strict";
import test from "node:test";
import { armarEerr, type FilaEerr } from "./eerr";
import {
  POLITICA_PREDETERMINADA,
  TIPO_COSTO_TP,
  TIPO_RECLASIFICADO,
  TIPO_VENTA_IC,
  UNIDAD_ELIMINACIONES,
  ajustesTP,
  esMercanciaPredeterminada,
  leerPoliticaTP,
  margenDe,
  politicaAJson,
  totalesTP,
  validarPoliticaTP,
  validarReglaTP,
  type VentaTP,
} from "./precio-transferencia";

// Datos inventados.
const IMP = "00000000-0000-4000-8000-0000000000a1";
const T1 = "00000000-0000-4000-8000-0000000000b1";
const T2 = "00000000-0000-4000-8000-0000000000b2";
const CORP = "00000000-0000-4000-8000-0000000000c1";
const UNIDADES = [
  { id: IMP, nombre: "ECOMFIVE", clase: "tienda" },
  { id: T1, nombre: "TIENDA UNO", clase: "tienda" },
  { id: T2, nombre: "TIENDA DOS", clase: "tienda" },
  { id: CORP, nombre: "CORPORATIVO", clase: "gestion" },
];
const M1 = "2026-03-01";
const M2 = "2026-04-01";
const f = (periodo: string, unidad: string, tipo: string, seccion: FilaEerr["seccion"], signo: number, monto: number): FilaEerr => ({ periodo, unidad_id: unidad, tipo, orden: 1, seccion, signo, monto });

const FILAS: FilaEerr[] = [
  f(M1, T1, "Ventas", "ingresos", 1, 1000),
  f(M1, T1, "Compra Mercancia Local", "costo_ventas", -1, 90),
  f(M1, T1, "Shipping por Ventas", "costo_ventas", -1, 40),
  f(M1, T1, "Publicidad", "marketing", -1, 200),
  f(M1, T2, "Ventas", "ingresos", 1, 500),
  f(M1, IMP, "Ventas", "ingresos", 1, 800),
  f(M1, IMP, "Importación - Compra de mercancia", "costo_ventas", -1, 700),
  f(M1, CORP, "Sueldos", "administracion", -1, 300),
  f(M2, T1, "Ventas", "ingresos", 1, 600),
  f(M2, T1, "COSTO DE VENTAS", "costo_ventas", -1, 50),
  f(M2, T1, "COSTO DE VENTAS", "costo_ventas", -1, -10),
];
const VENTAS: VentaTP[] = [
  { periodo: M1, unidadId: T1, productoClave: "CREMA", linea: "BELLEZA", unidades: 10, costo: 200, costoPromedio: 210, ventas: 700 },
  { periodo: M1, unidadId: T1, productoClave: "ZAPATO", linea: "CALZADO", unidades: 4, costo: 100, costoPromedio: 90, ventas: 300 },
  { periodo: M1, unidadId: T1, productoClave: "SIN COSTO", linea: null, unidades: 3, costo: 0, costoPromedio: 0, ventas: 0 },
  { periodo: M1, unidadId: T2, productoClave: "CREMA", linea: "BELLEZA", unidades: 5, costo: 100, costoPromedio: 105, ventas: 500 },
  { periodo: M2, unidadId: T1, productoClave: "CREMA", linea: "BELLEZA", unidades: 6, costo: 120, costoPromedio: 126, ventas: 600 },
  // La importadora no se compra a sí misma.
  { periodo: M1, unidadId: IMP, productoClave: "CREMA", linea: "BELLEZA", unidades: 50, costo: 1000, costoPromedio: 1000, ventas: 800 },
];
const MESES = [M1, M2];
const politica = { ...POLITICA_PREDETERMINADA, margenPct: 10 };
const reglas = [{ alcance: "categoria" as const, clave: "calzado", margenPct: 25 }];

test("el consolidado no cambia: cada ajuste suma cero entre las columnas", () => {
  const r = ajustesTP({ filas: FILAS, ventas: VENTAS, reglas, politica, unidades: UNIDADES, meses: MESES });
  const antes = armarEerr(FILAS, MESES);
  const despues = armarEerr([...FILAS, ...r.ajustes, ...r.eliminaciones], MESES);
  for (const m of MESES) {
    assert.equal(despues.ingresosNetos[m], antes.ingresosNetos[m]);
    assert.equal(despues.margenBruto[m], antes.margenBruto[m]);
    assert.equal(despues.ebitda[m], antes.ebitda[m]);
    assert.equal(despues.resultadoNeto[m], antes.resultadoNeto[m]);
    for (const s of antes.secciones) assert.equal(despues.secciones.find((x) => x.seccion === s.seccion)!.efecto[m], s.efecto[m]);
  }
  // Las líneas de ajuste quedan en cero en el consolidado.
  for (const tipo of [TIPO_VENTA_IC, TIPO_COSTO_TP, TIPO_RECLASIFICADO]) {
    const total = [...r.ajustes, ...r.eliminaciones].filter((x) => x.tipo === tipo).reduce((a, x) => a + x.monto, 0);
    assert.ok(Math.abs(total) < 0.001, tipo);
  }
});

test("la tienda queda con la mercancía completa a precio de transferencia y la importadora con el ingreso", () => {
  const r = ajustesTP({ filas: FILAS, ventas: VENTAS, reglas, politica, unidades: UNIDADES, meses: MESES });
  assert.equal(r.proveedora, IMP);
  const d1 = r.diferencias.find((d) => d.periodo === M1 && d.unidadId === T1)!;
  // Crema 200 × 1,10 + zapato 100 × 1,25 (categoría) = 345; registrado: solo la mercancía (90), no el envío.
  assert.equal(d1.esperado, 345);
  assert.equal(d1.registrado, 90);
  assert.equal(d1.costo, 300);
  assert.equal(d1.costoNoCargado, 210);
  assert.equal(d1.margenImportadora, 45);
  assert.equal(d1.diferencia, d1.costoNoCargado + d1.margenImportadora);
  assert.equal(d1.sinCosto, 3);
  assert.equal(d1.pctRegistrado, 9);
  // Mercancía de la tienda en el EERR con ajuste: 90 + 345 − 90 = 345.
  const eT1 = armarEerr([...FILAS, ...r.ajustes].filter((x) => x.unidad_id === T1), MESES);
  const mercanciaT1 = eT1.secciones.find((s) => s.seccion === "costo_ventas")!.tipos.filter((t) => t.tipo !== "Shipping por Ventas").reduce((a, t) => a + t.meses[M1], 0);
  assert.equal(mercanciaT1, 345);
  // Un reverso resta de lo registrado.
  assert.equal(r.diferencias.find((d) => d.periodo === M2 && d.unidadId === T1)!.registrado, 40);
  // La importadora: ventas intercompañía de todo lo esperado del mes y la mercancía reclasificada.
  const ic = r.ajustes.find((x) => x.unidad_id === IMP && x.tipo === TIPO_VENTA_IC && x.periodo === M1)!;
  assert.equal(ic.monto, 345 + 110);
  assert.ok(r.eliminaciones.every((x) => x.unidad_id === UNIDAD_ELIMINACIONES));
  const t = totalesTP(r.diferencias);
  assert.equal(t.diferencia, Math.round((t.esperado - t.registrado) * 100) / 100);
});

test("costo promedio y sin importadora no hay ajustes", () => {
  const prom = ajustesTP({ filas: FILAS, ventas: VENTAS, reglas: [], politica: { ...politica, base: "promedio" }, unidades: UNIDADES, meses: [M1] });
  assert.equal(prom.diferencias.find((d) => d.unidadId === T2)!.esperado, 115.5);
  const sin = ajustesTP({ filas: FILAS, ventas: VENTAS, reglas, politica, unidades: UNIDADES.filter((u) => u.id !== IMP), meses: MESES });
  assert.equal(sin.proveedora, null);
  assert.equal(sin.ajustes.length, 0);
});

test("margen: producto antes que categoría antes que el de la política", () => {
  const rs = [
    { alcance: "producto" as const, clave: "Crema", margenPct: 30 },
    { alcance: "categoria" as const, clave: "Belleza", margenPct: 20 },
  ];
  assert.deepEqual(margenDe({ productoClave: "CREMA", linea: "BELLEZA" }, rs, politica), { pct: 30, origen: "producto" });
  assert.deepEqual(margenDe({ productoClave: "LABIAL", linea: "belleza" }, rs, politica), { pct: 20, origen: "categoria" });
  assert.deepEqual(margenDe({ productoClave: "LABIAL", linea: null }, rs, politica), { pct: 10, origen: "defecto" });
});

test("política y reglas: lectura y validación", () => {
  const p = leerPoliticaTP({ margen_pct: "12,5", base: "promedio", unidad_proveedora_id: IMP, tiendas: [T1, "malo"], tipos_mercancia: ["COSTO DE VENTAS"] });
  assert.deepEqual(p, { margenPct: 12.5, base: "promedio", unidadProveedoraId: IMP, tiendas: [T1], tiposMercancia: ["COSTO DE VENTAS"] });
  assert.deepEqual(leerPoliticaTP(politicaAJson(p)), p);
  assert.deepEqual(leerPoliticaTP(null), POLITICA_PREDETERMINADA);
  assert.ok("error" in validarPoliticaTP({ margen: -1, base: "vigente" }));
  assert.ok("error" in validarPoliticaTP({ margen: 10, base: "vigente", proveedora: IMP, tiendas: [IMP] }));
  assert.deepEqual(validarPoliticaTP({ margen: "8", base: "vigente", proveedora: "", tiendas: [], tipos: null }), { ...POLITICA_PREDETERMINADA, margenPct: 8 });
  assert.ok("error" in validarReglaTP({ alcance: "otro", clave: "x", margen: 1 }));
  assert.deepEqual(validarReglaTP({ alcance: "categoria", clave: "  calzado ", margen: 25 }), { alcance: "categoria", clave: "calzado", margenPct: 25 });
  assert.ok(esMercanciaPredeterminada("Importación - Envíos"));
  assert.ok(!esMercanciaPredeterminada("Shipping por Ventas"));
});
