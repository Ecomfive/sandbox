"use client";

import { useEffect, useId, useState, useTransition, type ReactNode } from "react";
import { BotonAccion } from "@/components/ui/boton-accion";
import { BotonCrear } from "@/components/ui/boton-crear";
import { Campo } from "@/components/ui/campo-ficha";
import { CampoFoto } from "@/components/ui/campo-foto";
import { fieldClass } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useFaltantes } from "@/components/ui/usar-faltantes";
import { CerrarIcon, CheckIcon, EnlaceIcon, EstadoIcon, GastoIcon, SeleccionIcon } from "@/lib/nav-icons";
import { actualizarSeleccion, crearSeleccion, prepararSubidaFotoSeleccion } from "./actions";
import { etiquetaFuente, type FilaSeleccion } from "./def-seleccion";

export interface Responsable {
  id: string;
  nombre: string;
}

// La fecha de hoy en la hora de quien usa el sistema (no en UTC: de noche en Panamá, UTC ya es mañana).
const hoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * El formulario de una fila de Selección (como `FormularioFiltro`). Sin `fila` crea una a mano, siempre «Manual» (lo de una
 * fuente se crea en su módulo y se envía desde ahí); con `fila` modifica. Al crear, los botones van abajo; al editar desde la ficha, arriba y
 * solo con cambios. El estado no se cambia aquí: se mueve desde la celda, la ficha o la barra de varias filas.
 */
export function FormularioSeleccion({
  fila,
  responsables,
  categorias,
  alGuardar,
  alCancelar,
  alCambiarGuardando,
  alModificar,
  botonesArriba,
  acciones,
}: {
  fila?: FilaSeleccion;
  responsables: Responsable[];
  /** Las categorías que ya se usan, para sugerirlas. */
  categorias: string[];
  alGuardar: () => void;
  alCancelar?: () => void;
  alCambiarGuardando?: (guardando: boolean) => void;
  alModificar?: () => void;
  botonesArriba?: boolean;
  acciones?: ReactNode;
}) {
  const editando = !!fila;
  const idLista = useId();
  const [modificado, setModificado] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { formRef, completo, faltante, revisar, señalarFaltante } = useFaltantes();
  const invalido = (id: string) => (faltante === id ? true : undefined);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    alCambiarGuardando?.(pending);
  }, [pending, alCambiarGuardando]);

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const r = editando ? await actualizarSeleccion(formData) : await crearSeleccion(formData);
        if (r?.error) setError(r.error);
        else {
          setModificado(false);
          alGuardar();
        }
      } catch {
        setError("No se pudo guardar. Inténtalo de nuevo.");
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={alEnviar}
      onInput={revisar}
      onChange={() => {
        revisar();
        setModificado(true);
        alModificar?.();
      }}
      aria-busy={pending}
      className="flex flex-1 flex-col"
    >
      {editando && <input type="hidden" name="id" value={fila.id} />}

      {botonesArriba && (
        <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-2 border-y border-border bg-card px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {modificado && (
              <>
                <BotonAccion type="submit" tono="oscuro" icono={CheckIcon} disabled={pending || subiendoFoto}>
                  {pending ? "Guardando..." : "Guardar cambios"}
                </BotonAccion>
                <BotonAccion icono={CerrarIcon} onClick={alCancelar} disabled={pending}>
                  Cancelar
                </BotonAccion>
              </>
            )}
            {acciones}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-1 flex-col divide-y divide-border p-5">
        <Seccion icono={SeleccionIcon} titulo="Producto">
          <Campo etiqueta="Nombre" id="campo-nombre-seleccion" obligatorio faltante={faltante}>
            <input
              id="campo-nombre-seleccion"
              type="text"
              name="nombre"
              required
              data-enfocar
              maxLength={200}
              aria-invalid={invalido("campo-nombre-seleccion")}
              defaultValue={fila?.nombre}
              placeholder="Ej: Masajeador cervical eléctrico"
              className={fieldClass}
            />
          </Campo>
          <CampoFoto nombreCampo="foto_url" valorInicial={fila?.fotoUrl ?? null} alCambiarSubiendo={setSubiendoFoto} prepararSubida={prepararSubidaFotoSeleccion} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {editando ? (
              <Campo etiqueta="Fuente" id="campo-fuente-seleccion">
                <p id="campo-fuente-seleccion" className="m-0 py-2 text-sm">
                  {etiquetaFuente(fila.fuente)} · <span className="tabular-nums">{fila.codigoFuente}</span>
                </p>
              </Campo>
            ) : (
              // Lo que sale de una fuente se crea en su módulo y se envía desde ahí (así queda en la base de la fuente y no se
              // duplica): aquí solo se crean filas «Manual».
              <Campo etiqueta="Fuente" id="campo-fuente-seleccion">
                <p id="campo-fuente-seleccion" className="m-0 py-2 text-sm">
                  Manual <span className="text-muted-foreground">· el código MAN- se pone solo</span>
                </p>
              </Campo>
            )}
            <Campo etiqueta="Fecha de captación" id="campo-fecha-seleccion" obligatorio faltante={faltante}>
              <input
                id="campo-fecha-seleccion"
                type="date"
                name="fecha_captacion"
                required
                aria-invalid={invalido("campo-fecha-seleccion")}
                defaultValue={fila?.fechaCaptacion ?? hoy()}
                className={fieldClass}
              />
            </Campo>
            <Campo etiqueta="Categoría" id="campo-categoria-seleccion">
              <input
                id="campo-categoria-seleccion"
                type="text"
                name="categoria"
                list={idLista}
                maxLength={80}
                defaultValue={fila?.categoria ?? ""}
                placeholder="Ej: Salud/Bienestar"
                className={fieldClass}
              />
              <datalist id={idLista}>
                {categorias.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Campo>
            <Campo etiqueta="Responsable" id="campo-responsable-seleccion">
              <select id="campo-responsable-seleccion" name="responsable_id" defaultValue={fila?.responsableId ?? ""} className={fieldClass}>
                <option value="">Sin responsable</option>
                {responsables.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.nombre}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </Seccion>

        <Seccion icono={EnlaceIcon} titulo="Enlaces">
          <Campo etiqueta="Página del producto" id="campo-url-pagina">
            <input id="campo-url-pagina" type="url" name="url_pagina" defaultValue={fila?.urlPagina ?? ""} placeholder="Ej: https://tienda.com/producto" className={fieldClass} />
          </Campo>
          <Campo etiqueta="Ad Library" id="campo-url-ads">
            <input id="campo-url-ads" type="url" name="url_ad_library" defaultValue={fila?.urlAdLibrary ?? ""} placeholder="Ej: https://www.facebook.com/ads/library/?id=…" className={fieldClass} />
          </Campo>
        </Seccion>

        <Seccion icono={GastoIcon} titulo="Precios de referencia (USD)">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Costo proveedor" id="campo-costo-seleccion">
              <input id="campo-costo-seleccion" type="number" step="0.01" min="0" name="costo_proveedor" defaultValue={fila?.costoProveedor ?? ""} placeholder="Ej: 4.50" className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta="Precio de venta" id="campo-precio-seleccion">
              <input id="campo-precio-seleccion" type="number" step="0.01" min="0" name="precio_venta" defaultValue={fila?.precioVenta ?? ""} placeholder="Ej: 29.90" className={`${fieldClass} tabular-nums`} />
            </Campo>
          </div>
        </Seccion>

        <Seccion icono={EstadoIcon} titulo="Notas">
          <Campo etiqueta="Notas" id="campo-notas-seleccion">
            <textarea id="campo-notas-seleccion" name="notas" rows={3} maxLength={4000} defaultValue={fila?.notas ?? ""} className={fieldClass} />
          </Campo>
        </Seccion>
      </div>

      {!botonesArriba && (
        <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-border bg-card p-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <BotonCrear
            puede={completo && !subiendoFoto}
            enviando={pending}
            etiqueta={editando ? "Guardar cambios" : "Agregar a Selección"}
            etiquetaEnviando="Guardando..."
            alPulsarSinCompletar={señalarFaltante}
          />
        </div>
      )}
    </form>
  );
}
