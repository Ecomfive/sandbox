import assert from "node:assert/strict";
import test from "node:test";
import {
  distribuir,
  filasPorSocio,
  filasPorTienda,
  leerPorcentaje,
  porcentajesVigentes,
  socioDelRetiro,
  sumaEn,
  utilidadPorUnidad,
  type Participacion,
  type Socio,
} from "./utilidades";

const ENE = "2026-01-01";
const FEB = "2026-02-01";
const MESES = [ENE, FEB];

// Datos inventados.
const SOCIOS: Socio[] = [
  { id: "ana", nombre: "Ana Pérez", alias: ["ANA PEREZ"] },
  { id: "beto", nombre: "Beto Ruiz", alias: ["BETO"] },
  { id: "soc", nombre: "Sociedad X", alias: [] },
];

const P = (socio: string, unidad: string, porcentaje: number, desde = ENE): Participacion => ({
  socio_id: socio, unidad_id: unidad, porcentaje, vigente_desde: desde,
});

test("la base es la utilidad antes de retiros de dividendos", () => {
  const u = utilidadPorUnidad(
    [
      { periodo: ENE, unidad_id: "t1", tipo: "Ingresos", efecto: 1000 },
      { periodo: ENE, unidad_id: "t1", tipo: "SUELDOS", efecto: -400 },
      { periodo: ENE, unidad_id: "t1", tipo: "Retiro de dividendos", efecto: -100 },
      { periodo: "2025-12-01", unidad_id: "t1", tipo: "Ingresos", efecto: 9 },
    ],
    MESES,
  );
  assert.equal(u.get("t1")![ENE], 600);
  assert.equal(u.get("t1")![FEB], 0);
});

test("porcentajes vigentes: la fila más reciente que ya empezó, sin los ceros", () => {
  const ps = [P("ana", "t1", 50), P("beto", "t1", 50), P("ana", "t1", 0, FEB), P("beto", "t1", 100, FEB)];
  assert.deepEqual([...porcentajesVigentes(ps, "t1", ENE)], [["ana", 50], ["beto", 50]]);
  assert.deepEqual([...porcentajesVigentes(ps, "t1", FEB)], [["beto", 100]]);
  assert.equal(porcentajesVigentes(ps, "t2", FEB).size, 0);
});

test("atribuir un retiro: a mano manda; si no, el alias que aparece primero", () => {
  assert.equal(socioDelRetiro({ descripcion: "TRANSFERENCIA A ANA PÉREZ", socio_manual: null }, SOCIOS), "ana");
  assert.equal(socioDelRetiro({ descripcion: "RETIRO BETO - TRANSFERENCIA A ANA PEREZ", socio_manual: null }, SOCIOS), "beto");
  assert.equal(socioDelRetiro({ descripcion: "COMPRA EN TIENDA", socio_manual: null }, SOCIOS), null);
  assert.equal(socioDelRetiro({ descripcion: "TRANSFERENCIA A ANA PEREZ", socio_manual: "soc" }, SOCIOS), "soc");
});

test("reparto por tienda y cuenta de cada socio", () => {
  const utilidades = new Map([
    ["t1", { [ENE]: 1000, [FEB]: -200 }],
    ["t2", { [ENE]: 400, [FEB]: 400 }],
    ["corp", { [ENE]: -50, [FEB]: 0 }],
  ]);
  const d = distribuir({
    meses: MESES,
    utilidades,
    participaciones: [P("ana", "t1", 95), P("beto", "t1", 5), P("ana", "t2", 47.5), P("soc", "t2", 47.5), P("beto", "t2", 5)],
    socios: SOCIOS,
    retiros: [
      { id: "r1", periodo: ENE, unidad_id: "corp", descripcion: "TRANSFERENCIA ANA PEREZ", monto: 300, socio_manual: null },
      { id: "r2", periodo: FEB, unidad_id: "corp", descripcion: "AMAZON", monto: 20, socio_manual: null },
      { id: "r3", periodo: "2025-12-01", unidad_id: "corp", descripcion: "BETO", monto: 999, socio_manual: null },
    ],
  });
  const ana = d.socios.find((s) => s.socio_id === "ana")!;
  assert.equal(ana.parte[ENE], 950 + 190);
  assert.equal(ana.parte[FEB], -190 + 190, "una pérdida también se reparte");
  assert.equal(ana.retiros[ENE], 300);
  assert.equal(ana.saldo[ENE], 840);
  assert.equal(ana.saldo[FEB], 840);
  const soc = d.socios.find((s) => s.socio_id === "soc")!;
  assert.equal(sumaEn(soc.parte, MESES), 380);
  assert.equal(d.retirosSinAtribuir[FEB], 20);
  const corp = d.unidades.find((u) => u.unidad_id === "corp")!;
  assert.equal(corp.sinRepartir[ENE], -50, "sin porcentajes, todo queda sin repartir");
  const t2 = d.unidades.find((u) => u.unidad_id === "t2")!;
  assert.equal(t2.sumaPorcentajes[ENE], 100);
  assert.equal(t2.sinRepartir[ENE], 0);
  // Todo lo que entra sale: utilidad = repartido + sin repartir.
  for (const u of d.unidades) for (const m of MESES) assert.equal(Math.round((u.repartido[m] + u.sinRepartir[m]) * 100) / 100, u.utilidad[m]);
});

test("filas de las tablas por socio y por tienda", () => {
  const d = distribuir({
    meses: MESES,
    utilidades: new Map([
      ["t1", { [ENE]: 1000, [FEB]: 500 }],
      ["corp", { [ENE]: -50, [FEB]: 0 }],
    ]),
    participaciones: [P("ana", "t1", 95), P("beto", "t1", 5), P("beto", "t1", 0, FEB)],
    socios: SOCIOS,
    retiros: [{ id: "r", periodo: FEB, unidad_id: "corp", descripcion: "AMAZON", monto: 10, socio_manual: null }],
  });
  const nombres = new Map(SOCIOS.map((s) => [s.id, s.nombre]));
  // La ventana es solo febrero, pero el saldo se acumula desde enero.
  const socio = filasPorSocio(d, nombres, [FEB]);
  const ana = socio.find((f) => f.clave === "ana-saldo")!;
  assert.equal(ana.total, 950 + 475);
  assert.ok(!socio.some((f) => f.clave.startsWith("soc-")), "un socio sin nada no aparece");
  assert.equal(socio.at(-1)!.clave, "sin-atribuir");
  assert.equal(socio.at(-1)!.valores[FEB], -10);
  const tiendas = filasPorTienda(d, [P("ana", "t1", 95), P("beto", "t1", 5), P("beto", "t1", 0, FEB)], new Map([["t1", "Tienda 1"], ["corp", "Corp"]]), nombres, MESES);
  assert.equal(tiendas[0].etiqueta, "Tienda 1");
  assert.ok(tiendas.some((f) => f.etiqueta === "Ana Pérez · 95 %"));
  assert.ok(tiendas.some((f) => f.etiqueta === "Beto Ruiz"), "sin porcentaje vigente al final, sin «%»");
  assert.ok(tiendas.some((f) => f.clave === "t1-sin" && f.valores[FEB] === 25), "lo que dejó de tener socio queda sin repartir");
  assert.ok(tiendas.some((f) => f.clave === "corp-sin"));
});

test("porcentaje de un formulario", () => {
  assert.equal(leerPorcentaje("47,5"), 47.5);
  assert.equal(leerPorcentaje("5 %"), 5);
  assert.equal(leerPorcentaje("101"), null);
  assert.equal(leerPorcentaje("-1"), null);
  assert.equal(leerPorcentaje("abc"), null);
  assert.equal(leerPorcentaje(null), null);
});
