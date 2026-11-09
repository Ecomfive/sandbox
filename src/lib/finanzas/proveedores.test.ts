import assert from "node:assert/strict";
import test from "node:test";
import { armarCatalogo, proveedorCrudo, proveedorDe, sugerirUnificaciones } from "./proveedores";

test("el nombre crudo salta las palabras de banco y los números", () => {
  assert.equal(proveedorCrudo("Compra En Comercio FACEBK *X22"), "FACEBK");
  assert.equal(proveedorCrudo("PAGO ACH ALQUILERES ACME 12/03"), "ALQUILERES ACME");
  assert.equal(proveedorCrudo("META ADS 4455"), "META ADS");
  assert.equal(proveedorCrudo("12345 #"), "");
});

test("el proveedor canónico sale del RUC o del alias más largo", () => {
  const cat = armarCatalogo(
    [
      { id: "meta", nombre: "Meta", ruc: null },
      { id: "acme", nombre: "Acme Ficticia", ruc: "1000-200-3000" },
    ],
    [
      { proveedor_id: "meta", alias: "FACEBK" },
      { proveedor_id: "meta", alias: "Meta Ads" },
    ],
  );
  assert.equal(proveedorDe({ descripcion: "Compra en comercio FACEBK *X" }, cat), "meta");
  assert.equal(proveedorDe({ descripcion: "META ADS campaña" }, cat), "meta");
  assert.equal(proveedorDe({ descripcion: "factura 22", ruc: "1000-200-3000 DV 60" }, cat), "acme");
  assert.equal(proveedorDe({ descripcion: "METALES DEL ISTMO" }, cat), null); // palabra completa
});

test("sugiere unificar familias conocidas, nombres contenidos y parecidos", () => {
  const grupos = sugerirUnificaciones([
    { nombre: "META", veces: 10, monto: 1000 },
    { nombre: "META ADS", veces: 4, monto: 400 },
    { nombre: "FACEBK", veces: 7, monto: 700 },
    { nombre: "HOSTING NUBEX", veces: 3, monto: 90 },
    { nombre: "HOSTING NUBEXX", veces: 1, monto: 30 },
    { nombre: "PAPELERIA SOL", veces: 2, monto: 20 },
  ]);
  assert.equal(grupos.length, 2);
  assert.equal(grupos[0].canonico, "META");
  assert.deepEqual(grupos[0].miembros.map((m) => m.nombre).sort(), ["FACEBK", "META", "META ADS"]);
  assert.equal(grupos[1].canonico, "HOSTING NUBEX");
});
