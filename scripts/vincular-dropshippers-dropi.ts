// CRM Dropshippers ↔ Dropi (21 oct 2026): une cada usuario de Dropi Panamá que creó órdenes (Desempeño › Ventas Dropi) con su
// ficha del CRM y crea la ficha de los que no la tienen (decisión de Hernán). Lee datos-privados/dropi-usuarios.json (nombre,
// correo y teléfono de cada usuario, bajados de Dropi) y `dropi_ventas_dropshippers` (quién compró y cuándo).
//
//   * Se vincula solo si el correo o el teléfono coinciden con una sola ficha (teléfono: los mismos dígitos, o los últimos 8).
//   * Si no coinciden correo ni teléfono pero el nombre es idéntico al de una sola ficha (sin tildes ni mayúsculas), se vincula.
//     Si solo se parece, NO se crea otra: queda en el informe para revisar a mano (podría ser la misma persona).
//   * La ficha nueva lleva su nombre, correo y teléfono de Dropi, su cuenta de Dropi ya vinculada, la etiqueta «Creado desde
//     Dropi» y estado Activo si pidió en los últimos 90 días (si no, Inactivo).
//
//   npx tsx scripts/vincular-dropshippers-dropi.ts            → informe (no escribe)
//   npx tsx scripts/vincular-dropshippers-dropi.ts --aplicar  → vincula y crea

process.loadEnvFile(".env.local");
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";
import { restarDias } from "../src/lib/publicaciones/ventas";

const aplicar = process.argv.includes("--aplicar");
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const HOY = "2026-10-21";
const ETIQUETA = "Creado desde Dropi";
/** Nombres de cuentas que parecen de ECOMFIVE (no de un dropshipper): se crean igual, marcadas para revisar. */
const INTERNAS = /ecomfive|asesora|ofertas tiendas|genesys|yappea/i;

interface UsuarioDropi {
  id: number;
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const digitos = (t: string | null | undefined) => (t ?? "").replace(/\D+/g, "");
const correo = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();
/** El teléfono en formato internacional: 8 dígitos de Panamá llevan +507. */
function e164(t: string): string | null {
  const d = digitos(t);
  if (d.length === 8) return `+507${d}`;
  if (d.length >= 10 && d.length <= 15) return `+${d}`;
  return null;
}
const capitalizar = (s: string) => s.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (_, a, b) => a + b.toUpperCase());
/** Dos nombres se parecen si comparten al menos dos palabras de 3 letras o más (o son iguales). */
function parecido(a: string, b: string): boolean {
  const pa = new Set(norm(a).split(" ").filter((w) => w.length >= 3));
  const pb = [...new Set(norm(b).split(" ").filter((w) => w.length >= 3))];
  if (norm(a) === norm(b)) return true;
  return pb.filter((w) => pa.has(w)).length >= 2;
}

async function main() {
  const usuarios = new Map((JSON.parse(readFileSync("datos-privados/dropi-usuarios.json", "utf8")) as UsuarioDropi[]).map((u) => [u.id, u]));
  const { data: pais } = await supabase.from("paises").select("id").eq("codigo", "PA").single();
  const { data: dropi } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();
  if (!pais || !dropi) throw new Error("Falta el país PA o la plataforma Dropi.");
  const [{ data: ventas, error: e1 }, { data: fichas, error: e2 }, { data: cuentas, error: e3 }, { data: porMes, error: e4 }] = await Promise.all([
    supabase.from("dropi_ventas_dropshippers").select("dropi_usuario_id, nombre, pedidas, no_efectivas, netas_30d, ultima_orden").eq("pais_id", pais.id),
    supabase.from("dropshippers").select("id, nombre, contacto_email, contacto_telefono, telefono_alterno"),
    supabase.from("dropshipper_cuentas").select("dropshipper_id, id_externo").eq("plataforma_id", dropi.id).eq("pais_id", pais.id),
    supabase.from("dropi_ventas_dropshipper_mes").select("dropi_usuario_id, mes").eq("pais_id", pais.id).limit(20000),
  ]);
  if (e1 || e2 || e3) throw new Error((e1 ?? e2 ?? e3)!.message);
  // Sin la migración 0121 no se sabe el primer mes de cada uno (la fecha de ingreso): el informe sale igual, la carga no.
  if (e4 && aplicar) throw new Error(`Falta correr la migración 0121: ${e4.message}`);
  const yaVinculados = new Set((cuentas ?? []).map((c) => Number(c.id_externo)));
  const primerMes = new Map<number, string>();
  for (const r of porMes ?? []) {
    const u = Number(r.dropi_usuario_id);
    if (!primerMes.has(u) || (r.mes as string) < primerMes.get(u)!) primerMes.set(u, r.mes as string);
  }

  // Índices de las fichas por correo y teléfono.
  const porCorreo = new Map<string, string[]>();
  const porTel = new Map<string, string[]>();
  const agregar = (m: Map<string, string[]>, k: string, id: string) => k && m.set(k, [...new Set([...(m.get(k) ?? []), id])]);
  for (const f of fichas ?? []) {
    agregar(porCorreo, correo(f.contacto_email), f.id);
    for (const t of [f.contacto_telefono, f.telefono_alterno]) {
      const d = digitos(t);
      if (d.length >= 8) {
        agregar(porTel, d, f.id);
        agregar(porTel, `u8:${d.slice(-8)}`, f.id);
      }
    }
  }
  const telefonosUsados = new Set((fichas ?? []).map((f) => f.contacto_telefono).filter(Boolean) as string[]);
  const nombreFicha = new Map((fichas ?? []).map((f) => [f.id, f.nombre as string]));

  const vincular: { usuario: number; fichaId: string; por: string }[] = [];
  const crear: { usuario: number; datos: Record<string, unknown> }[] = [];
  const revisar: string[] = [];
  const sinDatos: string[] = [];
  const desde90 = restarDias(HOY, 89);

  for (const v of ventas ?? []) {
    const id = Number(v.dropi_usuario_id);
    if (yaVinculados.has(id)) continue;
    const u = usuarios.get(id);
    if (!u) {
      sinDatos.push(`${v.nombre} (usuario ${id}): sin correo ni teléfono de Dropi`);
      continue;
    }
    const nombre = capitalizar(`${u.nombre} ${u.apellido}`.replace(/\s+/g, " ").trim()) || v.nombre;
    const d = digitos(u.telefono);
    const candidatos = new Map<string, string>();
    for (const fid of porCorreo.get(correo(u.email)) ?? []) candidatos.set(fid, "correo");
    for (const fid of [...(porTel.get(d) ?? []), ...(d.length >= 8 ? (porTel.get(`u8:${d.slice(-8)}`) ?? []) : [])]) if (!candidatos.has(fid)) candidatos.set(fid, "teléfono");
    if (candidatos.size === 1) {
      const [[fichaId, por]] = [...candidatos.entries()];
      vincular.push({ usuario: id, fichaId, por });
      continue;
    }
    if (candidatos.size > 1) {
      revisar.push(`${nombre} (usuario ${id}): su correo o teléfono coincide con varias fichas: ${[...candidatos.keys()].map((f) => nombreFicha.get(f)).join(", ")}`);
      continue;
    }
    // Mismo nombre (sin tildes ni mayúsculas) que una sola ficha: es la misma persona (decisión de Hernán).
    const identicas = (fichas ?? []).filter((f) => norm(f.nombre as string) === norm(nombre));
    if (identicas.length === 1) {
      vincular.push({ usuario: id, fichaId: identicas[0].id, por: "nombre idéntico" });
      continue;
    }
    const parecida = (fichas ?? []).find((f) => parecido(f.nombre as string, nombre));
    if (parecida) {
      revisar.push(`${nombre} (usuario ${id}, ${v.pedidas} pedidas): el nombre se parece a la ficha «${parecida.nombre}» pero no coinciden ni correo ni teléfono; no se creó otra`);
      continue;
    }
    let tel = e164(u.telefono);
    const notas = [`Creado desde las ventas de Dropi Panamá el ${HOY} (usuario de Dropi ${id}).`];
    if (tel && telefonosUsados.has(tel)) {
      notas.push(`Su teléfono de Dropi (${tel}) ya lo tiene otra ficha.`);
      tel = null;
    }
    if (tel) telefonosUsados.add(tel);
    crear.push({
      usuario: id,
      datos: {
        pais_id: pais.id,
        nombre,
        contacto_email: correo(u.email) || null,
        contacto_telefono: tel,
        estado: v.ultima_orden && (v.ultima_orden as string) >= desde90 ? "activo" : "inactivo",
        fase: "activo",
        fecha_ingreso: primerMes.get(id) ?? null,
        etiquetas: INTERNAS.test(nombre) ? [ETIQUETA, "Revisar: ¿cuenta interna?"] : [ETIQUETA],
        notas: notas.join(" "),
      },
    });
  }

  const informe = [
    `Usuarios de Dropi con órdenes: ${ventas?.length ?? 0} · ya vinculados: ${yaVinculados.size}`,
    `Se vinculan a una ficha existente: ${vincular.length}`,
    ...vincular.map((x) => `   ${usuarios.get(x.usuario)?.nombre} ${usuarios.get(x.usuario)?.apellido} → «${nombreFicha.get(x.fichaId)}» (por ${x.por})`),
    `Fichas nuevas: ${crear.length} (${crear.filter((c) => c.datos.estado === "activo").length} activas, ${crear.filter((c) => (c.datos.etiquetas as string[]).length > 1).length} marcadas como posible cuenta interna)`,
    `Para revisar a mano (no se crea ni vincula): ${revisar.length}`,
    ...revisar.map((r) => `   ${r}`),
    `Sin datos de Dropi: ${sinDatos.length}`,
    ...sinDatos.map((r) => `   ${r}`),
  ];
  writeFileSync("datos-privados/vincular-dropshippers-dropi.txt", informe.join("\n"), "utf8");
  console.log(informe.slice(0, 2).join("\n"));
  console.log(informe.find((l) => l.startsWith("Fichas nuevas")));
  console.log(informe.find((l) => l.startsWith("Para revisar")));
  console.log(informe.find((l) => l.startsWith("Sin datos")));
  if (!aplicar) return console.log("Informe en datos-privados/vincular-dropshippers-dropi.txt. Con --aplicar se vincula y se crean las fichas.");

  const cuentasNuevas: Record<string, unknown>[] = [];
  const paisesNuevos: Record<string, unknown>[] = [];
  for (const x of vincular) {
    cuentasNuevas.push({ dropshipper_id: x.fichaId, plataforma_id: dropi.id, pais_id: pais.id, id_externo: String(x.usuario) });
    paisesNuevos.push({ dropshipper_id: x.fichaId, pais_id: pais.id });
  }
  let creadas = 0;
  for (const c of crear) {
    const { data, error } = await supabase.from("dropshippers").insert(c.datos).select("id").single();
    if (error || !data) {
      console.error(`${c.datos.nombre}: ${error?.message}`);
      continue;
    }
    creadas++;
    cuentasNuevas.push({ dropshipper_id: data.id, plataforma_id: dropi.id, pais_id: pais.id, id_externo: String(c.usuario) });
    paisesNuevos.push({ dropshipper_id: data.id, pais_id: pais.id });
  }
  const { error: ec } = await supabase.from("dropshipper_cuentas").upsert(cuentasNuevas, { onConflict: "plataforma_id,pais_id,id_externo", ignoreDuplicates: true });
  if (ec) throw new Error(`cuentas: ${ec.message}`);
  const { error: ep } = await supabase.from("dropshipper_paises").upsert(paisesNuevos, { onConflict: "dropshipper_id,pais_id", ignoreDuplicates: true });
  if (ep) throw new Error(`países: ${ep.message}`);
  console.log(`Listo: ${vincular.length} vinculadas, ${creadas} fichas nuevas con su cuenta de Dropi.`);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
