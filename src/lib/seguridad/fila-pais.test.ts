import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { filaDePaisPermitida, filasDePaisesVisibles, idsDePaisesVisibles, idsPaisesPermitidos } from "./fila-pais";

const PAISES = [
  { id: "id-pa", codigo: "PA" },
  { id: "id-cr", codigo: "CR" },
  { id: "id-mx", codigo: "MX" },
];

// Una base de mentira: `tablas[tabla]` son sus filas; entiende `.select().eq().maybeSingle()` y `.select()` a secas.
function baseFalsa(tablas: Record<string, Record<string, unknown>[]>) {
  const lecturas: string[] = [];
  const cliente = {
    from(tabla: string) {
      lecturas.push(tabla);
      const filas = tablas[tabla] ?? [];
      return {
        select() {
          return {
            eq(col: string, valor: unknown) {
              return { maybeSingle: async () => ({ data: filas.find((f) => f[col] === valor) ?? null, error: null }) };
            },
            then(ok: (r: { data: unknown[]; error: null }) => unknown) {
              return Promise.resolve({ data: filas, error: null }).then(ok);
            },
          };
        },
      };
    },
  };
  return { cliente: cliente as unknown as SupabaseClient, lecturas };
}

test("idsDePaisesVisibles: sin límite, todos (null); con límite, solo los suyos", () => {
  assert.equal(idsDePaisesVisibles(PAISES, null), null);
  assert.deepEqual(idsDePaisesVisibles(PAISES, ["PA", "CR"]), ["id-pa", "id-cr"]);
  assert.deepEqual(idsDePaisesVisibles(PAISES, ["importacion"]), []);
  assert.deepEqual(idsDePaisesVisibles(PAISES, []), []);
});

test("filasDePaisesVisibles: deja solo las filas de un país visible", () => {
  const filas = [
    { id: "a", pais_id: "id-pa" },
    { id: "b", pais_id: "id-cr" },
    { id: "c", pais_id: null },
  ];
  assert.deepEqual(filasDePaisesVisibles(filas, null), filas);
  assert.deepEqual(
    filasDePaisesVisibles(filas, ["id-pa"]).map((f) => f.id),
    ["a"],
  );
  assert.deepEqual(filasDePaisesVisibles(filas, []), []);
});

test("filaDePaisPermitida: sin límite no lee la base", async () => {
  const { cliente, lecturas } = baseFalsa({});
  assert.equal(await filaDePaisPermitida(cliente, null, "retiros", "x"), true);
  assert.deepEqual(lecturas, []);
});

test("filaDePaisPermitida: una persona solo de PA no toca una fila de CR", async () => {
  const { cliente } = baseFalsa({
    paises: PAISES,
    retiros: [
      { id: "r-pa", pais_id: "id-pa" },
      { id: "r-cr", pais_id: "id-cr" },
    ],
  });
  assert.equal(await filaDePaisPermitida(cliente, ["PA"], "retiros", "r-pa"), true);
  assert.equal(await filaDePaisPermitida(cliente, ["PA"], "retiros", "r-cr"), false);
  // Una fila que no existe tampoco pasa.
  assert.equal(await filaDePaisPermitida(cliente, ["PA"], "retiros", "no-existe"), false);
});

test("idsPaisesPermitidos: lee los países y deja los suyos", async () => {
  const { cliente } = baseFalsa({ paises: PAISES });
  assert.equal(await idsPaisesPermitidos(cliente, null), null);
  assert.deepEqual(await idsPaisesPermitidos(cliente, ["CR"]), ["id-cr"]);
});
