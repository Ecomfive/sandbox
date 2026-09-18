// Lee el archivo de retiros ya extraido (ver dropi-extraer-retiros.ts),
// guarda cada retiro en Supabase y actualiza el saldo actual de wallet con
// el numero que el mismo Dropi reporta (user.wallets[0].amount).
//
// Uso: npx tsx scripts/dropi-ingerir-retiros.ts <cr|pa> <archivo.json>

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const pais = process.argv[2];
const archivo = process.argv[3];

if (!["cr", "pa"].includes(pais ?? "") || !archivo) {
  console.error("Uso: npx tsx scripts/dropi-ingerir-retiros.ts <cr|pa> <archivo.json>");
  process.exit(1);
}

// Panama y Costa Rica no usan horario de verano, asi que el offset es fijo.
const OFFSET_HORAS: Record<string, number> = { cr: -6, pa: -5 };

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

interface FilaRetiro {
  id: number;
  amount: string;
  status: string;
  created_at: string;
  concept: string | null;
  user_bank?: { bank?: { name?: string | null } | null } | null;
  user?: { wallets?: { amount: string }[] | null } | null;
}

function fechaLocal(isoUtc: string): string {
  const fecha = new Date(isoUtc);
  fecha.setHours(fecha.getHours() + OFFSET_HORAS[pais]);
  return fecha.toISOString().slice(0, 10);
}

function mapearEstado(status: string): "solicitado" | "procesado" | "rechazado" {
  if (status === "APROBADO") return "procesado";
  if (status === "RECHAZADO") return "rechazado";
  return "solicitado";
}

async function main() {
  const filas: FilaRetiro[] = JSON.parse(readFileSync(archivo, "utf8"));
  console.log(`Leidos ${filas.length} retiros de ${archivo}`);

  const { data: paisRow } = await supabase.from("paises").select("id").eq("codigo", pais.toUpperCase()).single();
  const { data: plataformaRow } = await supabase.from("plataformas").select("id").eq("nombre", "Dropi").single();
  if (!paisRow || !plataformaRow) throw new Error("Falta pais o plataforma Dropi. Corre las migraciones.");

  const paisId = paisRow.id;
  const plataformaId = plataformaRow.id;

  if (filas.length === 0) {
    console.log("Sin retiros para guardar.");
    return;
  }

  const registros = filas.map((f) => ({
    pais_id: paisId,
    plataforma_id: plataformaId,
    dropi_id: f.id,
    monto: Number(f.amount),
    fecha: fechaLocal(f.created_at),
    estado: mapearEstado(f.status),
    notas: f.concept,
    banco: f.user_bank?.bank?.name ?? null,
  }));

  const { error } = await supabase
    .from("retiros")
    .upsert(registros, { onConflict: "pais_id,plataforma_id,dropi_id" });
  if (error) throw new Error(`Error guardando retiros: ${error.message}`);
  console.log(`Guardados/actualizados ${registros.length} retiros.`);

  const saldoActual = filas[0].user?.wallets?.[0]?.amount;
  if (saldoActual === undefined) {
    console.log("La respuesta no trajo el saldo de wallet; no se actualiza saldos_wallet.");
    return;
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const { error: errorSaldo } = await supabase
    .from("saldos_wallet")
    .upsert(
      { pais_id: paisId, plataforma_id: plataformaId, monto: Number(saldoActual), fecha: hoy },
      { onConflict: "pais_id,plataforma_id,fecha" }
    );
  if (errorSaldo) throw new Error(`Error guardando saldo de wallet: ${errorSaldo.message}`);
  console.log(`Saldo de wallet actualizado: ${saldoActual} (al ${hoy}).`);
}

main();
