import { test } from "node:test";
import assert from "node:assert/strict";
import { elegirFichaConservada, lineasDeUnion, mensajeErrorUnirDropshippers } from "./unir-dropshippers";

test("se queda la ficha más antigua, sin depender del orden", () => {
  const a = { id: "b", codigo: "DS-0140", desde: "2026-03-01" };
  const b = { id: "a", codigo: "DS-0012", desde: "2026-05-10" };
  assert.equal(elegirFichaConservada(a, b).conservar, a);
  assert.equal(elegirFichaConservada(b, a).conservar, a);
  assert.equal(elegirFichaConservada(b, a).eliminar, b);
});

test("con la misma fecha (o sin ella) se queda el código menor, comparado como número", () => {
  const a = { id: "x", codigo: "DS-0012", desde: "2026-01-01" };
  const b = { id: "y", codigo: "DS-0140", desde: "2026-01-01" };
  assert.equal(elegirFichaConservada(b, a).conservar, a);
  const c = { id: "x", codigo: "DS-0009", desde: null as string | null };
  const d = { id: "y", codigo: "DS-0100", desde: null as string | null };
  assert.equal(elegirFichaConservada(d, c).conservar, c);
  // Una con fecha le gana a una sin fecha.
  assert.equal(elegirFichaConservada(d, { id: "z", codigo: "DS-0500", desde: "2026-02-02" }).conservar.id, "z");
});

test("lo movido se dice en palabras, de más a menos", () => {
  assert.deepEqual(
    lineasDeUnion({ "dropshipper_cuentas.dropshipper_id": 2, "whatsapp_conversaciones.dropshipper_id": 1, "dropshipper_paises.dropshipper_id": 1, contacto_telefono: true, contacto_email: true }),
    ["2 cuentas de plataforma", "1 chat de WhatsApp", "1 país donde vende", "su WhatsApp pasa a los otros números de la ficha que queda", "su correo pasa a los otros correos de la ficha que queda"],
  );
  assert.deepEqual(lineasDeUnion({}), []);
  assert.deepEqual(lineasDeUnion(null), []);
  assert.deepEqual(lineasDeUnion({ "una_tabla_nueva.dropshipper_id": 3 }), ["3 una tabla nueva"]);
});

test("el motivo de la base se muestra solo si es de los que escribió para el equipo", () => {
  assert.equal(mensajeErrorUnirDropshippers("No se unen DS-0001 y DS-0002: en x hay una fila"), "No se unen DS-0001 y DS-0002: en x hay una fila");
  assert.equal(mensajeErrorUnirDropshippers('relation "x" does not exist'), "No se pudieron unir las fichas.");
});
