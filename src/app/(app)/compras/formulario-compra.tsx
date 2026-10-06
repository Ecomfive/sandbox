"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { actualizarCompra, crearCompra, prepararSubidaFotoCompra } from "./actions";
import { conEmoji, ESTADOS_COMPRA, ETAPAS_COMPRA, PRIORIDADES, VIAS_ENVIO, type FilaCompra } from "./def-compras";
import { BotonAccion } from "@/components/ui/boton-accion";
import { BotonCrear } from "@/components/ui/boton-crear";
import { CampoFoto } from "@/components/ui/campo-foto";
import { Campo } from "@/components/ui/campo-ficha";
import { fieldClass } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useFaltantes } from "@/components/ui/usar-faltantes";
import {
  CalendarioIcon,
  CheckIcon,
  CerrarIcon,
  ComprasIcon,
  EstadoIcon,
  GastoIcon,
} from "@/lib/nav-icons";

/** Casilla suelta (Factura, Financiamiento): sin `Campo` porque no lleva etiqueta arriba. */
function Casilla({ id, texto, defaultChecked }: { id: string; texto: string; defaultChecked?: boolean }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
      <input id={id} type="checkbox" name={id} defaultChecked={defaultChecked} className="h-4 w-4 accent-[var(--foreground)]" />
      <span>{texto}</span>
    </label>
  );
}

/**
 * El formulario de una compra, con sus bloques (igual que `FormularioCuenta`). Sin `compra` crea (lleva el
 * país); con `compra` modifica. El precio unitario no es un campo: es una fórmula (monto ÷ cantidad, ver
 * `valorUnitario` en `def-compras.ts`), así que solo se ve en la tabla y en la ficha, nunca se escribe a mano.
 *
 * Los botones van de dos maneras, igual que en Cuentas destino. Por defecto (crear), un botón grande al final,
 * apagado mientras falte un dato obligatorio. Con `botonesArriba` (la ficha de una compra ya creada) no hay barra
 * abajo: «Guardar cambios» y «Cancelar» aparecen junto a la cabecera, solo cuando se cambió algo.
 */
export function FormularioCompra({
  vista,
  paises,
  compra,
  alGuardar,
  alCancelar,
  alCambiarGuardando,
  alModificar,
  botonesArriba,
  encabezado,
  acciones,
}: {
  /** Desde qué vista se crea: un país la deja elegida; «importacion» crea una compra de Importadora (sin país). */
  vista: string;
  paises: { id: string; codigo: string; nombre: string }[];
  compra?: FilaCompra;
  alGuardar: () => void;
  alCancelar?: () => void;
  alCambiarGuardando?: (guardando: boolean) => void;
  alModificar?: () => void;
  botonesArriba?: boolean;
  encabezado?: ReactNode;
  acciones?: ReactNode;
}) {
  const [modificado, setModificado] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const { formRef, completo, faltante, revisar, señalarFaltante } = useFaltantes();
  const invalido = (id: string) => (faltante === id ? true : undefined);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    alCambiarGuardando?.(pending);
  }, [pending, alCambiarGuardando]);
  const [error, setError] = useState<string | null>(null);
  const editando = !!compra;
  const esImportacion = compra ? compra.tipo === "importacion" : vista === "importacion";
  const paisInicial = compra?.paisCodigo ?? (vista !== "todos" && vista !== "importacion" ? vista : "");

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const resultado = editando ? await actualizarCompra(formData) : await crearCompra(formData);
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
      {editando && <input type="hidden" name="id" value={compra.id} />}
      <input type="hidden" name="tipo" value={esImportacion ? "importacion" : "pais"} />

      {botonesArriba && (
        <>
          {encabezado}
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
        </>
      )}

      <div className="flex flex-1 flex-col divide-y divide-border p-5">
        <Seccion icono={ComprasIcon} titulo="Compra">
          <Campo etiqueta="Nombre" id="campo-nombre-compra" obligatorio faltante={faltante}>
            <input
              id="campo-nombre-compra"
              type="text"
              name="nombre"
              required
              data-enfocar
              aria-invalid={invalido("campo-nombre-compra")}
              defaultValue={compra?.nombre}
              placeholder='Ej: Gotas Líquidas Clean "Lote #1, 1000"'
              className={fieldClass}
            />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta={conEmoji("codigo", "Código")} id="campo-codigo-compra">
              {/* El código lo pone el sistema al crear la compra (el siguiente de su país): no se escribe a mano. */}
              <input
                id="campo-codigo-compra"
                type="text"
                readOnly
                value={compra?.codigo ?? ""}
                placeholder="Se asigna al crear"
                className={`${fieldClass} bg-muted text-muted-foreground`}
              />
            </Campo>
            {esImportacion ? (
              <Campo etiqueta={conEmoji("pais", "Países de destino")} id="campo-destinos-compra">
                <input id="campo-destinos-compra" type="text" name="paises_destino" defaultValue={compra?.paisesDestino.join(", ") ?? ""} placeholder="Ej: Panamá, Costa Rica" className={fieldClass} />
              </Campo>
            ) : (
              <Campo etiqueta={conEmoji("pais", "País")} id="campo-pais-compra" obligatorio faltante={faltante}>
                <select id="campo-pais-compra" name="pais" required defaultValue={paisInicial} aria-invalid={invalido("campo-pais-compra")} className={fieldClass}>
                  <option value="" disabled>
                    Elige el país
                  </option>
                  {paises.map((p) => (
                    <option key={p.codigo} value={p.codigo}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </Campo>
            )}
            <Campo etiqueta={conEmoji("prioridad", "Prioridad")} id="campo-prioridad-compra">
              <select id="campo-prioridad-compra" name="prioridad" defaultValue={compra?.prioridad ?? ""} className={fieldClass}>
                <option value="">Sin prioridad</option>
                {PRIORIDADES.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta={conEmoji("etiquetas", "Etiquetas")} id="campo-etiquetas-compra">
              <input id="campo-etiquetas-compra" type="text" name="etiquetas" defaultValue={compra?.etiquetas.join(", ") ?? ""} placeholder="Ej: reposición, kenku" className={fieldClass} />
            </Campo>
          </div>
          <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
            <legend className="mb-1.5 text-xs font-medium text-muted-foreground">{conEmoji("viaEnvio", "Vía de envío")}</legend>
            <div className="flex flex-wrap gap-4">
              {VIAS_ENVIO.map((v) => (
                <label key={v.valor} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" name="via_envio" value={v.valor} defaultChecked={compra?.viaEnvio.includes(v.valor)} className="h-4 w-4 accent-[var(--foreground)]" />
                  {v.etiqueta}
                </label>
              ))}
            </div>
          </fieldset>
          <Campo etiqueta={conEmoji("urlProducto", "URL del producto")} id="campo-url-compra">
            <input id="campo-url-compra" type="url" name="url_producto" defaultValue={compra?.urlProducto ?? ""} placeholder="Ej: https://www.alibaba.com/product-detail/…" className={fieldClass} />
          </Campo>
          <Campo etiqueta="Descripción" id="campo-descripcion-compra">
            <textarea id="campo-descripcion-compra" name="descripcion" rows={4} defaultValue={compra?.descripcion ?? ""} className={`${fieldClass} resize-y`} />
          </Campo>
          <CampoFoto nombreCampo="foto_url" valorInicial={compra?.fotoUrl ?? null} alCambiarSubiendo={setSubiendoFoto} prepararSubida={prepararSubidaFotoCompra} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta={conEmoji("etapa", "Etapa")} id="campo-etapa" obligatorio faltante={faltante}>
              <select
                id="campo-etapa"
                name="etapa"
                required
                aria-invalid={invalido("campo-etapa")}
                defaultValue={compra?.etapa ?? "backlog"}
                className={fieldClass}
              >
                {ETAPAS_COMPRA.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta={conEmoji("estado", "Estado")} id="campo-estado" obligatorio faltante={faltante}>
              <select
                id="campo-estado"
                name="estado"
                required
                aria-invalid={invalido("campo-estado")}
                defaultValue={compra?.estado ?? "backlog"}
                className={fieldClass}
              >
                {ESTADOS_COMPRA.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta={conEmoji("proveedor", "Proveedor")} id="campo-proveedor">
              <input id="campo-proveedor" type="text" name="proveedor" defaultValue={compra?.proveedor ?? ""} placeholder="Ej: Chin" className={fieldClass} />
            </Campo>
            <Campo etiqueta={conEmoji("cliente", "Cliente")} id="campo-cliente">
              <input id="campo-cliente" type="text" name="cliente" defaultValue={compra?.cliente ?? ""} className={fieldClass} />
            </Campo>
            <Campo etiqueta={conEmoji("tienda", "Tienda")} id="campo-tienda">
              <input id="campo-tienda" type="text" name="tienda" defaultValue={compra?.tienda ?? ""} placeholder="Ej: EcomFive Dropi Panamá" className={fieldClass} />
            </Campo>
          </div>
        </Seccion>

        <Seccion icono={GastoIcon} titulo="Cantidad y pagos">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta={conEmoji("qtyTotal", "QTY Total")} id="campo-qty">
              <input id="campo-qty" type="number" step="1" min="0" name="qty_total" defaultValue={compra?.qtyTotal ?? ""} className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta={conEmoji("montoTotal", "Monto Total")} id="campo-monto-total">
              <input id="campo-monto-total" type="number" step="0.01" min="0" name="monto_total" defaultValue={compra?.montoTotal ?? ""} className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta={conEmoji("primerPago", "Primer Pago")} id="campo-primer-pago">
              <input id="campo-primer-pago" type="number" step="0.01" min="0" name="primer_pago" defaultValue={compra?.primerPago ?? ""} className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta={conEmoji("segundoPago", "Segundo Pago")} id="campo-segundo-pago">
              <input id="campo-segundo-pago" type="number" step="0.01" min="0" name="segundo_pago" defaultValue={compra?.segundoPago ?? ""} className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta={conEmoji("pagadoAProveedor", "Pagado a Proveedor")} id="campo-pagado-proveedor">
              <input id="campo-pagado-proveedor" type="number" step="0.01" min="0" name="pagado_a_proveedor" defaultValue={compra?.pagadoAProveedor ?? ""} className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta={conEmoji("pagoPendiente", "Pago Pendiente")} id="campo-pago-pendiente">
              <input id="campo-pago-pendiente" type="number" step="0.01" min="0" name="pago_pendiente" defaultValue={compra?.pagoPendiente ?? ""} className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta={conEmoji("cobradoCliente", "Cobrado Cliente")} id="campo-cobrado-cliente">
              <input id="campo-cobrado-cliente" type="number" step="0.01" min="0" name="cobrado_cliente" defaultValue={compra?.cobradoCliente ?? ""} className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta={conEmoji("pendienteCliente", "Pendiente Cliente")} id="campo-pendiente-cliente">
              <input id="campo-pendiente-cliente" type="number" step="0.01" min="0" name="pendiente_cliente" defaultValue={compra?.pendienteCliente ?? ""} className={`${fieldClass} tabular-nums`} />
            </Campo>
            <Campo etiqueta={conEmoji("pagoCliente", "Pago Cliente")} id="campo-pago-cliente">
              <input id="campo-pago-cliente" type="text" name="pago_cliente" defaultValue={compra?.pagoCliente ?? ""} className={fieldClass} />
            </Campo>
            <Campo etiqueta={conEmoji("cuentaReceptora", "Cuenta receptora")} id="campo-cuenta-receptora">
              <input id="campo-cuenta-receptora" type="text" name="cuenta_receptora" defaultValue={compra?.cuentaReceptora ?? ""} className={fieldClass} />
            </Campo>
          </div>
          <div className="flex flex-wrap gap-4 pt-1">
            <Casilla id="factura" texto={conEmoji("factura", "Factura")} defaultChecked={compra?.factura} />
            <Casilla id="financiamiento" texto={conEmoji("financiamiento", "Financiamiento")} defaultChecked={compra?.financiamiento} />
          </div>
        </Seccion>

        <Seccion icono={CalendarioIcon} titulo="Fechas">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta={conEmoji("fechaLimite", "Fecha límite")} id="campo-fecha-limite">
              <input id="campo-fecha-limite" type="date" name="fecha_limite" defaultValue={compra?.fechaLimite ?? ""} className={fieldClass} />
            </Campo>
            <Campo etiqueta={conEmoji("fechaLlegada", "Fecha de llegada")} id="campo-fecha-llegada">
              <input id="campo-fecha-llegada" type="date" name="fecha_llegada" defaultValue={compra?.fechaLlegada ?? ""} className={fieldClass} />
            </Campo>
            <Campo etiqueta={conEmoji("fechaPago1", "Fecha de Pago (1)")} id="campo-fecha-pago-1">
              <input id="campo-fecha-pago-1" type="date" name="fecha_pago_1" defaultValue={compra?.fechaPago1 ?? ""} className={fieldClass} />
            </Campo>
            <Campo etiqueta={conEmoji("fechaPago2", "Fecha de Pago (2)")} id="campo-fecha-pago-2">
              <input id="campo-fecha-pago-2" type="date" name="fecha_pago_2" defaultValue={compra?.fechaPago2 ?? ""} className={fieldClass} />
            </Campo>
            <Campo etiqueta={conEmoji("fechaEnvio", "Fecha de Envío")} id="campo-fecha-envio">
              <input id="campo-fecha-envio" type="date" name="fecha_envio" defaultValue={compra?.fechaEnvio ?? ""} className={fieldClass} />
            </Campo>
          </div>
        </Seccion>

        <Seccion icono={EstadoIcon} titulo="Seguimiento">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta={conEmoji("trackId", "Track ID")} id="campo-track-id">
              <input id="campo-track-id" type="text" name="track_id" defaultValue={compra?.trackId ?? ""} className={fieldClass} />
            </Campo>
            <Campo etiqueta={conEmoji("orden", "Orden")} id="campo-orden">
              <input id="campo-orden" type="text" name="orden" defaultValue={compra?.orden ?? ""} className={fieldClass} />
            </Campo>
            <Campo etiqueta="Producto relacionado" id="campo-producto-relacionado">
              <input id="campo-producto-relacionado" type="text" name="producto_relacionado" defaultValue={compra?.productoRelacionado ?? ""} className={fieldClass} />
            </Campo>
            <Campo etiqueta={conEmoji("documentos", "Documentos")} id="campo-documentos">
              <input id="campo-documentos" type="url" name="documentos" defaultValue={compra?.documentos ?? ""} placeholder="Enlace a la factura o soporte" className={fieldClass} />
            </Campo>
          </div>
          <Campo etiqueta={conEmoji("inconveniente", "Inconveniente")} id="campo-inconveniente">
            <input id="campo-inconveniente" type="text" name="inconveniente" defaultValue={compra?.inconveniente ?? ""} className={fieldClass} />
          </Campo>
          <Campo etiqueta={conEmoji("planificacion", "Planificación")} id="campo-planificacion">
            <input id="campo-planificacion" type="text" name="planificacion" defaultValue={compra?.planificacion ?? ""} className={fieldClass} />
          </Campo>
          <Campo etiqueta={conEmoji("notas", "Notas")} id="campo-notas">
            <textarea id="campo-notas" name="notas" defaultValue={compra?.notas ?? ""} rows={3} className={fieldClass} />
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
            etiqueta={editando ? "Guardar cambios" : "Crear compra"}
            etiquetaEnviando="Guardando..."
            alPulsarSinCompletar={señalarFaltante}
          />
        </div>
      )}
    </form>
  );
}
