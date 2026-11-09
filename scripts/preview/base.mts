// Arma la base local de la vista previa: PGlite con todas las migraciones del repo sobre unos stubs de lo que en
// Supabase ya existe (auth, storage). No lleva datos: los datos reales se cargan con cargar-datos.mts desde
// datos-privados/ en tiempo de ejecución.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { cargarPGlite } from "./pglite.mjs";

export const STUBS = `
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create schema if not exists auth; create schema if not exists storage; create schema if not exists extensions;
create table if not exists auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}',
  raw_app_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz, invited_at timestamptz,
  email_confirmed_at timestamptz, banned_until timestamptz);
create or replace function auth.uid() returns uuid language sql stable as $f$ select null::uuid $f$;
create or replace function auth.role() returns text language sql stable as $f$ select 'service_role'::text $f$;
create or replace function auth.jwt() returns jsonb language sql stable as $f$ select '{}'::jsonb $f$;
create table if not exists storage.buckets(id text primary key, name text, public boolean default false, file_size_limit bigint,
  allowed_mime_types text[], owner uuid, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid,
  metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
create or replace function storage.foldername(name text) returns text[] language sql immutable as $f$ select string_to_array(name,'/') $f$;
alter table storage.objects enable row level security;
`;

export async function crearBase(dirDatos: string | undefined, dirMigraciones: string, log = console.log) {
  const PGlite = await cargarPGlite();
  const db = new PGlite(dirDatos);
  await db.exec(STUBS);
  const fallas: string[] = [];
  for (const f of readdirSync(dirMigraciones).filter((x) => /^\d{4}_.*\.sql$/.test(x)).sort()) {
    try {
      await db.exec(readFileSync(join(dirMigraciones, f), "utf8").replace(/^\uFEFF/, ""));
    } catch (e: any) {
      fallas.push(`${f}: ${String(e.message).slice(0, 300)}`);
      log(`  migración con error: ${f}: ${String(e.message).slice(0, 200)}`);
    }
  }
  return { db, fallas };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { db, fallas } = await crearBase(process.argv[2], join(process.cwd(), "supabase/migrations"));
  console.log(`migraciones con error: ${fallas.length}`);
  await db.close();
}
