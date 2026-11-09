import { redirect } from "next/navigation";
import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { MarcoAF4 } from "@/components/af4/marco-af4";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { fechaCorta, fechaHora } from "@/lib/af4/fecha";
import { entero } from "@/lib/af4/formato";
import { requireModulo } from "@/lib/auth";
import { TABLAS_RESPALDO, rutaArchivo } from "@/lib/finanzas/respaldo";
import { createServiceClient } from "@/lib/supabase/server";
import { BotonCorrer } from "../tareas/botones";
import { BotonDescargarRespaldo } from "./boton-descargar";

export const metadata = { title: "Respaldos financieros" };

export const dynamic = "force-dynamic";
// «Respaldar ahora» espera a la tarea (se corta a los 45 s y sigue en la próxima ejecución).
export const maxDuration = 60;

const tamano = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toLocaleString("es-PA", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** Los respaldos semanales de las tablas financieras (bucket privado), para descargar tabla por tabla. */
export default async function RespaldosPage() {
  const usuario = await requireModulo("usuarios");
  if (usuario.modulosSoloLectura.includes("usuarios")) redirect("/sin-acceso");
  const { data, error } = await createServiceClient().from("fin_respaldos").select("id, ruta, bytes, tablas, disparo, creado_en").order("ruta", { ascending: false }).limit(60);
  if (error) {
    return (
      <Pagina ancho="media" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Respaldos" oculto />
        <EstadoVacioAF4 titulo="Los respaldos todavía no están instalados">Falta correr la migración 0937 en Supabase.</EstadoVacioAF4>
      </Pagina>
    );
  }
  const lista = (data ?? []) as { id: string; ruta: string; bytes: number; tablas: Record<string, number>; disparo: string; creado_en: string }[];
  return (
    <Pagina ancho="media" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo="Respaldos" actualizado={lista[0]?.creado_en ?? null} imprimir={false} acciones={<BotonCorrer clave="respaldo-finanzas" titulo="Respaldo de los datos financieros" />} />
      {lista.length === 0 ? (
        <EstadoVacioAF4 titulo="Todavía no hay respaldos" />
      ) : (
        lista.map((r) => {
          const tablas = TABLAS_RESPALDO.filter((t) => (r.tablas[t] ?? -1) >= 0);
          const completo = TABLAS_RESPALDO.every((t) => t in r.tablas);
          const filas = tablas.reduce((a, t) => a + (r.tablas[t] ?? 0), 0);
          return (
            <MarcoAF4
              key={r.id}
              id={`respaldo-${r.ruta}`}
              titulo={
                <span className="flex items-center gap-1.5">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${completo ? "bg-success" : "bg-warning"}`} />
                  {fechaCorta(r.ruta)}
                  <span className="sr-only">{completo ? " (completo)" : " (incompleto)"}</span>
                </span>
              }
              detalle={`${entero(tablas.length)} tablas · ${entero(filas)} filas · ${tamano(Number(r.bytes))} · ${fechaHora(r.creado_en)}`}
              sinRelleno
            >
              <ul className="m-0 grid list-none grid-cols-1 p-0 sm:grid-cols-2">
                {tablas.map((t) => (
                  <li key={t} className="flex items-center justify-between gap-2 border-b border-border px-4 py-1.5 text-sm">
                    <span className="min-w-0 truncate font-mono text-xs">{t}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-xs tabular-nums text-muted-foreground">{entero(r.tablas[t])}</span>
                      <BotonDescargarRespaldo ruta={rutaArchivo(r.ruta, t)} tabla={t} />
                    </span>
                  </li>
                ))}
              </ul>
            </MarcoAF4>
          );
        })
      )}
    </Pagina>
  );
}
