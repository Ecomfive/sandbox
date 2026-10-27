import assert from "node:assert/strict";
import test from "node:test";
import { deClickup, ESTADOS, ESTADOS_REPOSICION, ESTADOS_VENTA, fulfillmentFijo, idsDropi, leerTareaGcc, margenBajo, numeroPublicacion, revisionVencida, UBICACIONES, type TareaClickup } from "./publicacion";

test("deClickup: reconoce lo de ClickUp sin importar emojis, acentos ni espacios", () => {
  assert.equal(deClickup(ESTADOS_VENTA, "Más Vendidos✅ +500"), "mas_vendidos");
  assert.equal(deClickup(ESTADOS_VENTA, "Sin Stock😓"), "sin_stock");
  assert.equal(deClickup(ESTADOS_REPOSICION, "No pedir más "), "no_pedir_mas");
  assert.equal(deClickup(UBICACIONES, "Boxful/DROP"), "boxful");
  assert.equal(deClickup(ESTADOS, "revisar precio & venta"), "revisar_precio");
  assert.equal(deClickup(ESTADOS, "al dia"), "al_dia");
  assert.equal(deClickup(ESTADOS, "otra cosa"), null);
});

test("idsDropi: uno o varios IDs", () => {
  assert.deepEqual(idsDropi("11144"), [11144]);
  assert.deepEqual(idsDropi("7231-7679"), [7231, 7679]);
  assert.deepEqual(idsDropi("8165/7409"), [8165, 7409]);
  assert.deepEqual(idsDropi(null), []);
});

test("revisionVencida: pasada la próxima revisión o sin revisar, salvo archivadas", () => {
  assert.equal(revisionVencida({ estado: "al_dia", proximaRevision: "2026-10-20" }, "2026-10-21"), true);
  assert.equal(revisionVencida({ estado: "al_dia", proximaRevision: "2026-11-01" }, "2026-10-21"), false);
  assert.equal(revisionVencida({ estado: "al_dia", proximaRevision: null }, "2026-10-21"), true);
  assert.equal(revisionVencida({ estado: "archivado", proximaRevision: null }, "2026-10-21"), false);
});

const dd = (name: string, value: number, opciones: string[]) => ({ id: name, name, type: "drop_down", value, type_config: { options: opciones.map((o, i) => ({ id: `o${i}`, name: o, orderindex: i })) } });

test("leerTareaGcc: campos, opciones, fechas, relacionados, foto y avisos", () => {
  const t: TareaClickup = {
    id: "86a1",
    name: "  OceAura Body Oil 100ml ",
    status: { status: "al dia" },
    markdown_description: "**Competencia:** nadie",
    assignees: [{ id: 1, username: "Nicol", email: "Nicol@Ecomfive.io" }],
    date_created: "1700000000000",
    custom_fields: [
      { id: "id", name: "ID", type: "short_text", value: "11144" },
      dd("Estado de Venta", 0, ["Más Vendidos✅ +500", "Estable💵 +100"]),
      dd("Donde está", 1, ["Bodega Dropi", "Bodega Ecomfive"]),
      dd("Tipo de Publicación", 1, ["Publico", "Privado"]),
      dd("Privatizado", 0, ["Jorge Reyes"]),
      { id: "em", name: "Email", type: "email", value: "Reyes@Gmail.com" },
      dd("Estado de Reposición", 0, ["Algo raro"]),
      dd("Competencia", 1, ["NO", "SI"]),
      { id: "pv", name: "Precio de Venta", type: "currency", value: "9.99" },
      { id: "cm", name: "Costo Mercancía", type: "currency", value: "1.16" },
      { id: "fu", name: "Fulfillment", type: "currency", value: "1.5" },
      { id: "ur", name: "Última Revisión", type: "date", value: String(Date.UTC(2026, 9, 20, 15)) },
      { id: "re", name: "Relacionado", type: "tasks", value: [{ id: "86a2" }, { id: "86a1" }] },
      { id: "im", name: "Image", type: "attachment", value: [{ url: "https://x/a.jpg", title: "a.jpg" }] },
    ],
  };
  const p = leerTareaGcc(t);
  assert.equal(p.nombre, "OceAura Body Oil 100ml");
  assert.equal(p.dropi_id, "11144");
  assert.equal(p.estado, "al_dia");
  assert.equal(p.estado_venta, "mas_vendidos");
  assert.equal(p.ubicacion, "bodega_ecomfive");
  assert.equal(p.tipo_publicacion, "privado");
  assert.equal(p.privatizado_a, "Jorge Reyes");
  assert.equal(p.privatizado_email, "reyes@gmail.com");
  assert.equal(p.competencia, true);
  assert.deepEqual([p.precio_venta, p.costo_mercancia, p.fulfillment, p.coste_real], [9.99, 1.16, 1.5, null]);
  assert.equal(p.ultima_revision, "2026-10-20");
  assert.deepEqual(p.relacionadosClickup, ["86a2"]);
  assert.deepEqual(p.foto, { url: "https://x/a.jpg", nombre: "a.jpg" });
  assert.deepEqual(p.responsables, ["nicol@ecomfive.io"]);
  assert.equal(p.estado_reposicion, null);
  assert.deepEqual(p.avisos, ["Estado de Reposición: «Algo raro»"]);
});

test("margenBajo: bajo el 30 %; sin margen calculado no cuenta", () => {
  assert.equal(margenBajo(0.29), true);
  assert.equal(margenBajo(0.3), false);
  assert.equal(margenBajo(0.55), false);
  assert.equal(margenBajo(null), false);
});

test("numeroPublicacion: PUB- con cuatro cifras; sin número, un guion", () => {
  assert.equal(numeroPublicacion(7), "PUB-0007");
  assert.equal(numeroPublicacion(1234), "PUB-1234");
  assert.equal(numeroPublicacion(12345), "PUB-12345");
  assert.equal(numeroPublicacion(null), "—");
});

test("fulfillmentFijo: $1.50 solo en Panamá; en otro país se escribe en la ficha", () => {
  assert.equal(fulfillmentFijo("PA"), 1.5);
  assert.equal(fulfillmentFijo("pa"), 1.5);
  assert.equal(fulfillmentFijo("CR"), null);
  assert.equal(fulfillmentFijo("MX"), null);
  assert.equal(fulfillmentFijo(""), null);
  assert.equal(fulfillmentFijo(null), null);
});
