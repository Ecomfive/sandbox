// Comprueba desde fuera la seguridad de la base de datos de Supabase. SOLO LEE: no inserta, no modifica y no borra nada.
//
//   node scripts/verificar-seguridad-supabase.mjs
//
// Para probar también como una persona con sesión (lo importante tras la migración 0063), pasa una cuenta de prueba SIN
// permisos de administrador por variables de entorno, solo para esta ejecución (no se guardan en ningún archivo):
//
//   PRUEBA_EMAIL=correo@ejemplo.com PRUEBA_PASSWORD=... node scripts/verificar-seguridad-supabase.mjs
//
// Sale con código 1 si encuentra algo abierto.

import { readFileSync, readdirSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.split("=")[0], l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let problemas = 0;
const falla = (texto) => {
  problemas += 1;
  console.log(`  ✗ ${texto}`);
};
const bien = (texto) => console.log(`  ✓ ${texto}`);

// Las tablas salen de las migraciones.
const tablas = new Set();
for (const f of readdirSync("supabase/migrations")) {
  const t = readFileSync(`supabase/migrations/${f}`, "utf8");
  for (const m of t.matchAll(/create table(?: if not exists)?\s+(?:public\.)?"?([a-z_0-9]+)"?/gi)) tablas.add(m[1]);
}

console.log("1) Registro de cuentas");
const ajustes = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon } }).then((r) => r.json());
if (ajustes.disable_signup) bien("el registro público está desactivado");
else falla("el registro público está ABIERTO: cualquiera puede crear una cuenta (Authentication → Sign In / Providers → Email)");

async function filasLegibles(token, etiqueta) {
  const abiertas = [];
  for (const t of [...tablas].sort()) {
    const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=1`, { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    const cuerpo = await r.json().catch(() => null);
    if (r.ok && Array.isArray(cuerpo) && cuerpo.length > 0) abiertas.push(t);
  }
  if (abiertas.length) falla(`${etiqueta} puede leer filas de ${abiertas.length} tabla(s): ${abiertas.join(", ")}`);
  else bien(`${etiqueta} no puede leer filas de ninguna de las ${tablas.size} tablas`);
}

console.log("2) Sin iniciar sesión (solo la clave pública)");
await filasLegibles(anon, "una persona sin sesión");

console.log("3) Con una cuenta de prueba");
if (process.env.PRUEBA_EMAIL && process.env.PRUEBA_PASSWORD) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.PRUEBA_EMAIL, password: process.env.PRUEBA_PASSWORD }),
  });
  const sesion = await r.json();
  if (!sesion.access_token) falla("no se pudo iniciar sesión con la cuenta de prueba (revisa el correo y la contraseña)");
  else await filasLegibles(sesion.access_token, "una persona con sesión (llamando directo a la API)");
} else {
  console.log("  - omitido: define PRUEBA_EMAIL y PRUEBA_PASSWORD para probarlo (es la comprobación más importante tras la migración)");
}

console.log(problemas === 0 ? "\nTodo en orden." : `\n${problemas} problema(s) encontrado(s).`);
process.exit(problemas === 0 ? 0 : 1);
