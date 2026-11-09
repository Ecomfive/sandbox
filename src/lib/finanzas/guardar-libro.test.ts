import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cerrarImportacion, guardarLoteMovimientos, origenDeArchivo, validarBase, validarMovimiento } from "./guardar-libro";
import type { MovimientoExcel } from "./libro-excel";

const BUENO = {
  fila: 4, periodo: "2026-01-01", fecha_registro: "2026-01-04", unidad: "OFERFY PAN", tipo: "Comisiones bancarias",
  estatus_gestion: null, unidad_a_pagar: null, descripcion: "COMISION", en_eerr: true, en_flujo: true, monto: 9.5,
  fecha_servicio: "2026-01-01", fecha_pago: "2026-01-01", cuenta: "BANCO GENERAL", factura: null, factura_numero: null,
  ruc_proveedor: null, es_bien_de_uso: false, origen_clave: "0123456789abcdef01234567#1", moneda: "USD",
};

test("acepta un movimiento bien formado y lo deja igual", () => {
  const r = validarMovimiento(BUENO);
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.mov, BUENO);
});

test("rechaza lo que el navegador no debería mandar", () => {
  assert.equal(validarMovimiento(null).ok, false);
  assert.equal(validarMovimiento({ ...BUENO, periodo: "2026-01-15" }).ok, false);
  assert.equal(validarMovimiento({ ...BUENO, monto: 0 }).ok, false);
  // Un negativo es un reverso del libro y se acepta con su signo.
  assert.equal(validarMovimiento({ ...BUENO, monto: -3 }).ok, true);
  assert.equal(validarMovimiento({ ...BUENO, monto: "abc" }).ok, false);
  assert.equal(validarMovimiento({ ...BUENO, unidad: "  " }).ok, false);
  assert.equal(validarMovimiento({ ...BUENO, origen_clave: "x' or 1=1" }).ok, false);
  // Fechas mal formadas quedan vacías en vez de romper; banderas que no son booleanas son «no».
  const r = validarMovimiento({ ...BUENO, fecha_pago: "ayer", en_eerr: "SI" });
  assert.ok(r.ok && r.mov.fecha_pago === null && r.mov.en_eerr === false);
});

test("origen y base de reparto", () => {
  assert.equal(origenDeArchivo("C:\\Users\\majo\\70880c2e-GASTOS_PANAMA_2026.xlsx"), "GASTOS_PANAMA_2026.xlsx");
  assert.equal(origenDeArchivo("<script>.xlsx"), "script.xlsx");
  assert.deepEqual(validarBase({ periodo: "2026-02-01", unidad: "NUVO PAN", envios: 1318, entregados: 567 }), { periodo: "2026-02-01", unidad: "NUVO PAN", envios: 1318, entregados: 567 });
  assert.equal(validarBase({ periodo: "2026-02-01", unidad: "NUVO PAN", envios: -1 }), null);
  assert.equal(validarBase({ periodo: "2026-02-01", unidad: "NUVO PAN", envios: 1.5 }), null);
});

// ---------------------------------------------------------------------------------------------
// Meses cerrados (Cierre de mes, migración 0914): la importación salta sus filas en vez de fallar el lote entero.
// ---------------------------------------------------------------------------------------------
type Fila = Record<string, unknown>;

/** Un Supabase de mentira, en memoria, con lo justo que usan `guardarLoteMovimientos` y `cerrarImportacion`. */
function supabaseFalso(tablas: Record<string, Fila[]>) {
  const escrituras: { tabla: string; op: "upsert" | "delete"; filas: Fila[] }[] = [];
  let siguiente = 1;
  class Consulta {
    private filtros: ((f: Fila) => boolean)[] = [];
    private accion: "select" | "upsert" | "delete" = "select";
    private filas: Fila[] = [];
    private opciones: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    private rango: [number, number] | null = null;
    constructor(private tabla: string) {}
    select() {
      return this;
    }
    eq(c: string, v: unknown) {
      this.filtros.push((f) => f[c] === v);
      return this;
    }
    in(c: string, vs: unknown[]) {
      this.filtros.push((f) => vs.includes(f[c]));
      return this;
    }
    order() {
      return this;
    }
    range(a: number, b: number) {
      this.rango = [a, b];
      return this;
    }
    upsert(filas: Fila[], opciones: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
      this.accion = "upsert";
      this.filas = filas;
      this.opciones = opciones;
      return this;
    }
    delete() {
      this.accion = "delete";
      return this;
    }
    then<A, B = never>(ok: (r: { data: Fila[]; error: null }) => A, mal?: (e: unknown) => B) {
      return Promise.resolve(this.ejecutar()).then(ok, mal);
    }
    private ejecutar(): { data: Fila[]; error: null } {
      const tabla = (tablas[this.tabla] ??= []);
      if (this.accion === "upsert") {
        escrituras.push({ tabla: this.tabla, op: "upsert", filas: this.filas });
        const llaves = (this.opciones.onConflict ?? "id").split(",");
        const hechas: Fila[] = [];
        for (const f of this.filas) {
          const previa = tabla.find((t) => llaves.every((k) => t[k] === f[k]));
          if (previa && this.opciones.ignoreDuplicates) continue;
          if (previa) Object.assign(previa, f);
          else tabla.push({ id: `nuevo-${siguiente++}`, ...f });
          hechas.push(previa ?? tabla[tabla.length - 1]);
        }
        return { data: hechas, error: null };
      }
      const elegidas = tabla.filter((f) => this.filtros.every((p) => p(f)));
      if (this.accion === "delete") {
        escrituras.push({ tabla: this.tabla, op: "delete", filas: elegidas });
        tablas[this.tabla] = tabla.filter((f) => !elegidas.includes(f));
        return { data: elegidas, error: null };
      }
      return { data: this.rango ? elegidas.slice(this.rango[0], this.rango[1] + 1) : elegidas, error: null };
    }
  }
  return { cliente: { from: (t: string) => new Consulta(t) } as unknown as SupabaseClient, tablas, escrituras };
}

const clave = (n: number) => `${"a".repeat(24)}#${n}`;
const mov = (n: number, periodo: string, fecha_pago: string | null = null): MovimientoExcel => ({
  ...BUENO,
  fila: n,
  periodo,
  fecha_pago,
  unidad: "TIENDA A",
  tipo: "Ingresos",
  origen_clave: clave(n),
});

test("importar: las filas de un mes cerrado se saltan y se cuentan, las demás se guardan", async () => {
  const { cliente, tablas, escrituras } = supabaseFalso({
    fin_cierres: [
      { periodo: "2026-07-01", estado: "cerrado" },
      { periodo: "2026-08-01", estado: "en_revision" },
    ],
    fin_unidades: [{ id: "u1", nombre: "TIENDA A" }],
    fin_tipos: [{ id: "t1", nombre: "Ingresos" }],
    fin_cuentas: [{ id: "c1", nombre: "BANCO GENERAL" }],
    fin_reglas: [],
    fin_movimientos: [
      // Guardado en julio (cerrado); el Excel ahora lo trae en agosto: moverlo también cambiaría julio.
      { id: "m-julio", origen: "libro.xlsx", origen_clave: clave(4), periodo: "2026-07-01", fecha_pago: null, editado_a_mano: false },
      // De este archivo, en julio, y ya no viene: no se borra.
      { id: "m-julio-viejo", origen: "libro.xlsx", origen_clave: clave(9), periodo: "2026-07-01", fecha_pago: null, editado_a_mano: false },
      // De este archivo, en agosto, y ya no viene: se borra.
      { id: "m-agosto-viejo", origen: "libro.xlsx", origen_clave: clave(10), periodo: "2026-08-01", fecha_pago: null, editado_a_mano: false },
    ],
    fin_base_distribucion: [],
  });
  const lote = [
    mov(1, "2026-07-01"), // julio: cerrado
    mov(2, "2026-08-01", "2026-08-05"), // agosto: se guarda
    mov(3, "2026-08-01", "2026-07-31"), // agosto pagado en julio: cae en el flujo de julio
    mov(4, "2026-08-01"), // ya guardado en julio
  ];
  const r = await guardarLoteMovimientos(cliente, "libro.xlsx", lote);
  assert.equal(r.guardados, 1);
  assert.equal(r.enMesCerrado, 3);
  const upsert = escrituras.find((e) => e.tabla === "fin_movimientos" && e.op === "upsert")!;
  assert.deepEqual(upsert.filas.map((f) => f.origen_clave), [clave(2)]);
  assert.equal(tablas.fin_movimientos.find((f) => f.id === "m-julio")!.periodo, "2026-07-01");

  const fin = await cerrarImportacion(cliente, "libro.xlsx", new Set(lote.map((m) => m.origen_clave)), [
    { periodo: "2026-07-01", unidad: "TIENDA A", envios: 10, entregados: 5 },
    { periodo: "2026-08-01", unidad: "TIENDA A", envios: 20, entregados: 15 },
  ]);
  assert.deepEqual(fin, { borrados: 1, base: 1, enMesCerrado: 2 });
  assert.ok(tablas.fin_movimientos.some((f) => f.id === "m-julio-viejo"));
  assert.ok(!tablas.fin_movimientos.some((f) => f.id === "m-agosto-viejo"));
  assert.deepEqual(tablas.fin_base_distribucion.map((b) => b.periodo), ["2026-08-01"]);
});

test("importar: sin meses cerrados (o sin la migración 0914) todo sigue como antes", async () => {
  const { cliente } = supabaseFalso({
    fin_unidades: [{ id: "u1", nombre: "TIENDA A" }],
    fin_tipos: [{ id: "t1", nombre: "Ingresos" }],
    fin_cuentas: [{ id: "c1", nombre: "BANCO GENERAL" }],
    fin_reglas: [],
    fin_movimientos: [],
  });
  const r = await guardarLoteMovimientos(cliente, "libro.xlsx", [mov(1, "2026-07-01"), mov(2, "2026-08-01")]);
  assert.equal(r.guardados, 2);
  assert.equal(r.enMesCerrado, 0);
});

// ---------------------------------------------------------------------------------------------
// Libro de otra entidad (migración 0923): tiendas en su entidad y montos en su moneda.
// ---------------------------------------------------------------------------------------------
test("importar el libro de Costa Rica: tiendas en CR, colones en monto_original y «sin tasa» contado", async () => {
  const { cliente, tablas, escrituras } = supabaseFalso({
    fin_unidades: [
      { id: "u-pa-rep", nombre: "A DISTRIBUIR", clase: "reparto", pais: "PA" },
      { id: "u-cr-rep", nombre: "A DISTRIBUIR CR", clase: "reparto", pais: "CR" },
      { id: "u-pa-sin", nombre: "SIN ASIGNAR", clase: "gestion", pais: "PA" },
      { id: "u-pa-corp", nombre: "CORPORATIVO", clase: "gestion", pais: "PA" },
    ],
    fin_tipos: [{ id: "t1", nombre: "Ingresos" }],
    fin_cuentas: [],
    fin_reglas: [],
    fin_movimientos: [],
    fin_tipos_cambio_mes: [{ moneda: "CRC", periodo: "2026-01-01", promedio: 500, cierre: 510 }],
  });
  const cr = { id: "e-cr", codigo: "CR", moneda: "CRC" };
  const lote: MovimientoExcel[] = [
    { ...mov(1, "2026-01-01"), unidad: "TIENDA CR UNO", moneda: "CRC", monto: 1_000_000, cuenta: "BANCO INVENTADO CR" },
    { ...mov(2, "2026-01-01"), unidad: "A DISTRIBUIR", moneda: "CRC", monto: 40_000, cuenta: null },
    { ...mov(3, "2026-02-01"), unidad: "CORPORATIVO", moneda: "CRC", monto: 52_000, cuenta: null },
    { ...mov(4, "2026-01-01"), unidad: "TIENDA CR UNO", moneda: "USD", monto: 50, cuenta: null },
  ];
  const r = await guardarLoteMovimientos(cliente, "GASTOS_COSTA_RICA_2026.xlsx", lote, cr);
  assert.equal(r.guardados, 4);
  assert.equal(r.sinTasa, 1, "febrero no tiene tasa");
  assert.deepEqual([...r.tiendasNuevas].sort(), ["CORPORATIVO CR", "SIN ASIGNAR CR", "TIENDA CR UNO"]);
  const nuevas = escrituras.filter((e) => e.tabla === "fin_unidades" && e.op === "upsert").flatMap((e) => e.filas);
  assert.ok(nuevas.every((u) => u.entidad_id === "e-cr" && u.recibe_reparto === false));
  assert.equal(nuevas.find((u) => u.nombre === "CORPORATIVO CR")!.clase, "gestion");
  const cuenta = escrituras.find((e) => e.tabla === "fin_cuentas")!.filas[0];
  assert.deepEqual([cuenta.nombre, cuenta.entidad_id, cuenta.moneda], ["BANCO INVENTADO CR", "e-cr", "CRC"]);
  const id = (n: string) => tablas.fin_unidades.find((u) => u.nombre === n)!.id;
  const filas = escrituras.find((e) => e.tabla === "fin_movimientos" && e.op === "upsert")!.filas;
  assert.deepEqual(
    filas.map((f) => [f.unidad_id, f.moneda, f.monto_original, f.monto]),
    [
      [id("TIENDA CR UNO"), "CRC", 1_000_000, 0],
      ["u-cr-rep", "CRC", 40_000, 0],
      [id("CORPORATIVO CR"), "CRC", 52_000, 0],
      [id("TIENDA CR UNO"), "USD", null, 50],
    ],
  );
});

test("importar el libro de Panamá no manda las columnas nuevas (funciona sin la migración 0923)", async () => {
  const { cliente, escrituras } = supabaseFalso({
    fin_unidades: [{ id: "u1", nombre: "TIENDA A" }],
    fin_tipos: [{ id: "t1", nombre: "Ingresos" }],
    fin_cuentas: [{ id: "c1", nombre: "BANCO GENERAL" }],
    fin_reglas: [],
    fin_movimientos: [],
  });
  const r = await guardarLoteMovimientos(cliente, "libro.xlsx", [mov(1, "2026-07-01")]);
  assert.equal(r.sinTasa, undefined);
  const fila = escrituras.find((e) => e.tabla === "fin_movimientos")!.filas[0];
  assert.ok(!("moneda" in fila) && !("monto_original" in fila) && fila.monto === 9.5);
});
