import assert from "node:assert/strict";
import { test } from "node:test";
import { compraCuenta } from "@/lib/compras/cuenta";
import { accionesPorPais, armarPorPais, errorDecision, paisesPorDecidir } from "./por-pais";

const productos = [
  { id: "a", padreId: null },
  { id: "b", padreId: null },
  { id: "a-m", padreId: "a" },
];
const vacio = { publicaciones: [], compras: [], stock: [], decisiones: [], descontinuados: [] };

test("publicado manda sobre comprado y stock; una variante suma a su producto", () => {
  const r = armarPorPais(productos, ["PA", "CR"], {
    ...vacio,
    publicaciones: [{ skuId: "a", pais: "PA", plataforma: "dropi", idPlataforma: "8406", ref: "p1", activa: true, stock: 598, stockReferencial: 40 }],
    compras: [
      { skuId: "a-m", compraId: "c12", pais: "CR", numero: 12, unidades: 100, etapa: "tracking", anulada: false, creada: "2026-10-01" },
      { skuId: "a", compraId: "c12", pais: "CR", numero: 12, unidades: 50, etapa: "tracking", anulada: false, creada: "2026-10-01" },
    ],
    stock: [{ skuId: "a", pais: "PA", bodega: "Oficina", unidades: 5 }],
  }, compraCuenta);
  assert.equal(r.size, 2);
  assert.equal(r.get("a")!.PA.estado, "publicado");
  assert.equal(r.get("a")!.PA.unidadesStock, 5);
  assert.equal(r.get("a")!.PA.unidadesPlataformas, 598);
  assert.equal(r.get("a")!.PA.unidadesDisponibles, 603);
  assert.equal(r.get("a")!.PA.unidadesReferencial, 40);
  assert.equal(r.get("a")!.CR.estado, "comprado");
  assert.deepEqual(r.get("a")!.CR.compras, [{ compraId: "c12", numero: 12, unidades: 150, creada: "2026-10-01" }]);
  assert.equal(r.get("b")!.PA.estado, "no");
});

test("una compra descartada o anulada no hace que exista", () => {
  const r = armarPorPais(productos, ["MX"], {
    ...vacio,
    compras: [
      { skuId: "b", compraId: "c1", pais: "MX", numero: 1, unidades: 10, etapa: "descartado", anulada: false, creada: "2026-10-01" },
      { skuId: "b", compraId: "c2", pais: "MX", numero: 2, unidades: 10, etapa: "cotizar", anulada: true, creada: "2026-10-02" },
    ],
  }, compraCuenta);
  assert.equal(r.get("b")!.MX.estado, "no");
});

test("donde no existe: descontinuado, la decisión y luego solo archivado", () => {
  const r = armarPorPais(productos, ["PA", "CR", "MX"], {
    ...vacio,
    publicaciones: [
      { skuId: "b", pais: "PA", plataforma: "dropi", idPlataforma: "1", ref: "p2", activa: false, stock: 7 },
      { skuId: "b", pais: "CR", plataforma: "drop", idPlataforma: "ID-AB", ref: "p3", activa: false, stock: null },
    ],
    decisiones: [{ skuId: "b", pais: "CR", decision: "descartado", motivo: "Saturado", por: "Alcides", en: "2026-11-05" }],
    descontinuados: [{ skuId: "b", pais: "MX" }],
  }, compraCuenta);
  assert.equal(r.get("b")!.PA.estado, "archivado");
  assert.equal(r.get("b")!.PA.unidadesDisponibles, 0);
  assert.equal(r.get("b")!.CR.estado, "descartado");
  assert.equal(r.get("b")!.MX.estado, "descontinuado");
});

test("stock en cero no cuenta; con stock existe", () => {
  const r = armarPorPais(productos, ["HN"], { ...vacio, stock: [{ skuId: "b", pais: "HN", bodega: "X", unidades: 0 }] }, compraCuenta);
  assert.equal(r.get("b")!.HN.estado, "no");
  const r2 = armarPorPais(productos, ["HN"], { ...vacio, stock: [{ skuId: "b", pais: "HN", bodega: "X", unidades: 3 }] }, compraCuenta);
  assert.equal(r2.get("b")!.HN.estado, "stock");
});

test("descartar pide motivo", () => {
  assert.equal(errorDecision("descartado", ""), "Escribe por qué se descarta (al menos 3 letras).");
  assert.equal(errorDecision("enviar", ""), null);
  assert.equal(errorDecision(null, ""), null);
  assert.equal(errorDecision("otra", ""), "Decisión desconocida.");
});

test("tarjetas: por decidir solo en activos que ya existen en otro país", () => {
  const r = armarPorPais(productos, ["PA", "CR", "MX"], {
    ...vacio,
    publicaciones: [{ skuId: "a", pais: "PA", plataforma: "dropi", idPlataforma: "1", ref: "p", activa: true, stock: null }],
    compras: [{ skuId: "a", compraId: "c", pais: "MX", numero: 1, unidades: 5, etapa: "tracking", anulada: false, creada: "2026-10-01" }],
    decisiones: [{ skuId: "a", pais: "CR", decision: "enviar", motivo: null, por: null, en: "2026-11-05" }],
  }, compraCuenta);
  const a = r.get("a")!;
  assert.deepEqual(paisesPorDecidir(a, "fisico"), []);
  assert.deepEqual(accionesPorPais(a, "fisico"), ["por_enviar", "comprado_sin_publicar"]);
  const b = r.get("b")!;
  assert.deepEqual(paisesPorDecidir(b, "fisico"), []);
  assert.deepEqual(accionesPorPais(b, "fisico"), ["ningun_pais"]);
  assert.deepEqual(accionesPorPais(b, "test"), []);
  const r2 = armarPorPais(productos, ["PA", "CR"], { ...vacio, publicaciones: [{ skuId: "b", pais: "PA", plataforma: "dropi", idPlataforma: "1", ref: "p", activa: true, stock: null }] }, compraCuenta);
  assert.deepEqual(paisesPorDecidir(r2.get("b")!, "fisico"), ["CR"]);
  assert.deepEqual(accionesPorPais(r2.get("b")!, "fisico"), ["por_decidir", "un_pais"]);
  assert.deepEqual(paisesPorDecidir(r2.get("b")!, "inactivo"), []);
});
