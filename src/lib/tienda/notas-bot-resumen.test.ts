import assert from "node:assert/strict";
import test from "node:test";
import { resumirNotasBot } from "./notas-bot-resumen";

const tiendas = [
  { id: "k", dominio: "kenku.myshopify.com" },
  { id: "o", dominio: "oferfy.myshopify.com" },
];
const ahora = new Date("2026-11-21T18:00:00Z");

test("cuenta por tienda lo de hoy y los últimos 7 días, con lo quitado y lo que falló", () => {
  const r = resumirNotasBot(
    [
      { tienda_id: "k", dominio: "kenku.myshopify.com", estado: "detectada", creado_en: "2026-11-21T15:00:00Z" },
      { tienda_id: "k", dominio: "kenku.myshopify.com", estado: "borrada", creado_en: "2026-11-19T15:00:00Z" },
      { tienda_id: null, dominio: "OFERFY.myshopify.com", estado: "error", creado_en: "2026-11-21T14:00:00Z" },
      { tienda_id: "o", dominio: "oferfy.myshopify.com", estado: "detectada", creado_en: "2026-11-01T14:00:00Z" },
    ],
    ahora,
    tiendas,
  );
  assert.deepEqual(r.get("k"), { hoy: 1, sieteDias: 2, quitadas: 1, conError: 0 });
  assert.deepEqual(r.get("o"), { hoy: 1, sieteDias: 1, quitadas: 0, conError: 1 });
});

test("una tienda sin notas queda en cero y lo de otro dominio no cuenta", () => {
  const r = resumirNotasBot([{ tienda_id: null, dominio: "otra.myshopify.com", estado: "detectada", creado_en: "2026-11-21T15:00:00Z" }], ahora, tiendas);
  assert.deepEqual(r.get("k"), { hoy: 0, sieteDias: 0, quitadas: 0, conError: 0 });
});
