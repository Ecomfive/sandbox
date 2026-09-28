"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { actualizarFiltro, crearFiltro } from "./actions";
import { ESTADOS, ESTADOS_REGISTRO, PRIORIDADES, TIPOS_ENVIO, type FilaFiltro } from "./def-filtros";
import { BotonAccion } from "@/components/ui/boton-accion";
import { BotonCrear } from "@/components/ui/boton-crear";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useFaltantes } from "@/components/ui/usar-faltantes";
import { CalendarioIcon, CheckIcon, CerrarIcon, FiltroIcon, GastoIcon } from "@/lib/nav-icons";

/**
 * El formulario de un producto candidato de Filtros (igual que `FormularioCompra`). Sin `filtro` crea (lleva
 * el país); con `filtro` modifica. Botones igual que Compras: abajo al crear, arriba (solo si hay cambios) al
 * editar desde la ficha.
 */
export function FormularioFiltro({
  paisId,
  filtro,
  alGuardar,
  alCancelar,
  alCambiarGuardando,
  alModificar,
  botonesArriba,
  encabezado,
  acciones,
}: {
  paisId: string;
  filtro?: FilaFiltro;
  alGuardar: () => void;
  alCancelar?: () => void;
  alCambiarGuardando?: (guardando: boolean) => void;
  alModificar?: () => void;
  botonesArriba?: boolean;
  encabezado?: ReactNode;
  acciones?: ReactNode;
}) {
  const [modificado, setModificado] = useState(false);
  const { formRef, completo, faltante, revisar, señalarFaltante } = useFaltantes();
  const invalido = (id: string) => (faltante === id ? true : undefined);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    alCambiarGuardando?.(pending);
  }, [pending, alCambiarGuardando]);
  const [error, setError] = useState<string | null>(null);
  const editando = !!filtro;

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const resultado = editando ? await actualizarFiltro(formData) : await crearFiltro(formData);
        if (resultado?.error) setError(resultado.error);
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
      {!editando && <input type="hidden" name="pais_id" value={paisId} />}
      {editando && <input type="hidden" name="id" value={filtro.id} />}

      {botonesArriba && (
        <>
          {encabezado}
          <div className="sticky top-[var(--alto-cabecera,3.8rem)] z-[5] flex flex-col gap-2 border-y border-border bg-card px-5 py-3">
            <div className="flex flex-wrap gap-2">
              {modificado && (
                <>
                  <BotonAccion type="submit" tono="oscuro" icono={CheckIcon} disabled={pending}>
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
        </>
      )}

      <div className="flex flex-1 flex-col divide-y divide-border p-5">
        <Seccion icono={FiltroIcon} titulo="Producto">
          <Campo etiqueta="Nombre" id="campo-nombre-filtro" obligatorio faltante={faltante}>
            <input
              id="campo-nombre-filtro"
              type="text"
              name="nombre"
              required
              data-enfocar
              aria-invalid={invalido("campo-nombre-filtro")}
              defaultValue={filtro?.nombre}
              placeholder="Ej: Calcitrin Gold para mayores de 40"
              className={fieldClass}
            />
          </Campo>
          <Campo etiqueta="Foto del producto (enlace)" id="campo-foto">
            <input
              id="campo-foto"
              type="url"
              name="foto_url"
              defaultValue={filtro?.fotoUrl ?? ""}
              placeholder="Enlace a la imagen"
              className={fieldClass}
            />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Estado del Registro" id="campo-estado-registro" obligatorio faltante={faltante}>
              <select
                id="campo-estado-registro"
                name="estado_registro"
                required
                aria-invalid={invalido("campo-estado-registro")}
                defaultValue={filtro?.estadoRegistro ?? "en_cola"}
                className={fieldClass}
              >
                {ESTADOS_REGISTRO.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Estado" id="campo-estado" obligatorio faltante={faltante}>
              <select
                id="campo-estado"
                name="estado"
                required
                aria-invalid={invalido("campo-estado")}
                defaultValue={filtro?.estado ?? "pendiente"}
                className={fieldClass}
              >
                {ESTADOS.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Tipo de Envío" id="campo-tipo-envio">
              <select id="campo-tipo-envio" name="tipo_envio" defaultValue={filtro?.tipoEnvio ?? ""} className={fieldClass}>
                <option value="">Sin definir</option>
                {TIPOS_ENVIO.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Prioridad" id="campo-prioridad" obligatorio faltante={faltante}>
              <select
                id="campo-prioridad"
                name="prioridad"
                required
                aria-invalid={invalido("campo-prioridad")}
                defaultValue={filtro?.prioridad ?? "normal"}
                className={fieldClass}
              >
                {PRIORIDADES.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
        </Seccion>

        <Seccion icono={GastoIcon} titulo="Cantidad y precio">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="QTY Producto" id="campo-qty">
              <input id="campo-qty" type="number" step="1" min="0" name="qty_producto" defaultValue={filtro?.qtyProducto ?? ""} className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta="Precio Total" id="campo-precio-total">
              <input id="campo-precio-total" type="number" step="0.01" min="0" name="precio_total" defaultValue={filtro?.precioTotal ?? ""} className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta="Precio Unitario" id="campo-precio-unitario">
              <input id="campo-precio-unitario" type="number" step="0.01" min="0" name="precio_unitario" defaultValue={filtro?.precioUnitario ?? ""} className={`${fieldClass} tabular-nums`} />
            </Campo>
          </div>
        </Seccion>

        <Seccion icono={CalendarioIcon} titulo="Seguimiento">
          <label htmlFor="aprobacion_gestionada" className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              id="aprobacion_gestionada"
              type="checkbox"
              name="aprobacion_gestionada"
              defaultChecked={filtro?.aprobacionGestionada}
              className="h-4 w-4 accent-[var(--foreground)]"
            />
            <span>Aprobación Gestionada</span>
          </label>
          <Campo etiqueta="Comentarios" id="campo-comentarios">
            <textarea id="campo-comentarios" name="comentarios" defaultValue={filtro?.comentarios ?? ""} rows={3} className={fieldClass} />
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
            puede={completo}
            enviando={pending}
            etiqueta={editando ? "Guardar cambios" : "Agregar producto"}
            etiquetaEnviando="Guardando..."
            alPulsarSinCompletar={señalarFaltante}
          />
        </div>
      )}
    </form>
  );
}
