"use client";

import Link from "next/link";
import { anilloFoco } from "@/components/ui/field";
import { ETIQUETA_MOTIVO } from "@/lib/crm/automatizar";
import type { DuplicadosVista } from "./datos-fase4";
import { Cifra, Cifras, Insignia } from "./piezas-direccion";

const fecha = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "sin fecha");

/**
 * Dirección › Duplicados (fase 4): los dropshippers que parecen la misma persona (mismo WhatsApp, correo, tienda o nombre). Solo los muestra:
 * unirlos se hace a mano desde su ficha. Los números no se muestran.
 */
export function VistaDuplicados({ datos }: { datos: DuplicadosVista }) {
  const fuertes = datos.grupos.filter((g) => g.motivos.some((m) => m !== "nombre")).length;
  return (
    <>
      <Cifras>
        <Cifra titulo="Grupos que parecen duplicados" valor={datos.grupos.length} nota="Para revisar a mano" tono={datos.grupos.length ? "aviso" : "exito"} />
        <Cifra titulo="Por WhatsApp, correo o tienda" valor={fuertes} nota="Muy probablemente la misma persona" tono={fuertes ? "peligro" : "neutro"} />
        <Cifra titulo="Solo por el nombre" valor={datos.grupos.length - fuertes} nota="Puede ser casualidad" tono="neutro" />
        <Cifra titulo="Fichas involucradas" valor={datos.grupos.reduce((s, g) => s + g.ids.length, 0)} nota="Dropshippers en esos grupos" tono="info" />
      </Cifras>
      <p className="m-0 text-sm text-muted-foreground">
        {datos.grupos.length === 0
          ? "No hay dropshippers que parezcan repetidos."
          : `${datos.grupos.length} grupos de dropshippers que parecen la misma persona${fuertes ? ` (${fuertes} por WhatsApp, correo o tienda; el resto solo por el nombre, que puede ser casualidad)` : " (todos solo por el nombre, que puede ser casualidad)"}. Ábrelos para revisarlos; unirlos o corregirlos se hace a mano desde su ficha.`}
      </p>
      <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-3 p-0">
        {datos.grupos.map((g) => (
          <li key={g.ids.join("-")} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
            <div className="flex flex-wrap gap-1.5">
              {g.motivos.map((m) => (
                <Insignia key={m} tono={m === "nombre" ? "neutro" : "aviso"}>
                  {ETIQUETA_MOTIVO[m]}
                </Insignia>
              ))}
            </div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
              {g.miembros.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-2">
                  <Link href={`/crm-dropshippers?abrir=${d.id}`} className={`min-w-0 hover:underline ${anilloFoco}`}>
                    <span className="font-medium">{d.nombre}</span> <span className="text-xs text-muted-foreground">{d.codigo}</span>
                  </Link>
                  <span className="shrink-0 text-right text-xs text-muted-foreground">
                    {d.cuentas ? `${d.cuentas} ${d.cuentas === 1 ? "cuenta" : "cuentas"} de Dropi` : "Sin cuenta"}
                    {d.tieneChat ? " · con chat" : ""}
                    <span className="block">Entró: {fecha(d.ingreso)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </>
  );
}
