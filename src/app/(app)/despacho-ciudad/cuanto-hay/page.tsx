import Link from "next/link";
import { ResponderCuantoHay } from "@/components/cuanto-hay/responder";
import { anilloFoco } from "@/components/ui/field";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { cargarPreguntasDespacho, cargarTiendasCuantoHay, contarAbiertas } from "@/lib/cuanto-hay/datos";
import { PROVEEDURIA, agruparPorTienda, tiendasDePersona } from "@/lib/cuanto-hay/reglas";
import { cargarTiendasPermitidas } from "@/lib/finanzas/cargar-tiendas-permitidas";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Responder cuánto hay" };

export const dynamic = "force-dynamic";

/**
 * Gestión de tienda › Responder cuánto hay (16 nov 2026, migración 0302; prototipo aprobado: https://claude.ai/artifact/BK449CDGnYApU2eQ9BqvxL).
 * El panel de Yiletsi: las preguntas de todas las tiendas, agrupadas por tienda (botones para ver una sola); escribe la cantidad que contó
 * despacho y «Responder» se la manda a quien preguntó. «Respondidas» muestra las de los últimos 7 días.
 */
export default async function ResponderCuantoHayPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("despacho-cuanto-hay");
  const sp = await searchParams;
  const respondidas = sp.ver === "respondidas";
  const supabase = createServiceClient();
  // Con tiendas limitadas, solo las preguntas de sus tiendas (auditoría de seguridad, 18 nov 2026).
  const permitidas = await cargarTiendasPermitidas();
  // Las de Proveeduría (sin tienda, migración 0336) van al final, como una tienda más; con tiendas limitadas no se ven.
  const tiendas = [...tiendasDePersona(await cargarTiendasCuantoHay(supabase), permitidas, (t) => t.unidadId), ...(permitidas === null ? [{ ...PROVEEDURIA, unidadId: null }] : [])];
  const suyas = new Set(tiendas.map((t) => t.id));
  const tiendaElegida = typeof sp.tienda === "string" && tiendas.some((t) => t.id === sp.tienda) ? sp.tienda : null;
  const [todas, todasAbiertas] = await Promise.all([cargarPreguntasDespacho(supabase, respondidas, tiendas), contarAbiertas(supabase)]);
  const { faltaMigracion } = todas;
  const preguntas = permitidas ? todas.preguntas.filter((p) => suyas.has(p.tiendaId)) : todas.preguntas;
  const abiertas = permitidas ? Object.fromEntries(Object.entries(todasAbiertas).filter(([id]) => suyas.has(id))) : todasAbiertas;
  const grupos = agruparPorTienda(
    preguntas.filter((p) => !tiendaElegida || p.tiendaId === tiendaElegida),
    tiendas.map((t) => ({ id: t.id, nombre: t.nombre })),
  );
  if (respondidas) for (const g of grupos) g.preguntas.reverse(); // las respondidas, la más reciente primero
  const total = Object.values(abiertas).reduce((a, b) => a + b, 0);
  const chip = (activo: boolean) =>
    `inline-flex min-h-9 items-center rounded-full border px-3.5 text-[13px] font-medium ${anilloFoco} ${activo ? "border-primario bg-primario-suave text-primario" : "border-border bg-card text-foreground-soft hover:bg-muted"}`;
  const enlace = (tienda: string | null, ver: boolean) => {
    const q = new URLSearchParams();
    if (tienda) q.set("tienda", tienda);
    if (ver) q.set("ver", "respondidas");
    const s = q.toString();
    return `/despacho-ciudad/cuanto-hay${s ? `?${s}` : ""}`;
  };
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Responder cuánto hay" oculto>
        Lo que preguntan las tiendas y Proveeduría: manda a contar a despacho, escribe la cantidad y responde. La respuesta le llega a quien preguntó.
      </EncabezadoPagina>
      {faltaMigracion ? (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase la migración 0302 («¿Cuánto hay?»).
        </p>
      ) : (
        <>
          <nav aria-label="Tiendas" className="flex flex-wrap gap-1.5">
            <Link href={enlace(null, respondidas)} aria-current={!tiendaElegida ? "page" : undefined} className={chip(!tiendaElegida)}>
              Todas · {total}
            </Link>
            {tiendas.map((t) => (
              <Link key={t.id} href={enlace(t.id, respondidas)} aria-current={tiendaElegida === t.id ? "page" : undefined} className={chip(tiendaElegida === t.id)}>
                {t.nombre} · {abiertas[t.id] ?? 0}
              </Link>
            ))}
            <Link href={enlace(tiendaElegida, !respondidas)} className={`${chip(respondidas)} ml-auto`} aria-current={respondidas ? "page" : undefined}>
              {respondidas ? "Respondidas (7 días)" : "Ver respondidas"}
            </Link>
          </nav>
          <ResponderCuantoHay grupos={grupos} respondidas={respondidas} puedeResponder={!usuario.modulosSoloLectura.includes("despacho-cuanto-hay")} />
        </>
      )}
    </Pagina>
  );
}
