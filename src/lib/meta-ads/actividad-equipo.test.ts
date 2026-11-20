import assert from "node:assert/strict";
import test from "node:test";
import { categoriaDeEvento, diaDePanama, llavePersona, resumirCreaciones, resumirEquipo, textoDias, type CreacionDeCampana, type EventoDeActividad } from "./actividad-equipo";

const HOY = "2026-11-20";
const campana = (persona: string | null, creadaEn: string, cuenta = "Oferfy 1", etapa: string | null = "testing"): CreacionDeCampana => ({ persona, creadaEn, etapa, estructura: "CBO", puja: null, producto: "Faja", cuenta });
const evento = (actor: string, tipo: string, fecha: string, cuenta = "Oferfy 1"): EventoDeActividad => ({ fecha, actor, tipo, objetoTipo: null, objeto: null, detalle: null, cuenta, campanaId: null });

test("el día es el de Panamá (UTC−5), no el de UTC", () => {
  assert.equal(diaDePanama("2026-11-20T03:00:00Z"), "2026-11-19");
  assert.equal(diaDePanama("2026-11-20T05:00:00Z"), "2026-11-20");
  assert.equal(diaDePanama(null), null);
  assert.equal(diaDePanama("no es fecha"), null);
});

test("3 campañas en una cuenta y 3 el mismo día en otra son 6 ese día", () => {
  const hechas = [
    ...[10, 11, 12].map((h) => campana("Ariadne", `2026-11-18T${h}:00:00Z`, "Cuenta A")),
    ...[13, 14, 15].map((h) => campana("Ariadne", `2026-11-18T${h}:00:00Z`, "Cuenta B")),
  ];
  const r = resumirCreaciones(hechas, HOY);
  assert.equal(r.total, 6);
  assert.equal(r.diasActivos, 1);
  assert.equal(r.campanasPorDiaActivo, 6);
  assert.deepEqual(r.mejorDia, { fecha: "2026-11-18", n: 6 });
  assert.equal(r.porRango["7"], 6);
  assert.equal(r.cuentas.length, 2);
  assert.equal(r.cuentas[0].pct, 50);
});

test("cada cuánto sube: promedio y mediana entre días con campañas, y el hueco más largo", () => {
  const dias = ["2026-11-01", "2026-11-03", "2026-11-04", "2026-11-14"];
  const r = resumirCreaciones(dias.map((d) => campana("A", `${d}T15:00:00Z`)), HOY);
  // Huecos: 2, 1 y 10 días.
  assert.equal(r.intervaloPromedioDias, 4.3);
  assert.equal(r.intervaloMedianoDias, 2);
  assert.equal(r.huecoMaximoDias, 10);
  assert.equal(r.diasDesdeUltima, 6);
  assert.equal(r.ultima, "2026-11-14");
});

test("con un solo día con campañas no hay intervalo", () => {
  const r = resumirCreaciones([campana("A", "2026-11-19T15:00:00Z")], HOY);
  assert.equal(r.intervaloPromedioDias, null);
  assert.equal(r.huecoMaximoDias, null);
  assert.equal(r.diasDesdeUltima, 1);
});

test("los rangos cuentan hacia atrás desde hoy, contando hoy", () => {
  const hechas = ["2026-11-20", "2026-11-14", "2026-11-13", "2026-10-22", "2026-06-01", "2025-12-01", "2025-01-01"].map((d) => campana("A", `${d}T15:00:00Z`));
  const r = resumirCreaciones(hechas, HOY);
  assert.equal(r.porRango.hoy, 1);
  assert.equal(r.porRango["7"], 2);
  assert.equal(r.porRango["30"], 4);
  assert.equal(r.porRango["90"], 4);
  assert.equal(r.porRango["180"], 5);
  assert.equal(r.porRango["365"], 6);
  assert.equal(r.total, 7);
});

test("lo que más sube sale de los últimos 90 días y dice su porcentaje", () => {
  const hechas = [campana("A", "2026-11-19T15:00:00Z", "C", "testing"), campana("A", "2026-11-18T15:00:00Z", "C", "testing"), campana("A", "2026-11-17T15:00:00Z", "C", "escala"), campana("A", "2026-11-16T15:00:00Z", "C", null)];
  const r = resumirCreaciones(hechas, HOY);
  assert.deepEqual(r.tipos.etapa.map((x) => [x.nombre, x.n, x.pct]), [["testing", 2, 67], ["escala", 1, 33]]);
  assert.equal(r.tipos.estructura[0].nombre, "CBO");
});

test("por día de la semana (lunes primero) y por mes", () => {
  // 2026-11-16 es lunes; 2026-11-18 es miércoles.
  const r = resumirCreaciones([campana("A", "2026-11-16T15:00:00Z"), campana("A", "2026-11-16T16:00:00Z"), campana("A", "2026-11-18T15:00:00Z")], HOY);
  assert.deepEqual(r.porDiaSemana, [2, 0, 1, 0, 0, 0, 0]);
  assert.equal(r.meses.length, 6);
  assert.equal(r.meses[5].mes, "2026-11");
  assert.equal(r.meses[5].n, 3);
  assert.equal(r.meses[0].mes, "2026-06");
});

test("una campaña de mañana o sin fecha no cuenta", () => {
  const r = resumirCreaciones([campana("A", "2026-11-25T15:00:00Z"), campana("A", "")], HOY);
  assert.equal(r.total, 0);
  assert.equal(r.ultima, null);
  assert.equal(r.diasDesdeUltima, null);
});

test("el promedio por semana usa el tiempo que lleva la persona si es menos de 90 días", () => {
  // Primera campaña hace 6 días (7 días contando hoy), 7 campañas: una por semana de historia = 7.
  const hechas = Array.from({ length: 7 }, (_, i) => campana("A", `2026-11-${String(14 + i).padStart(2, "0")}T15:00:00Z`));
  const r = resumirCreaciones(hechas, HOY);
  assert.equal(r.porSemana, 7);
});

test("una persona se junta aunque su nombre llegue de dos formas y de dos cuentas", () => {
  const creaciones = [campana("ARIANNY", "2026-11-19T15:00:00Z", "Cuenta A"), campana("Arianny", "2026-11-19T16:00:00Z", "Cuenta B"), campana("ARIANNY", "2026-11-18T16:00:00Z", "Cuenta A"), campana("Hernán", "2026-11-18T16:00:00Z", "Cuenta A")];
  const r = resumirEquipo(creaciones, [], HOY);
  assert.equal(r.personas.length, 2);
  const a = r.personas.find((p) => llavePersona(p.persona) === llavePersona("arianny"));
  assert.ok(a);
  assert.equal(a.persona, "ARIANNY");
  assert.equal(a.total, 3);
  assert.equal(r.equipo.total, 4);
  assert.equal(r.equipo.personas, 2);
  assert.equal(r.porCuenta.length, 2);
  assert.equal(r.porCuenta[0].cuenta, "Cuenta A");
  assert.equal(r.porCuenta[0].total, 3);
});

test("el equipo cuenta también las campañas sin persona conocida", () => {
  const r = resumirEquipo([campana(null, "2026-11-19T15:00:00Z"), campana("A", "2026-11-19T15:00:00Z")], [], HOY);
  assert.equal(r.equipo.total, 2);
  assert.equal(r.personas.length, 1);
  assert.equal(r.personas[0].total, 1);
});

test("los cambios en Meta se cuentan por grupo y los de 30 días aparte", () => {
  const eventos = [
    evento("A", "create_ad", "2026-11-19T15:00:00Z"),
    evento("A", "create_ad", "2026-11-19T16:00:00Z", "Cuenta B"),
    evento("A", "update_campaign_budget", "2026-11-10T15:00:00Z"),
    evento("A", "update_ad_run_status", "2026-09-10T15:00:00Z"),
    evento("A", "create_campaign_group", "2026-11-19T15:00:00Z"),
  ];
  const r = resumirEquipo([], eventos, HOY);
  const a = r.personas[0];
  assert.equal(a.cambios.anuncios, 2);
  assert.equal(a.cambios.presupuesto, 1);
  assert.equal(a.cambios.estado, 1);
  assert.equal(a.cambios.campañas, 1);
  assert.equal(a.cambiosTotal, 5);
  // La campaña creada no es «otro cambio»: 30 días = 2 anuncios + 1 presupuesto.
  assert.equal(a.cambios30, 3);
  assert.equal(a.ultimaActividad, "2026-11-19T16:00:00Z");
});

test("lo reciente va del más nuevo al más viejo y se recorta", () => {
  const eventos = Array.from({ length: 10 }, (_, i) => evento("A", "create_ad", `2026-11-${String(10 + i).padStart(2, "0")}T15:00:00Z`));
  const r = resumirEquipo([], eventos, HOY, { maxReciente: 3 });
  assert.deepEqual(r.reciente.map((e) => e.fecha.slice(8, 10)), ["19", "18", "17"]);
});

test("cada evento cuenta en su grupo", () => {
  assert.equal(categoriaDeEvento("create_campaign"), "campañas");
  assert.equal(categoriaDeEvento("create_ad_set"), "conjuntos");
  assert.equal(categoriaDeEvento("update_ad_set_budget"), "presupuesto");
  assert.equal(categoriaDeEvento("update_campaign_run_status"), "estado");
  assert.equal(categoriaDeEvento("update_ad_creative"), "otros");
});

test("cuánto lleva sin subir se dice en palabras", () => {
  assert.equal(textoDias(null), "nunca");
  assert.equal(textoDias(0), "hoy");
  assert.equal(textoDias(1), "ayer");
  assert.equal(textoDias(5), "hace 5 días");
});
