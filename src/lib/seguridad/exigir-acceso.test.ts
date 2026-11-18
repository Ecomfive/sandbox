// `exigirAcceso` (plan de seguridad, fase 4 · 18 nov 2026): el orden módulo → país → tienda, los avisos de siempre y que
// sin límites no se lea nada de la base. Se prueba `revisarAcceso` con dobles en lugar de la base.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { UsuarioActual } from "@/lib/auth";
import { SIN_ACCESO_TIENDA, SOLO_TODA_LA_EMPRESA } from "@/lib/finanzas/acceso-tienda";
import { unidadesFueraDePermiso } from "@/lib/finanzas/tiendas-permitidas";
import { puedeVerBodega, puedeVerPaisId, SIN_ACCESO_PAIS } from "@/lib/seguridad/pais-acceso";
import { filaDePaisPermitida } from "@/lib/seguridad/fila-pais";
import { revisarAcceso, type DependenciasAcceso } from "./exigir-acceso";

const TIENDA_A = "11111111-1111-1111-1111-111111111111";
const TIENDA_B = "22222222-2222-2222-2222-222222222222";

function usuario(extra: Partial<UsuarioActual> = {}): UsuarioActual {
  return {
    id: "u1",
    email: "a@b.c",
    nombre: null,
    avatarUrl: null,
    rolId: null,
    rolNombre: null,
    modulos: ["bodegas", "finanzas"],
    modulosSoloLectura: ["finanzas"],
    primerIngresoEn: null,
    vistaPrevia: null,
    afinado: {},
    tiendasPermitidas: null,
    paisesPermitidos: null,
    ...extra,
  };
}

// Una base de mentira: `tablas[tabla]` son sus filas; entiende `.select().eq().maybeSingle()` y `.select().in()`. Anota cada lectura.
function baseFalsa(tablas: Record<string, Record<string, unknown>[]>) {
  const lecturas: string[] = [];
  const cliente = {
    from(tabla: string) {
      lecturas.push(tabla);
      const filas = tablas[tabla] ?? [];
      return {
        select() {
          return {
            eq: (col: string, valor: unknown) => ({ maybeSingle: async () => ({ data: filas.find((f) => f[col] === valor) ?? null, error: null }) }),
            in: async (col: string, valores: unknown[]) => ({ data: filas.filter((f) => valores.includes(f[col])), error: null }),
          };
        },
      };
    },
  };
  return { cliente: cliente as unknown as SupabaseClient, lecturas };
}

const BASE = {
  paises: [
    { id: "id-pa", codigo: "PA" },
    { id: "id-cr", codigo: "CR" },
  ],
  wms_bodegas: [
    { id: "bod-pa", pais_id: "id-pa" },
    { id: "bod-cr", pais_id: "id-cr" },
  ],
  wms_productos: [{ id: "prod-cr", pais_id: "id-cr" }],
  fin_bienes_uso: [
    { id: "bien-a", unidad_id: TIENDA_A },
    { id: "bien-b", unidad_id: TIENDA_B },
  ],
};

/**
 * Dobles: las reglas de país son las reales sobre la base falsa; las de tienda leen la lista de `tiendas` (las reales la sacan
 * de la sesión). `llamadas` anota cada consulta (crear el cliente incluido).
 */
function dobles(tiendas: string[] | null) {
  const { cliente, lecturas } = baseFalsa(BASE);
  const llamadas: string[] = [];
  const deps: DependenciasAcceso = {
    cliente: () => (llamadas.push("cliente"), cliente),
    puedeVerPaisId: (s, p, id) => (llamadas.push("pais"), puedeVerPaisId(s, p, id)),
    filaDePaisPermitida: (s, p, t, id) => (llamadas.push("fila"), filaDePaisPermitida(s, p, t, id)),
    puedeVerBodega: (s, p, id) => (llamadas.push("bodega"), puedeVerBodega(s, p, id)),
    sinAccesoAUnidades: async (u) => (llamadas.push("unidades"), tiendas && unidadesFueraDePermiso(tiendas, u).length ? SIN_ACCESO_TIENDA : null),
    sinAccesoARegistros: async (s, tabla, ids) => {
      llamadas.push("registros");
      if (!tiendas) return null;
      const { data } = await s.from(tabla).select("id, unidad_id").in("id", ids);
      return (data as { unidad_id: string }[]).some((f) => !tiendas.includes(f.unidad_id)) ? SIN_ACCESO_TIENDA : null;
    },
    sinAccesoTodaLaEmpresa: async () => (llamadas.push("empresa"), tiendas ? SOLO_TODA_LA_EMPRESA : null),
  };
  return { deps, llamadas, lecturas };
}

test("sin sesión o sin el módulo: el aviso de siempre", async () => {
  const { deps } = dobles(null);
  assert.deepEqual(await revisarAcceso(null, { modulo: "bodegas" }, deps), { error: "No hay sesión activa." });
  assert.deepEqual(await revisarAcceso(usuario(), { modulo: "compras" }, deps), { error: "No tienes acceso a este módulo." });
});

test("solo lectura: lee, pero no escribe", async () => {
  const { deps } = dobles(null);
  const u = usuario();
  assert.deepEqual(await revisarAcceso(u, { modulo: "finanzas" }, deps), { usuario: u });
  assert.deepEqual(await revisarAcceso(u, { modulo: "finanzas", escritura: true }, deps), { error: "Tu rol solo tiene acceso de lectura a este módulo." });
});

test("el módulo va primero: sin él no se lee nada aunque falten país y tienda", async () => {
  const { deps, llamadas } = dobles([TIENDA_A]);
  const u = usuario({ paisesPermitidos: ["PA"], tiendasPermitidas: [TIENDA_A] });
  const r = await revisarAcceso(u, { modulo: "compras", paisId: "id-cr", unidades: [TIENDA_B] }, deps);
  assert.equal(r.error, "No tienes acceso a este módulo.");
  assert.deepEqual(llamadas, []);
});

test("país que no es suyo (por id, por fila o por bodega): SIN_ACCESO_PAIS", async () => {
  const { deps } = dobles(null);
  const u = usuario({ paisesPermitidos: ["PA"] });
  assert.equal((await revisarAcceso(u, { modulo: "bodegas", paisId: "id-cr" }, deps)).error, SIN_ACCESO_PAIS);
  assert.equal((await revisarAcceso(u, { modulo: "bodegas", paisId: null }, deps)).error, SIN_ACCESO_PAIS);
  assert.equal((await revisarAcceso(u, { modulo: "bodegas", filaDePais: { tabla: "wms_productos", id: "prod-cr" } }, deps)).error, SIN_ACCESO_PAIS);
  assert.equal((await revisarAcceso(u, { modulo: "bodegas", bodegaId: "bod-cr" }, deps)).error, SIN_ACCESO_PAIS);
  assert.equal((await revisarAcceso(u, { modulo: "bodegas", bodegaId: "no-existe" }, deps)).error, SIN_ACCESO_PAIS);
  assert.equal((await revisarAcceso(u, { modulo: "bodegas", bodegaId: null }, deps)).error, SIN_ACCESO_PAIS);
  assert.deepEqual(await revisarAcceso(u, { modulo: "bodegas", paisId: "id-pa", bodegaId: "bod-pa" }, deps), { usuario: u });
});

test("tienda que no es suya (por id o por registro): SIN_ACCESO_TIENDA", async () => {
  const { deps } = dobles([TIENDA_A]);
  const u = usuario({ tiendasPermitidas: [TIENDA_A] });
  assert.equal((await revisarAcceso(u, { modulo: "bodegas", unidades: [TIENDA_B] }, deps)).error, SIN_ACCESO_TIENDA);
  assert.equal((await revisarAcceso(u, { modulo: "bodegas", unidades: [null] }, deps)).error, SIN_ACCESO_TIENDA);
  assert.equal((await revisarAcceso(u, { modulo: "bodegas", registros: { tabla: "fin_bienes_uso", ids: ["bien-b"] } }, deps)).error, SIN_ACCESO_TIENDA);
  assert.deepEqual(await revisarAcceso(u, { modulo: "bodegas", unidades: [TIENDA_A], registros: { tabla: "fin_bienes_uso", ids: ["bien-a"] } }, deps), { usuario: u });
});

test("con tiendas limitadas, lo de toda la empresa: SOLO_TODA_LA_EMPRESA", async () => {
  const { deps } = dobles([TIENDA_A]);
  const r = await revisarAcceso(usuario({ tiendasPermitidas: [TIENDA_A] }), { modulo: "bodegas", escritura: true, todaLaEmpresa: true }, deps);
  assert.equal(r.error, SOLO_TODA_LA_EMPRESA);
});

test("el país se revisa antes que la tienda", async () => {
  const { deps, llamadas } = dobles([TIENDA_A]);
  const u = usuario({ paisesPermitidos: ["PA"], tiendasPermitidas: [TIENDA_A] });
  assert.equal((await revisarAcceso(u, { modulo: "bodegas", paisId: "id-cr", unidades: [TIENDA_B] }, deps)).error, SIN_ACCESO_PAIS);
  assert.ok(!llamadas.includes("unidades"));
});

test("sin límites de país ni de tienda: pasa sin leer la base", async () => {
  const { deps, llamadas, lecturas } = dobles(null);
  const u = usuario();
  const r = await revisarAcceso(
    u,
    {
      modulo: "bodegas",
      escritura: true,
      paisId: "id-cr",
      filaDePais: { tabla: "wms_productos", id: "prod-cr" },
      bodegaId: "bod-cr",
      unidades: [TIENDA_B, null],
      registros: { tabla: "fin_bienes_uso", ids: ["bien-b"] },
      todaLaEmpresa: true,
    },
    deps,
  );
  assert.deepEqual(r, { usuario: u });
  assert.deepEqual(llamadas, []);
  assert.deepEqual(lecturas, []);
});
