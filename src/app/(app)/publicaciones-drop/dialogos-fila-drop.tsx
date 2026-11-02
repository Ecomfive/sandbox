"use client";

import { useState } from "react";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Ventana } from "@/components/ui/ventana";
import { validarAccesoPrivado, validarSolicitudIngreso } from "@/lib/publicaciones-drop/acciones";

const AVISO_SIN_CONEXION_FILA = "Todavía no se escribe en Drop desde el sistema: por ahora solo se leen sus publicaciones. Hazlo en Drop.";

const botonPrimario = `inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background hover:opacity-90 disabled:opacity-50 ${anilloFoco}`;
const botonSecundario = `inline-flex min-h-10 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium hover:bg-muted ${anilloFoco}`;

/**
 * «Gestionar inventario» de Drop (3 nov 2026): el stock no se edita, se **pide un ingreso** de unidades que la bodega recibe, cuenta y aprueba o declina (DROP-REFERENCIA.md). El producto
 * nace en cero. Todavía el sistema no escribe en Drop: valida y avisa.
 */
export function DialogoSolicitudInventario({ nombre, alCerrar }: { nombre: string; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  const [unidades, setUnidades] = useState("");
  const [error, setError] = useState<string | null>(null);
  function pedir() {
    const r = validarSolicitudIngreso(unidades);
    if ("error" in r) return setError(r.error);
    mostrarToast(AVISO_SIN_CONEXION_FILA);
    alCerrar();
  }
  return (
    <Ventana abierto alCerrar={alCerrar} titulo="Gestionar inventario" ancho="sm">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          pedir();
        }}
      >
        <p className="m-0 text-sm font-medium [overflow-wrap:anywhere]">{nombre}</p>
        <Campo etiqueta="Unidades que se mandan a la bodega" id="campo-unidades" obligatorio>
          <input id="campo-unidades" type="number" min="1" step="1" required data-enfocar value={unidades} onChange={(e) => (setUnidades(e.target.value), setError(null))} placeholder="Ej: 100" className={`${fieldClass} w-full tabular-nums`} />
        </Campo>
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={alCerrar} className={botonSecundario}>
            Cancelar
          </button>
          <button type="submit" className={botonPrimario}>
            Pedir ingreso
          </button>
        </div>
      </form>
    </Ventana>
  );
}

/**
 * «Dar acceso privado» de Drop: no hay un producto privado aparte; se le da acceso al producto desde el mismo ID, con el correo del cliente y su precio de venta (el mismo u otro).
 * Todavía el sistema no escribe en Drop: valida y avisa.
 */
export function DialogoAccesoPrivado({ nombre, alCerrar }: { nombre: string; alCerrar: () => void }) {
  const { mostrarToast } = useToast();
  const [correo, setCorreo] = useState("");
  const [precio, setPrecio] = useState("");
  const [error, setError] = useState<string | null>(null);
  function dar() {
    const r = validarAccesoPrivado(correo, precio);
    if ("error" in r) return setError(r.error);
    mostrarToast(AVISO_SIN_CONEXION_FILA);
    alCerrar();
  }
  return (
    <Ventana abierto alCerrar={alCerrar} titulo="Dar acceso privado" ancho="sm">
      <form
        className="flex flex-col gap-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          dar();
        }}
      >
        <p className="m-0 text-sm font-medium [overflow-wrap:anywhere]">{nombre}</p>
        <Campo etiqueta="Correo del cliente" id="campo-correo" obligatorio>
          <input id="campo-correo" type="email" required data-enfocar value={correo} onChange={(e) => (setCorreo(e.target.value), setError(null))} placeholder="Ej: cliente@correo.com" className={`${fieldClass} w-full`} />
        </Campo>
        <Campo etiqueta="Precio de venta para este cliente (₡)" id="campo-precio-privado">
          <input id="campo-precio-privado" type="number" min="1" step="1" value={precio} onChange={(e) => (setPrecio(e.target.value), setError(null))} placeholder="Vacío: el mismo precio" className={`${fieldClass} w-full tabular-nums`} />
        </Campo>
        {error && (
          <p role="alert" className="m-0 rounded-md bg-destructive-soft px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={alCerrar} className={botonSecundario}>
            Cancelar
          </button>
          <button type="submit" className={botonPrimario}>
            Dar acceso
          </button>
        </div>
      </form>
    </Ventana>
  );
}
