import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cambiosDeLectura, diasDeStock, diasGanando, esPrivado, fotoTuWinner, leerLectura, ventasPorDia, type ProductoLeido } from "./tuwinner";
import { LECTOR_TUWINNER } from "./lector";

const leido = (dropi_id: string, extra: Partial<ProductoLeido> = {}): ProductoLeido => ({
  tw_id: "abc12def34",
  dropi_id,
  nombre: "Drenaje linfático",
  precio: 6.5,
  sugerido: 20,
  proveedor: "Nibresma",
  proveedor_id: "27844",
  plataforma: "Dropi PA",
  categoria: null,
  stock: 100,
  ventas7: 50,
  imagen_v: 0,
  dias: [],
  ...extra,
});

test("lo que sube el lector: solo Panamá y México, con ID de Dropi y nombre, sin repetir", () => {
  const l = leerLectura({
    leido_en: "2026-11-02T11:00:00Z",
    paises: {
      PA: [
        { tw_id: "2d7kiw4d69hqw1f", dropi_id: "11253", nombre: " DRENAJE LINFÁTICO ", precio: 6.5, sugerido: 20, stock: 9273, ventas7: 1621, imagen_v: 0, dias: [["2026-10-25", 990], ["mal", 3], ["2026-10-26", 964]] },
        { tw_id: "2d7kiw4d69hqw1f", dropi_id: "11253", nombre: "repetido" },
        { tw_id: "x", dropi_id: "1", nombre: "id de Tu Winner raro" },
        { tw_id: "abcdef12345", dropi_id: "no-es-id", nombre: "sin ID de Dropi" },
      ],
      CR: [{ tw_id: "abcdef12345", dropi_id: "1", nombre: "Costa Rica no va" }],
    },
  });
  assert.ok(l);
  assert.deepEqual(Object.keys(l.paises), ["PA"]);
  assert.equal(l.paises.PA!.length, 1);
  assert.equal(l.paises.PA![0].nombre, "DRENAJE LINFÁTICO");
  assert.deepEqual(l.paises.PA![0].dias, [["2026-10-25", 990], ["2026-10-26", 964]]);
  assert.equal(leerLectura({ paises: {} }), null);
  assert.equal(leerLectura("nada"), null);
});

test("las ventas de cada día son lo que bajó el stock; si subió, reabasteció", () => {
  const v = ventasPorDia([
    { dia: "2026-10-26", stock: 964 },
    { dia: "2026-10-25", stock: 990 },
    { dia: "2026-10-27", stock: 10868 },
    { dia: "2026-10-28", stock: 10740 },
  ]);
  assert.deepEqual(v, [
    { dia: "2026-10-26", ventas: 26, reabastecio: 0 },
    { dia: "2026-10-27", ventas: 0, reabastecio: 9904 },
    { dia: "2026-10-28", ventas: 128, reabastecio: 0 },
  ]);
  assert.deepEqual(ventasPorDia([{ dia: "2026-10-25", stock: 5 }]), []);
});

test("la foto de Tu Winner, con su versión", () => {
  assert.equal(fotoTuWinner("PA", "2d7kiw4d69hqw1f", 0), "https://pa.imgtuwinner.xyz/file/imagesPA/2d7kiw4d69hqw1f_thumb.webp");
  assert.equal(fotoTuWinner("MX", "e7mb7z22nonm6nj", 2), "https://mx.imgtuwinner.xyz/file/imagesMX/e7mb7z22nonm6nj_2_thumb.webp");
});

test("qué cambió entre lecturas y desde cuándo gana cada uno", () => {
  const antes = [
    { dropi_id: "1", ganador: true, ganador_desde: "2026-10-30", precio: 7, proveedor: "Nibresma" },
    { dropi_id: "2", ganador: true, ganador_desde: "2026-10-31", precio: 10, proveedor: "Sebastian" },
    { dropi_id: "3", ganador: false, ganador_desde: null, precio: 5, proveedor: "X" },
  ];
  const r = cambiosDeLectura(antes, [leido("1", { precio: 8, proveedor: "Nibresma" }), leido("3", { proveedor: "Y", precio: 5 }), leido("4")], "2026-11-02T11:00:00Z");
  assert.equal(r.ganadorDesde.get("1"), "2026-10-30");
  assert.equal(r.ganadorDesde.get("3"), "2026-11-02");
  assert.equal(r.ganadorDesde.get("4"), "2026-11-02");
  assert.deepEqual(r.salieron, ["2"]);
  assert.deepEqual(
    r.eventos.map((e) => `${e.dropi_id}:${e.tipo}`).sort(),
    ["1:precio", "2:salio", "3:entro", "3:proveedor", "4:entro"],
  );
  assert.equal(r.eventos.find((e) => e.tipo === "precio")?.despues, "8");
});

test("días seguidos ganando, privados y días de stock", () => {
  assert.equal(diasGanando("2026-10-25", "2026-11-02T11:00:00Z"), 9);
  assert.equal(diasGanando("2026-11-02", "2026-11-02"), 1);
  assert.equal(diasGanando(null, "2026-11-02"), 0);
  assert.ok(esPrivado("PRIV-NMN") && esPrivado("Privado 005") && esPrivado("PRIVADO - SM") && esPrivado("PRIV LYM"));
  assert.ok(!esPrivado("Probióticos privados de algo") && !esPrivado("Primavera"));
  assert.equal(diasDeStock(101, 407), 2);
  assert.equal(diasDeStock(100, 0), null);
});

test("la extensión conoce el lector de Tu Winner y lo corre igual que la consola", () => {
  const ext = (f: string) => readFileSync(`extension/ecomfive-dropi/${f}`, "utf8");
  assert.equal(ext(LECTOR_TUWINNER.archivo), readFileSync("scripts/tuwinner-navegador.js", "utf8"));
  const l = LECTOR_TUWINNER;
  assert.ok(ext("fondo.js").includes(`tuwinner: { pais: "${l.pais}", archivo: "${l.archivo}", funcion: "${l.funcion}", estado: "${l.estado}", archivos: ${JSON.stringify(l.archivos)} }`));
  assert.ok(ext(l.archivo).includes(`async function ${l.funcion}(`));
  const m = JSON.parse(ext("manifest.json")) as { host_permissions: string[] };
  assert.ok(m.host_permissions.includes("https://app.tuwinner.com/*"));
});
