"use client";

import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { FichaCrear } from "@/components/ui/ficha-crear";
import { Seccion } from "@/components/ui/seccion-ficha";
import { TareasIcon } from "@/lib/nav-icons";
import { ESTADOS_TAREA, MAX_DESCRIPCION, MAX_TITULO, PRIORIDADES_TAREA } from "@/lib/tareas/tareas";
import { crearTareaFormulario } from "./actions";
import type { PersonaTarea } from "./datos";

/**
 * «Agregar tarea»: la ficha de crear del sistema. Un administrador la asigna a cualquiera; los demás, a sí mismos o sin asignar.
 */
export function NuevaTarea({
  personas,
  miId,
  admin,
  modulos,
  boton,
}: {
  personas: PersonaTarea[];
  miId: string;
  admin: boolean;
  modulos: { clave: string; etiqueta: string }[];
  boton?: (abrir: () => void) => React.ReactNode;
}) {
  const asignables = admin ? personas : personas.filter((p) => p.id === miId);
  return (
    <FichaCrear titulo="Nueva tarea" etiquetaBoton="Agregar tarea" etiquetaCrear="Crear tarea" action={crearTareaFormulario} mensajeExito="Tarea creada" abrirConNuevo boton={boton}>
      {({ faltante, invalido }) => (
        <Seccion icono={TareasIcon} titulo="Tarea">
          <Campo etiqueta="Título" id="tarea-titulo" obligatorio faltante={faltante}>
            <input id="tarea-titulo" name="titulo" required maxLength={MAX_TITULO} aria-invalid={invalido("tarea-titulo")} placeholder="Ej: Revisar los precios de Costa Rica" className={fieldClass} data-enfocar />
          </Campo>
          <Campo etiqueta="Descripción" id="tarea-descripcion">
            <textarea id="tarea-descripcion" name="descripcion" rows={4} maxLength={MAX_DESCRIPCION} placeholder="Ej: Las 7 activas con precio ₡1 000" className={`${fieldClass} resize-y`} />
          </Campo>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo etiqueta="Asignada a" id="tarea-responsable">
              <select id="tarea-responsable" name="responsable_id" defaultValue={admin ? "" : miId} className={fieldClass}>
                <option value="">Sin asignar</option>
                {asignables.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Estado" id="tarea-estado">
              <select id="tarea-estado" name="estado" defaultValue="pendiente" className={fieldClass}>
                {ESTADOS_TAREA.filter((e) => e.valor !== "archivado").map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Fecha de inicio" id="tarea-inicio">
              <input id="tarea-inicio" name="fecha_inicio" type="date" className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta="Fecha límite" id="tarea-limite">
              <input id="tarea-limite" name="fecha_limite" type="date" className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta="Prioridad" id="tarea-prioridad">
              <select id="tarea-prioridad" name="prioridad" defaultValue="" className={fieldClass}>
                <option value="">Sin prioridad</option>
                {PRIORIDADES_TAREA.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Módulo del sistema" id="tarea-modulo">
              <select id="tarea-modulo" name="modulo" defaultValue="" className={fieldClass}>
                <option value="">Ninguno</option>
                {modulos.map((m) => (
                  <option key={m.clave} value={m.clave}>
                    {m.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </Seccion>
      )}
    </FichaCrear>
  );
}
