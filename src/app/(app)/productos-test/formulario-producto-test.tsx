"use client";

import { CampoSkuMaestro, type OpcionSkuMaestro } from "@/components/ui/selector-sku-maestro";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { actualizarProductoTest, crearProductoTest, opcionesSeleccionParaTest } from "./actions";
import {
  ESTADOS,
  TEST_NUMEROS,
  type FilaProductoTest,
} from "./def-productos-test";
import {
  claseMetrica,
  nivelCpa,
  nivelCpm,
  nivelCtr,
  nivelCvr,
  nivelEfectividad,
  nivelGasto,
  nivelHookRate,
  type NivelMetrica,
} from "@/lib/metricas-meta-ads";
import { BotonAccion } from "@/components/ui/boton-accion";
import { BotonCrear } from "@/components/ui/boton-crear";
import { Campo } from "@/components/ui/campo-ficha";
import { anilloFoco, fieldClass } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useFaltantes } from "@/components/ui/usar-faltantes";
import { CheckIcon, CerrarIcon, EtiquetaIcon, InteligenciaIcon, MasIcon, TestIcon } from "@/lib/nav-icons";

/** Un número de métrica que se colorea en vivo mientras se escribe, con el mismo criterio que Filtros. */
function CampoMetrica({
  id,
  nombreCampo,
  etiqueta,
  defaultValue,
  nivel,
  paso = "0.01",
}: {
  id: string;
  nombreCampo: string;
  etiqueta: string;
  defaultValue: number | null;
  nivel?: (valor: number) => NivelMetrica;
  paso?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  function aplicarColor(texto: string) {
    const el = ref.current;
    if (!el || !nivel) return;
    el.classList.remove("text-success", "text-warning", "text-destructive", "text-foreground");
    const numero = texto === "" ? null : Number(texto);
    el.classList.add(numero === null || Number.isNaN(numero) ? "text-foreground" : claseMetrica(nivel(numero)));
  }

  useEffect(() => {
    aplicarColor(String(defaultValue ?? ""));
    // Solo al montar: el valor inicial ya viene coloreado por defaultValue.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Campo etiqueta={etiqueta} id={id}>
      <input
        ref={ref}
        id={id}
        type="number"
        step={paso}
        min="0"
        name={nombreCampo}
        defaultValue={defaultValue ?? ""}
        onInput={(e) => aplicarColor(e.currentTarget.value)}
        className={`${fieldClass} tabular-nums font-semibold`}
      />
    </Campo>
  );
}

/**
 * El formulario de un producto en test (igual que `FormularioFiltro`). Sin `producto` crea; con `producto`
 * modifica. A diferencia de Filtros, las métricas de Meta Ads sí se editan aquí (no vienen de una
 * importación externa) — se colorean en vivo con el mismo criterio para decidir cuánto pedir.
 */
/**
 * «Viene de Selección»: la fila de Selección de la que sale este test (migración 0110), para que el recorrido del producto quede
 * enlazado aunque el test se cree aquí y no con «Enviar a Test» de Creación de ofertas. Las opciones se piden al abrir el
 * formulario: las filas del país que todavía no tienen test, más la que ya tiene este.
 */
function CampoViene({ paisId, inicial }: { paisId: string; inicial: string | null }) {
  const [opciones, setOpciones] = useState<{ id: string; etiqueta: string }[] | null>(null);
  useEffect(() => {
    let vigente = true;
    opcionesSeleccionParaTest(paisId, inicial)
      .then((r) => vigente && setOpciones("opciones" in r ? r.opciones : []))
      .catch(() => vigente && setOpciones([]));
    return () => {
      vigente = false;
    };
  }, [paisId, inicial]);
  return (
    <Campo etiqueta="Viene de Selección" id="campo-seleccion-test">
      <select id="campo-seleccion-test" name="seleccion_id" defaultValue={inicial ?? ""} key={opciones ? "listo" : "cargando"} disabled={!opciones} className={fieldClass}>
        <option value="">{opciones ? "No viene de Selección" : "Cargando…"}</option>
        {(opciones ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.etiqueta}
          </option>
        ))}
      </select>
    </Campo>
  );
}

export function FormularioProductoTest({
  paisId,
  producto,
  alGuardar,
  alCancelar,
  alCambiarGuardando,
  alModificar,
  botonesArriba,
  encabezado,
  acciones,
  alNuevoProducto,
  productoNuevo,
}: {
  paisId: string;
  producto?: FilaProductoTest;
  alGuardar: () => void;
  alCancelar?: () => void;
  alCambiarGuardando?: (guardando: boolean) => void;
  alModificar?: () => void;
  botonesArriba?: boolean;
  encabezado?: ReactNode;
  acciones?: ReactNode;
  /** Muestra «Nuevo producto» junto al campo «Producto» (abre la ficha de Producto). */
  alNuevoProducto?: () => void;
  /** El producto recién creado con esa ficha: queda elegido y llena el nombre. */
  productoNuevo?: OpcionSkuMaestro | null;
}) {
  const [modificado, setModificado] = useState(false);
  // El producto de Producto que se eligió (el buscador de la orden de compra) y el nombre, que se llena al elegirlo.
  const [skuId, setSkuId] = useState<string | null>(producto?.skuMaestroId ?? null);
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const { formRef, completo, faltante, revisar, señalarFaltante } = useFaltantes();
  const invalido = (id: string) => (faltante === id ? true : undefined);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    alCambiarGuardando?.(pending);
  }, [pending, alCambiarGuardando]);
  const [error, setError] = useState<string | null>(null);
  const editando = !!producto;

  useEffect(() => {
    if (!productoNuevo) return;
    setSkuId(productoNuevo.id);
    setNombre(productoNuevo.nombre);
    setModificado(true);
  }, [productoNuevo]);

  function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const resultado = editando ? await actualizarProductoTest(formData) : await crearProductoTest(formData);
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
      {editando && <input type="hidden" name="id" value={producto.id} />}

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
        <Seccion icono={EtiquetaIcon} titulo="Producto">
          <Campo etiqueta="Producto (de Producto)" id="campo-producto-test">
            <input type="hidden" name="sku_maestro_id" value={skuId ?? ""} />
            <span className="flex items-center gap-2">
              <CampoSkuMaestro
                valor={skuId}
                alCambiar={(sku) => {
                  setSkuId(sku?.id ?? null);
                  if (sku) setNombre(sku.nombre);
                  setModificado(true);
                  alModificar?.();
                }}
                etiquetaAria="Producto de Producto"
                placeholder="Busca por SKU, nombre o N.º"
                claseContenedor="min-w-0 flex-1"
              />
              {alNuevoProducto && (
                <button
                  type="button"
                  onClick={alNuevoProducto}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border-control bg-card px-3 py-2 text-sm font-medium hover:bg-accent ${anilloFoco}`}
                >
                  <MasIcon className="h-4 w-4" />
                  Nuevo producto
                </button>
              )}
            </span>
          </Campo>
          <CampoViene paisId={paisId} inicial={producto?.seleccionId ?? null} />
          <Campo etiqueta="Nombre" id="campo-nombre-test" obligatorio faltante={faltante}>
            <input
              id="campo-nombre-test"
              type="text"
              name="nombre"
              required
              data-enfocar
              aria-invalid={invalido("campo-nombre-test")}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: OreganoOil Aceite de orégano"
              className={fieldClass}
            />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Fecha Creación" id="campo-fecha-creacion">
              <input id="campo-fecha-creacion" type="date" name="fecha_creacion" defaultValue={producto?.fechaCreacion ?? ""} className={fieldClass} />
            </Campo>
            <Campo etiqueta="Fuente" id="campo-fuente">
              <input id="campo-fuente" type="text" name="fuente" defaultValue={producto?.fuente ?? ""} placeholder="Ej: M100001" className={fieldClass} />
            </Campo>
            <Campo etiqueta="Categoría" id="campo-categoria">
              <input id="campo-categoria" type="text" name="categoria" defaultValue={producto?.categoria ?? ""} className={fieldClass} />
            </Campo>
            <Campo etiqueta="Worldwide" id="campo-worldwide">
              <input
                id="campo-worldwide"
                type="text"
                name="worldwide"
                defaultValue={producto?.worldwide ?? ""}
                placeholder="País del anuncio ganador"
                className={fieldClass}
              />
            </Campo>
          </div>
          <Campo etiqueta="Ángulo de Venta" id="campo-angulo-venta">
            <input id="campo-angulo-venta" type="text" name="angulo_venta" defaultValue={producto?.anguloVenta ?? ""} className={fieldClass} />
          </Campo>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="Página de Producto" id="campo-pagina-producto">
              <input
                id="campo-pagina-producto"
                type="url"
                name="pagina_producto_url"
                defaultValue={producto?.paginaProductoUrl ?? ""}
                placeholder="https://..."
                className={fieldClass}
              />
            </Campo>
            <Campo etiqueta="Video (Fuente)" id="campo-video">
              <input id="campo-video" type="url" name="video_url" defaultValue={producto?.videoUrl ?? ""} placeholder="https://..." className={fieldClass} />
            </Campo>
          </div>
        </Seccion>

        <Seccion icono={TestIcon} titulo="Test">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Campo etiqueta="AD Library" id="campo-ad-library">
              <input id="campo-ad-library" type="text" name="ad_library" defaultValue={producto?.adLibrary ?? ""} placeholder="Ej: Minea" className={fieldClass} />
            </Campo>
            <Campo etiqueta="Fecha Test" id="campo-fecha-test">
              <input id="campo-fecha-test" type="date" name="fecha_test" defaultValue={producto?.fechaTest ?? ""} className={fieldClass} />
            </Campo>
            <Campo etiqueta="Estado" id="campo-estado">
              <select id="campo-estado" name="estado" defaultValue={producto?.estado ?? "pendiente"} className={fieldClass}>
                {ESTADOS.map((e) => (
                  <option key={e.valor} value={e.valor}>
                    {e.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Test #" id="campo-test-numero">
              <select id="campo-test-numero" name="test_numero" defaultValue={producto?.testNumero ?? ""} className={fieldClass}>
                <option value="">Sin test</option>
                {TEST_NUMEROS.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.etiqueta}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo etiqueta="Calculadora" id="campo-calculadora">
              <input id="campo-calculadora" type="url" name="calculadora_url" defaultValue={producto?.calculadoraUrl ?? ""} placeholder="https://..." className={fieldClass} />
            </Campo>
            <Campo etiqueta="Campaña" id="campo-campana">
              <input id="campo-campana" type="url" name="campana_url" defaultValue={producto?.campanaUrl ?? ""} placeholder="https://..." className={fieldClass} />
            </Campo>
          </div>
          <label htmlFor="clickup" className="flex cursor-pointer items-center gap-2 text-sm">
            <input id="clickup" type="checkbox" name="clickup" defaultChecked={producto?.clickup} className="h-4 w-4 accent-[var(--foreground)]" />
            <span>Ya tiene tarea en ClickUp</span>
          </label>
        </Seccion>

        <Seccion icono={InteligenciaIcon} titulo="Métricas de Meta Ads">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <CampoMetrica id="campo-metrica-oferta" nombreCampo="metrica_oferta" etiqueta="Oferta ($)" defaultValue={producto?.metricaOferta ?? null} />
            <CampoMetrica id="campo-metrica-cpm" nombreCampo="metrica_cpm" etiqueta="CPM ($)" defaultValue={producto?.metricaCpm ?? null} nivel={nivelCpm} />
            <CampoMetrica
              id="campo-metrica-efectividad"
              nombreCampo="metrica_efectividad"
              etiqueta="% Efectividad"
              defaultValue={producto?.metricaEfectividad ?? null}
              nivel={nivelEfectividad}
            />
            <CampoMetrica
              id="campo-metrica-hook-rate"
              nombreCampo="metrica_hook_rate"
              etiqueta="Hook Rate (%)"
              defaultValue={producto?.metricaHookRate ?? null}
              nivel={nivelHookRate}
            />
            <CampoMetrica id="campo-metrica-ctr" nombreCampo="metrica_ctr" etiqueta="CTR (%)" defaultValue={producto?.metricaCtr ?? null} nivel={nivelCtr} />
            <CampoMetrica id="campo-metrica-cpa" nombreCampo="metrica_cpa" etiqueta="CPA ($)" defaultValue={producto?.metricaCpa ?? null} nivel={nivelCpa} />
            <CampoMetrica id="campo-metrica-gasto" nombreCampo="metrica_gasto" etiqueta="Gasto ($)" defaultValue={producto?.metricaGasto ?? null} nivel={nivelGasto} />
            <CampoMetrica
              id="campo-metrica-compras"
              nombreCampo="metrica_compras"
              etiqueta="Compras"
              defaultValue={producto?.metricaCompras ?? null}
              paso="1"
            />
            <CampoMetrica id="campo-metrica-cvr" nombreCampo="metrica_cvr" etiqueta="CVR (%)" defaultValue={producto?.metricaCvr ?? null} nivel={nivelCvr} />
          </div>
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
