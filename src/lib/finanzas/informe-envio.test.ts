import assert from "node:assert/strict";
import test from "node:test";
import {
  configWhatsapp,
  enlaceWhatsapp,
  esSnapshotInforme,
  escaparHtml,
  htmlInformeCorreo,
  leerCorreos,
  leerTelefonos,
  mesAInformar,
  textoInforme,
  textoSemanal,
  type SnapshotInforme,
} from "./informe-envio";

const cifras = (ingresos: number, ebitda: number) => ({
  ingresos,
  margenBruto: ingresos * 0.5,
  ebitda,
  resultadoNeto: ebitda,
  margenBrutoPct: 50,
  margenEbitdaPct: (100 * ebitda) / ingresos,
  costoVentasPct: 50,
  marketingPct: 20,
  administracionPct: 10,
});

const snap: SnapshotInforme = {
  version: 1,
  mes: "2026-09-01",
  anterior: "2026-08-01",
  actual: cifras(10000, 2000),
  previo: cifras(8000, 1000),
  causas: [{ seccion: "marketing", etiqueta: "Marketing", tipo: "Ads <script>", actual: 3000, anterior: 2000, impacto: -1000 }],
  tiendas: [{ nombre: "TIENDA & CO", ingresos: 10000, ebitda: 2000, ebitdaAnterior: 1000, margenEbitdaPct: 20 }],
  implicancias: { ebitdaAnualMes: 24000, valorEmpresaMes: 96000, valorCreado: 48000 },
  multiplo: 4,
  acciones: [{ clave: "x", texto: "Revisar <b>marketing</b>", prioridad: 1 }],
  explicacion: 'Subió por "campaña" <img src=x onerror=alert(1)>',
  generadoEn: "2026-10-05T12:00:00Z",
};

test("el correo escapa todo lo que viene de datos y solo enlaza https", () => {
  const html = htmlInformeCorreo(snap, "https://portal.ejemplo.com/panel-financiero/informe?periodo=2026-09");
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes("<b>marketing"));
  assert.ok(html.includes("Ads &lt;script&gt;"));
  assert.ok(html.includes("TIENDA &amp; CO"));
  assert.ok(html.includes('href="https://portal.ejemplo.com/panel-financiero/informe?periodo=2026-09"'));
  assert.ok(!htmlInformeCorreo(snap, "javascript:alert(1)").includes("href="));
  assert.ok(!htmlInformeCorreo(snap, 'https://x.com/"onmouseover=1').includes("onmouseover"));
});

test("el texto del informe trae la explicación y las cuatro partes", () => {
  const t = textoInforme(snap);
  assert.match(t, /1\. Desempeño/);
  assert.match(t, /4\. Qué hacer/);
  assert.match(t, /Subió por/);
  assert.equal(escaparHtml(`<a href='x'>&</a>`), "&lt;a href=&#39;x&#39;&gt;&amp;&lt;/a&gt;");
});

test("listas de correos y teléfonos: limpias, sin repetir", () => {
  assert.deepEqual(leerCorreos("a@x.com, A@x.com;\nmal@\nb@y.co"), ["a@x.com", "b@y.co"]);
  assert.deepEqual(leerCorreos(["c@z.com", "<x>@y.com"]), ["c@z.com"]);
  assert.deepEqual(leerTelefonos("+507 6000-0000\n507 6000 0000\n123"), ["50760000000"]);
});

test("mes a informar: el mes anterior (también en enero)", () => {
  assert.equal(mesAInformar("2026-10-05"), "2026-09-01");
  assert.equal(mesAInformar("2027-01-05"), "2026-12-01");
});

test("WhatsApp: configuración solo con https y token; enlace wa.me con el texto codificado", () => {
  assert.equal(configWhatsapp({}), null);
  assert.equal(configWhatsapp({ WHATSAPP_API_URL: "http://x.com", WHATSAPP_API_TOKEN: "t" }), null);
  assert.deepEqual(configWhatsapp({ WHATSAPP_API_URL: "https://wa.ejemplo.com/", WHATSAPP_API_TOKEN: "t" }), { url: "https://wa.ejemplo.com", token: "t", instancia: "ecomfive" });
  assert.equal(enlaceWhatsapp("Hola & chau"), "https://wa.me/?text=Hola%20%26%20chau");
  const s = textoSemanal({ version: 1, semana: "2026-10-12", hasta: "2026-10-18", ventas: { ordenes: 3, total: 120, entregadas: 2 }, caja: null, alertas: { total: 0, criticas: 0, titulos: [] }, generadoEn: "x" });
  assert.match(s, /3 órdenes/);
  assert.match(s, /Sin alertas/);
});

test("una foto rota no se toma por un informe", () => {
  assert.ok(esSnapshotInforme(snap));
  assert.ok(!esSnapshotInforme({ version: 2 }));
  assert.ok(!esSnapshotInforme(null));
});
