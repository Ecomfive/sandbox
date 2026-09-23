"use client";

import { useRef, useState, type ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { formatearFecha, formatearMoneda } from "@/lib/formato";
import { CalendarioIcon, ComprasIcon, EstadoIcon, FlechaAbajoIcon, FlechaArribaIcon, GastoIcon } from "@/lib/nav-icons";
import { etiquetaEstado, etiquetaEtapa, tonoEstado, valorUnitario, type FilaCompra } from "./def-compras";
import { EliminarCompraBoton } from "./eliminar-compra-boton";
import { FormularioCompra } from "./formulario-compra";

function Dato({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

const SIN_DATO = <span className="text-muted-foreground">—</span>;

function BotonNavegar({ texto, icono: Icono, activo, alHacerClic }: {
  texto: string;
  icono: typeof FlechaArribaIcon;
  activo: boolean;
  alHacerClic: () => void;
}) {
  return (
    <Tooltip texto={texto}>
      <button
        type="button"
        aria-label={texto}
        aria-disabled={!activo}
        onClick={() => activo && alHacerClic()}
        className={`flex h-9 w-9 items-center justify-center border border-border bg-card text-foreground ${anilloFoco} !rounded-md ${
          activo ? "hover:bg-muted" : "cursor-default opacity-40"
        }`}
      >
        <Icono className="h-4 w-4" />
      </button>
    </Tooltip>
  );
}

/** Los datos de una compra solo para leer: lo que ve quien no tiene permiso de escritura en Compras. */
function DatosDeLaCompra({ compra, codigoPais }: { compra: FilaCompra; codigoPais: string }) {
  const dinero = (valor: number | null) => (valor !== null ? formatearMoneda(valor, codigoPais) : SIN_DATO);
  const fecha = (valor: string | null) => (valor ? formatearFecha(valor) : SIN_DATO);
  return (
    <div className="flex flex-col divide-y divide-border border-t border-border p-5">
      <Seccion icono={ComprasIcon} titulo="Compra">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato etiqueta="Estado">
            <Badge tone={tonoEstado(compra.estado)}>{etiquetaEstado(compra.estado)}</Badge>
          </Dato>
          <Dato etiqueta="Proveedor">{compra.proveedor || SIN_DATO}</Dato>
          <Dato etiqueta="Cliente">{compra.cliente || SIN_DATO}</Dato>
          <Dato etiqueta="Tienda">{compra.tienda || SIN_DATO}</Dato>
          <Dato etiqueta="Persona asignada">{compra.asignadoNombre || SIN_DATO}</Dato>
        </dl>
      </Seccion>
      <Seccion icono={GastoIcon} titulo="Cantidad y pagos">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato etiqueta="QTY Total">{compra.qtyTotal ?? SIN_DATO}</Dato>
          <Dato etiqueta="Monto Total">{dinero(compra.montoTotal)}</Dato>
          <Dato etiqueta="Valor Unitario">{dinero(valorUnitario(compra))}</Dato>
          <Dato etiqueta="Primer Pago">{dinero(compra.primerPago)}</Dato>
          <Dato etiqueta="Segundo Pago">{dinero(compra.segundoPago)}</Dato>
          <Dato etiqueta="Pagado a Proveedor">{dinero(compra.pagadoAProveedor)}</Dato>
          <Dato etiqueta="Pago Pendiente">{dinero(compra.pagoPendiente)}</Dato>
          <Dato etiqueta="Cobrado Cliente">{dinero(compra.cobradoCliente)}</Dato>
          <Dato etiqueta="Pendiente Cliente">{dinero(compra.pendienteCliente)}</Dato>
          <Dato etiqueta="Pago Cliente">{compra.pagoCliente || SIN_DATO}</Dato>
          <Dato etiqueta="Cuenta receptora">{compra.cuentaReceptora || SIN_DATO}</Dato>
          <Dato etiqueta="Factura">{compra.factura ? "Sí" : "No"}</Dato>
          <Dato etiqueta="Financiamiento">{compra.financiamiento ? "Sí" : "No"}</Dato>
        </dl>
      </Seccion>
      <Seccion icono={CalendarioIcon} titulo="Fechas">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato etiqueta="Fecha límite">{fecha(compra.fechaLimite)}</Dato>
          <Dato etiqueta="Fecha de llegada">{fecha(compra.fechaLlegada)}</Dato>
          <Dato etiqueta="Fecha de Pago (1)">{fecha(compra.fechaPago1)}</Dato>
          <Dato etiqueta="Fecha de Pago (2)">{fecha(compra.fechaPago2)}</Dato>
          <Dato etiqueta="Fecha de Envío">{fecha(compra.fechaEnvio)}</Dato>
        </dl>
      </Seccion>
      <Seccion icono={EstadoIcon} titulo="Seguimiento">
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Dato etiqueta="Track ID">{compra.trackId || SIN_DATO}</Dato>
          <Dato etiqueta="Orden">{compra.orden || SIN_DATO}</Dato>
          <Dato etiqueta="Producto relacionado">{compra.productoRelacionado || SIN_DATO}</Dato>
          <Dato etiqueta="Revisado AA">{compra.revisadoAA ? "Sí" : "No"}</Dato>
        </dl>
        <dl className="flex flex-col gap-3">
          <Dato etiqueta="Inconveniente">{compra.inconveniente || SIN_DATO}</Dato>
          <Dato etiqueta="Planificación">{compra.planificacion || SIN_DATO}</Dato>
          <Dato etiqueta="Notas">{compra.notas || SIN_DATO}</Dato>
          <Dato etiqueta="Documentos">
            {compra.documentos ? (
              <a href={compra.documentos} target="_blank" rel="noreferrer" className="text-foreground underline underline-offset-2">
                Ver documento
              </a>
            ) : (
              SIN_DATO
            )}
          </Dato>
        </dl>
      </Seccion>
    </div>
  );
}

/**
 * Ficha de una compra: el panel a la derecha que se abre al pulsar su fila (igual que `FichaCuenta`), con
 * flechas para pasar a la compra de arriba o de abajo en el orden de la tabla. Con permiso de escritura la
 * ficha ya es el formulario: «Guardar cambios» y «Cancelar» aparecen junto a la cabecera solo con cambios sin
 * guardar, y «Eliminar» siempre. Sin permiso, solo se leen los datos.
 */
export function FichaCompra({
  compra,
  orden,
  paisId,
  codigoPais,
  puedeEscribir,
  alIr,
  alCerrar,
}: {
  /** La compra que se ve; sin ella el panel está cerrado. */
  compra: FilaCompra | undefined;
  /** Las claves de las compras en el orden de la tabla. */
  orden: string[];
  paisId: string;
  codigoPais: string;
  puedeEscribir: boolean;
  alIr: (id: string) => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [guardando, setGuardando] = useState(false);
  const [sinGuardarId, setSinGuardarId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const sinGuardar = !!compra && sinGuardarId === compra.id;

  function puedeDescartar() {
    return !sinGuardar || confirm("Hay cambios sin guardar. ¿Descartarlos?");
  }

  function enfocarPrimerCampo() {
    requestAnimationFrame(() => raiz.current?.querySelector<HTMLElement>("[data-enfocar]")?.focus());
  }

  function cerrar() {
    if (guardando || !puedeDescartar()) return;
    setSinGuardarId(null);
    alCerrar();
  }

  function irA(id: string) {
    if (guardando || !puedeDescartar()) return;
    setSinGuardarId(null);
    alIr(id);
  }

  function alGuardar() {
    setGuardando(false);
    setSinGuardarId(null);
    mostrarToast("Cambios guardados");
    enfocarPrimerCampo();
  }

  function alCancelar() {
    setSinGuardarId(null);
    setVersion((v) => v + 1);
    enfocarPrimerCampo();
  }

  const indice = compra ? orden.indexOf(compra.id) : -1;
  const anterior = indice > 0 ? orden[indice - 1] : null;
  const siguiente = indice >= 0 && indice < orden.length - 1 ? orden[indice + 1] : null;

  return (
    <Ventana
      abierto={!!compra}
      alCerrar={cerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        compra && (
          <>
            <span className="text-lg font-semibold">{compra.nombre}</span>
            <Badge tone="neutral">{etiquetaEtapa(compra.etapa)}</Badge>
            <Badge tone={tonoEstado(compra.estado)}>{etiquetaEstado(compra.estado)}</Badge>
          </>
        )
      }
      navegacion={
        <>
          <BotonNavegar texto="Compra anterior" icono={FlechaArribaIcon} activo={!!anterior && !guardando} alHacerClic={() => anterior && irA(anterior)} />
          <BotonNavegar texto="Compra siguiente" icono={FlechaAbajoIcon} activo={!!siguiente && !guardando} alHacerClic={() => siguiente && irA(siguiente)} />
        </>
      }
    >
      {compra && (
        <div ref={raiz} className="flex flex-1 flex-col">
          {puedeEscribir ? (
            <FormularioCompra
              key={`${compra.id}-${version}`}
              paisId={paisId}
              compra={compra}
              botonesArriba
              acciones={<EliminarCompraBoton id={compra.id} nombre={compra.nombre} alEliminar={alCerrar} />}
              alGuardar={alGuardar}
              alCancelar={alCancelar}
              alCambiarGuardando={setGuardando}
              alModificar={() => setSinGuardarId(compra.id)}
            />
          ) : (
            <DatosDeLaCompra compra={compra} codigoPais={codigoPais} />
          )}
        </div>
      )}
    </Ventana>
  );
}
