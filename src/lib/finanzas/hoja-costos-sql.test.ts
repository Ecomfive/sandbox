// La regla del costo de venta vive dos veces: en SQL (`fin_costo_hoja_en`, migración 0992: reportería de pedidos, Estado
// de resultados, Unidad económica) y en TypeScript (`costoEn`: Pedidos Dropi, Inventario y Producto). Esta prueba corre la
// función de la migración en un Postgres de prueba (PGlite) y compara las dos con los mismos casos. Si PGlite no está
// instalado (`npm i -D @electric-sql/pglite`), se salta.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { costoEn, type CatalogoCostos } from "./hoja-costos";

type Fila = { sku: string; llegada: string | null; costo: number; creado: string };

const FILAS: Fila[] = [
  { sku: "a", llegada: "2025-04-28", costo: 1.08, creado: "2026-11-26T10:00:00Z" },
  { sku: "a", llegada: "2026-01-22", costo: 1.12, creado: "2026-11-26T10:00:01Z" },
  { sku: "a", llegada: "2026-01-22", costo: 1.15, creado: "2026-11-26T10:00:02Z" },
  { sku: "b", llegada: null, costo: 2.5, creado: "2026-11-26T10:00:03Z" },
  { sku: "b", llegada: null, costo: 2.7, creado: "2026-11-26T10:00:04Z" },
  { sku: "c", llegada: "2026-06-01", costo: 0.4, creado: "2026-11-26T10:00:05Z" },
];
const COMPONENTES = [
  { combo: "pack", componente: "a", cantidad: 2 },
  { combo: "pack2", componente: "a", cantidad: 1 },
  { combo: "pack2", componente: "sin", cantidad: 1 },
];
const PADRE = [{ hijo: "var", padre: "c" }];
const SKUS = ["a", "b", "c", "pack", "pack2", "sin", "var"];
const FECHAS = ["2024-01-01", "2025-04-28", "2025-12-31", "2026-01-22", "2026-03-15", "2026-06-01", "2027-01-01"];

test("la regla en SQL y en TypeScript da el mismo costo", async (t) => {
  let PGlite: new () => { exec: (s: string) => Promise<unknown>; query: (s: string, p?: unknown[]) => Promise<{ rows: { c: string | null }[] }> };
  try {
    ({ PGlite } = await import(/* webpackIgnore: true */ "@electric-sql/pglite" as string));
  } catch {
    t.skip("PGlite no está instalado");
    return;
  }
  const db = new PGlite();
  const ids = new Map(SKUS.map((s, i) => [s, `00000000-0000-0000-0000-${String(i + 1).padStart(12, "0")}`]));
  await db.exec(`
    create table skus_maestros(id uuid primary key, numero bigint, codigo text, padre_id uuid);
    create table sku_maestro_componentes(combo_id uuid, componente_id uuid, cantidad int);
    create table fin_costos_lotes(id serial primary key, sku_maestro_id uuid, fecha_llegada date, costo_total numeric, en_hoja_costos boolean, creado_en timestamptz);
    create role anon; create role authenticated;
  `);
  for (const s of SKUS) await db.query("insert into skus_maestros(id) values ($1)", [ids.get(s)]);
  for (const p of PADRE) await db.query("update skus_maestros set padre_id = $1 where id = $2", [ids.get(p.padre), ids.get(p.hijo)]);
  for (const c of COMPONENTES) await db.query("insert into sku_maestro_componentes values ($1, $2, $3)", [ids.get(c.combo), ids.get(c.componente), c.cantidad]);
  for (const f of FILAS) await db.query("insert into fin_costos_lotes(sku_maestro_id, fecha_llegada, costo_total, en_hoja_costos, creado_en) values ($1, $2, $3, true, $4)", [ids.get(f.sku), f.llegada, f.costo, f.creado]);
  const mig = readFileSync(join(process.cwd(), "supabase/migrations/0992_costos_producto_hoja.sql"), "utf8");
  const desde = mig.indexOf("create or replace function fin_costo_hoja_en");
  const hasta = mig.indexOf("revoke all on function fin_costo_hoja_en");
  assert.ok(desde > 0 && hasta > desde, "no se encontró fin_costo_hoja_en en la migración");
  await db.exec(mig.slice(desde, hasta));

  const cat: CatalogoCostos = { compras: new Map(), componentes: new Map(), padre: new Map(PADRE.map((p) => [p.hijo, p.padre])) };
  for (const f of FILAS) cat.compras.set(f.sku, [...(cat.compras.get(f.sku) ?? []), { llegada: f.llegada, costo: f.costo, creado: f.creado }]);
  for (const c of COMPONENTES) cat.componentes.set(c.combo, [...(cat.componentes.get(c.combo) ?? []), { componente: c.componente, cantidad: c.cantidad }]);

  for (const s of SKUS)
    for (const fecha of FECHAS) {
      const { rows } = await db.query("select fin_costo_hoja_en($1, $2::date)::text as c", [ids.get(s), fecha]);
      const sql = rows[0].c === null ? null : Number(rows[0].c);
      assert.equal(sql, costoEn(cat, s, fecha), `${s} el ${fecha}`);
    }
});
