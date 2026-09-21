"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fieldClassSm, labelClassSm } from "@/components/ui/field";
import type { IconoComp } from "@/components/tabla/botones-vista";
import { ListaDatos } from "@/components/tabla/lista-datos";
import { EstadoIcon, PersonaIcon } from "@/lib/nav-icons";
import type { NombreFilas } from "@/lib/tabla/pie";
import { actualizarDropshipper } from "./actions";
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

function FichaDropshipper({ d }: { d: FilaDropshipper }) {
  return (
    <form
      action={actualizarDropshipper}
      className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-4"
    >
      <input type="hidden" name="id" value={d.id} />
      <div className="min-w-[10rem] flex-1">
        <p className="text-sm font-medium">{d.nombre}</p>
        <p className="text-xs text-muted-foreground">
          {d.email ?? "—"} {d.telefono ? `· ${d.telefono}` : ""}
        </p>
      </div>
      <label className="flex flex-col gap-1">
        <span className={labelClassSm}>Estado</span>
        <select name="estado" defaultValue={d.estado} className={fieldClassSm}>
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
          className={`${fieldClassSm} w-32 tabular-nums`}
        />
      </label>
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1">
        <span className={labelClassSm}>Notas</span>
        <input type="text" name="notas" defaultValue={d.notas ?? ""} className={fieldClassSm} />
      </label>
      <Badge tone={toneEstado[d.estado] ?? "neutral"}>{etiquetaEstado(d.estado)}</Badge>
      <Button type="submit" variant="secondary" className="text-xs">
        Guardar
      </Button>
    </form>
  );
}

/** Directorio de dropshippers con la barra de herramientas común (agrupar por estado, inactivos y filtros). */
export function ListaDropshippers({ dropshippers, pais }: { dropshippers: FilaDropshipper[]; pais: string }) {
  return (
    <ListaDatos
      def={DEF_DROPSHIPPERS}
      filas={dropshippers}
      iconos={ICONOS}
      nombre={NOMBRE}
      claveFila={(d) => d.id}
      renderFila={(d) => <FichaDropshipper d={d} />}
      etiquetaGrupo={(_campo, grupo) => (
        <Badge tone={toneEstado[grupo.clave] ?? "neutral"}>{grupo.etiqueta}</Badge>
      )}
      vacio={`Todavía no hay dropshippers registrados para ${pais}.`}
    />
  );
}
