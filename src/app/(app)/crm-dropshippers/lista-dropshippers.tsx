"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import { HistorialGenerico } from "@/components/ui/historial-generico";
import { useToast } from "@/components/ui/toast";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { EstadoIcon, PersonaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { actualizarDropshipper, obtenerHistorialDropshipper } from "./actions";
import { CrearDropshipperPanel } from "./crear-dropshipper-panel";
import { DEF_DROPSHIPPERS, ESTADOS, etiquetaEstado, type FilaDropshipper } from "./def-crm";

const NOMBRE: NombreFilas = { singular: "dropshipper", plural: "dropshippers" };
const ICONOS: Record<string, IconoComp> = {
  estado: EstadoIcon,
  nombre: PersonaIcon,
  contacto: PersonaIcon,
  volumen: PersonaIcon,
  notas: PersonaIcon,
};

const toneEstado: Record<string, "neutral" | "success" | "info"> = {
  prospecto: "info",
  activo: "success",
  inactivo: "neutral",
};

/**
 * Tarjeta de un dropshipper: sus datos con guardado propio (como antes) y, al pulsar «Actividad», su línea de
 * tiempo (agregado, cambios de estado) — la misma que usan las fichas de detalle de las demás áreas
 * (`HistorialGenerico`), desplegada dentro de la tarjeta en vez de en un panel aparte, porque aquí cada fila ya
 * es su propio formulario.
 */
function FichaDropshipper({ d, codigoPais, puedeEscribir }: { d: FilaDropshipper; codigoPais: string; puedeEscribir: boolean }) {
  const { mostrarToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [expandido, setExpandido] = useState(false);
  const [version, setVersion] = useState(0);

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await actualizarDropshipper(formData);
        mostrarToast("Cambios guardados");
        setVersion((v) => v + 1);
      } catch (err) {
        mostrarToast(err instanceof Error ? err.message : "No se pudo guardar.", "destructive");
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <form onSubmit={alEnviar} className="flex flex-wrap items-end gap-4 p-4">
        <input type="hidden" name="id" value={d.id} />
        <div className="min-w-[10rem] flex-1">
          <p className="text-sm font-medium">{d.nombre}</p>
          <p className="text-xs text-muted-foreground">
            {d.email ?? "—"} {d.telefono ? `· ${d.telefono}` : ""}
          </p>
        </div>
        {puedeEscribir ? (
          <>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Estado</span>
              <select name="estado" defaultValue={d.estado} disabled={pending} className={fieldClassSm}>
                {ESTADOS.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={labelClassSm}>Volumen mensual est.</span>
              <input
                type="number"
                step="0.01"
                min="0"
                name="volumen_mensual_estimado"
                defaultValue={d.volumen ?? ""}
                disabled={pending}
                className={`${fieldClassSm} w-32 tabular-nums`}
              />
            </label>
            <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
              <span className={labelClassSm}>Notas</span>
              <input type="text" name="notas" defaultValue={d.notas ?? ""} disabled={pending} className={fieldClassSm} />
            </label>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">{d.notas || "Sin notas."}</p>
        )}
        <Badge tone={toneEstado[d.estado] ?? "neutral"}>{etiquetaEstado(d.estado)}</Badge>
        {puedeEscribir && (
          <Button type="submit" variant="secondary" className="text-xs" disabled={pending}>
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        )}
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          aria-expanded={expandido}
          className="text-xs font-medium text-accent-foreground underline underline-offset-2"
        >
          {expandido ? "Ocultar actividad" : "Ver actividad"}
        </button>
      </form>
      {expandido && (
        <HistorialGenerico
          id={d.id}
          codigoPais={codigoPais}
          version={version}
          titulo="Actividad"
          obtener={obtenerHistorialDropshipper}
        />
      )}
    </div>
  );
}

/** Directorio de dropshippers con la barra de herramientas común (agrupar por estado, inactivos, filtros y «Agregar»). */
export function ListaDropshippers({
  dropshippers,
  pais,
  paisId,
  codigoPais,
  puedeEscribir,
}: {
  dropshippers: FilaDropshipper[];
  pais: string;
  paisId: string;
  codigoPais: string;
  puedeEscribir: boolean;
}) {
  return (
    <ListaDatos
      def={DEF_DROPSHIPPERS}
      filas={dropshippers}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(d) => d.id}
      accionPrincipal={puedeEscribir ? <CrearDropshipperPanel paisId={paisId} /> : undefined}
      renderFila={(d) => <FichaDropshipper d={d} codigoPais={codigoPais} puedeEscribir={puedeEscribir} />}
      etiquetaGrupo={(_campo, grupo) => (
        <Badge tone={toneEstado[grupo.clave] ?? "neutral"}>{grupo.etiqueta}</Badge>
      )}
      vacio={`Todavía no hay dropshippers registrados para ${pais}.`}
    />
  );
}
