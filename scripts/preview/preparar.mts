// Crea la base de la vista previa en una carpeta: migraciones + la persona de la vista previa (rol con todos los
// módulos) + la semilla privada de socios si existe en datos-privados/. Los Excel se cargan después, con los
// importadores reales y el servidor arriba (ver levantar.sh).
//
// Uso: npx tsx scripts/preview/preparar.mts <carpeta-de-la-base>
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { crearBase } from "./base.mjs";
import { USUARIO_PREVIEW } from "./postgrest.mjs";
import { MODULOS } from "../../src/lib/modulos";

const dir = process.argv[2];
if (!dir) {
  console.error("Uso: preparar.mts <carpeta-de-la-base>");
  process.exit(1);
}
rmSync(dir, { recursive: true, force: true });
const raiz = process.cwd();
const { db, fallas } = await crearBase(dir, join(raiz, "supabase/migrations"));
console.log(`migraciones aplicadas (${fallas.length} con error)`);

const u = USUARIO_PREVIEW;
await db.query(`insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing`, [u.id, u.email]);
const rol = (
  await db.query(`insert into roles (nombre) values ('Vista previa') on conflict (nombre) do update set nombre = excluded.nombre returning id`)
).rows[0].id as string;
for (const m of MODULOS) await db.query(`insert into permisos_rol (rol_id, modulo) values ($1, $2) on conflict do nothing`, [rol, m.clave]);
await db.query(
  `insert into perfiles (id, email, nombre, rol_id, activo) values ($1, $2, $3, $4, true)
   on conflict (id) do update set rol_id = excluded.rol_id, activo = true, nombre = excluded.nombre`,
  [u.id, u.email, u.nombre, rol],
);
await db.query(`update perfiles set primer_ingreso_en = now() where id = $1`, [u.id]).catch(() => {});
// Sin la cookie del país la barra de arriba arranca en Costa Rica; los Excel son de Panamá.
await db.query(`update perfiles set pais_preferido = 'PA' where id = $1`, [u.id]).catch(() => {});
console.log(`persona de la vista previa con ${MODULOS.length} módulos`);

const semilla = join(raiz, "datos-privados/semilla-socios.sql");
const semillaAlt = process.env.DATOS_PRIVADOS ? join(process.env.DATOS_PRIVADOS, "semilla-socios.sql") : "";
const archivo = existsSync(semilla) ? semilla : semillaAlt && existsSync(semillaAlt) ? semillaAlt : "";
if (archivo) {
  await db.exec(readFileSync(archivo, "utf8"));
  console.log("semilla de socios cargada");
} else console.log("sin semilla de socios (datos-privados/semilla-socios.sql)");
await db.close();
