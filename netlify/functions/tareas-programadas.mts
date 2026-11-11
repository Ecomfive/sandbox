// Tareas programadas en Netlify: el equivalente de los "crons" de vercel.json (que Netlify no lee).
// Corre cada 10 minutos, mira qué tareas tocan en este momento (hora UTC, igual que vercel.json) y llama a su
// ruta /api/cron/<tarea> con la cabecera `Authorization: Bearer CRON_SECRET`. Mantener la tabla igual a vercel.json.
// Sin dependencias: Netlify lee `config.schedule`.

interface Programada {
  ruta: string;
  /** Cron de 5 campos en UTC: minuto hora día-del-mes mes día-de-la-semana. */
  cron: string;
}

const TAREAS: Programada[] = [
  { ruta: "/api/cron/alertas-inventario", cron: "0 12 1,15 * *" },
  { ruta: "/api/cron/notificaciones-diarias", cron: "0 13 * * *" },
  { ruta: "/api/cron/efectivo-repartidores", cron: "0 10 * * *" },
  { ruta: "/api/cron/conciliacion", cron: "10 10 * * *" },
  { ruta: "/api/cron/conciliacion", cron: "40 10 * * *" },
  { ruta: "/api/cron/cierre-mes", cron: "20 10 * * *" },
  { ruta: "/api/cron/proyeccion-caja", cron: "0 11 * * 1" },
  { ruta: "/api/cron/alertas", cron: "30 11 * * *" },
  { ruta: "/api/cron/dropi-finanzas", cron: "30 9 * * *" },
  { ruta: "/api/cron/shopify-ventas", cron: "40 9 * * *" },
  { ruta: "/api/cron/quickbooks", cron: "50 9 * * *" },
  { ruta: "/api/cron/monday", cron: "30 10 * * *" },
  { ruta: "/api/cron/monday", cron: "40 10 * * *" },
  { ruta: "/api/cron/monday", cron: "50 10 * * *" },
  { ruta: "/api/cron/informe-mensual", cron: "0 12 5 * *" },
  { ruta: "/api/cron/resumen-semanal", cron: "30 12 * * 1" },
  { ruta: "/api/cron/respaldo-finanzas", cron: "0 8 * * 0" },
  { ruta: "/api/cron/respaldo-finanzas", cron: "10 8 * * 0" },
  { ruta: "/api/cron/respaldo-finanzas", cron: "20 8 * * 0" },
];

function campoCalza(campo: string, valor: number): boolean {
  if (campo === "*") return true;
  return campo.split(",").some((p) => Number(p) === valor);
}

/** ¿Toca la tarea en este tramo de 10 minutos? (el minuto se compara por tramo, porque Netlify puede llegar tarde). */
export function tocaAhora(cron: string, ahora: Date): boolean {
  const [min, hora, dia, mes, semana] = cron.trim().split(/\s+/);
  const tramo = Math.floor(ahora.getUTCMinutes() / 10) * 10;
  const minutos = min === "*" ? [tramo] : min.split(",").map(Number);
  return (
    minutos.some((m) => Math.floor(m / 10) * 10 === tramo) &&
    campoCalza(hora, ahora.getUTCHours()) &&
    campoCalza(dia, ahora.getUTCDate()) &&
    campoCalza(mes, ahora.getUTCMonth() + 1) &&
    campoCalza(semana, ahora.getUTCDay())
  );
}

export default async () => {
  const base = process.env.URL; // la dirección principal del sitio, la pone Netlify
  const secreto = process.env.CRON_SECRET;
  if (!base || !secreto) {
    console.error("[tareas] Falta URL o CRON_SECRET en las variables de entorno.");
    return new Response("Falta configuración", { status: 500 });
  }
  const ahora = new Date();
  const toca = TAREAS.filter((t) => tocaAhora(t.cron, ahora));
  if (toca.length === 0) return new Response("Nada que correr");

  const resultados = await Promise.allSettled(
    toca.map(async (t) => {
      const r = await fetch(new URL(t.ruta, base), {
        headers: { Authorization: `Bearer ${secreto}` },
        // La función programada tiene unos 30 s; si la tarea tarda más, sigue en el servidor y su resultado queda en
        // Panel › Tareas programadas.
        signal: AbortSignal.timeout(25_000),
      });
      return `${t.ruta} → ${r.status}`;
    }),
  );
  for (const r of resultados) console.log("[tareas]", r.status === "fulfilled" ? r.value : `error: ${r.reason}`);
  return new Response("ok");
};

export const config = { schedule: "*/10 * * * *" };
