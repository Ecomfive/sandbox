"use client";

import { useRef, useState, type ReactNode } from "react";
import { etiquetaComision, etiquetaTipoCuenta, type FilaCuenta } from "./def-cuentas";
import { EliminarCuentaBoton } from "./eliminar-cuenta-boton";
import { FormularioCuenta } from "./formulario-cuenta";
import { Badge } from "@/components/ui/badge";
import { anilloFoco } from "@/components/ui/field";
import { Seccion } from "@/components/ui/seccion-ficha";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { ExtractoIcon, FlechaAbajoIcon, FlechaArribaIcon, GastoIcon, WalletIcon } from "@/lib/nav-icons";
import { datosBinanceDeLaBase } from "@/lib/retiros/datos-binance";

function Dato({ etiqueta, children, ancho }: { etiqueta: string; children: ReactNode; ancho?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${ancho ? "sm:col-span-2" : ""}`}>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

const SIN_DATO = <span className="text-muted-foreground">—</span>;

/** Botón de la cabecera para pasar a la cuenta anterior o siguiente. Sin adonde ir (o mientras guarda) queda apagado
 * con `aria-disabled` y no con `disabled`, para no soltar el foco en medio de la navegación con teclado. */
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

/** Lo primero de la ficha, sobre los botones: el país con la comisión. */
function EncabezadoFicha({ cuenta, paisNombre }: { cuenta: FilaCuenta; paisNombre: string }) {
  return (
    <p className="px-5 pt-5 pb-4 text-sm text-muted-foreground">
      {paisNombre} ·{" "}
      {cuenta.comision_tipo
        ? `Comisión sugerida ${etiquetaComision(cuenta.comision_tipo, cuenta.comision_porcentaje, cuenta.comision_monto_fijo)}`
        : "Sin comisión sugerida"}
    </p>
  );
}

/** Los datos de la cuenta solo para leer: lo que ve quien no tiene permiso de escritura en Retiros. */
function DatosDeLaCuenta({ cuenta }: { cuenta: FilaCuenta }) {
  const datosBinance = datosBinanceDeLaBase(cuenta.datos_binance);
  return (
    <div className="flex flex-col divide-y divide-border border-t border-border p-5">
      <Seccion icono={WalletIcon} titulo="Cuenta">
        <dl className="flex flex-col gap-3">
          <Dato etiqueta="Nombre">{cuenta.nombre}</Dato>
          <Dato etiqueta="Tipo">{etiquetaTipoCuenta(cuenta.tipo)}</Dato>
          {cuenta.tipo !== "binance" && <Dato etiqueta="Cuenta">{cuenta.detalle || SIN_DATO}</Dato>}
        </dl>
      </Seccion>

      {cuenta.tipo === "binance" && (
        <Seccion icono={ExtractoIcon} titulo="Datos de la cuenta">
          {datosBinance ? (
            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Dato etiqueta="País">{datosBinance.pais || SIN_DATO}</Dato>
              <Dato etiqueta="Banco">{datosBinance.banco || SIN_DATO}</Dato>
              <Dato etiqueta="Tipo de identificación">{datosBinance.tipo_identificacion || SIN_DATO}</Dato>
              <Dato etiqueta="Número de identificación">{datosBinance.numero_identificacion || SIN_DATO}</Dato>
              <Dato etiqueta="Número de cuenta" ancho>
                <span className="font-mono">{datosBinance.numero_cuenta || SIN_DATO}</span>
              </Dato>
            </dl>
          ) : (
            <dl>
              <Dato etiqueta="Número de cuenta">
                <span className="font-mono">{cuenta.detalle || SIN_DATO}</span>
              </Dato>
            </dl>
          )}
        </Seccion>
      )}

      <Seccion icono={GastoIcon} titulo="Comisión sugerida">
        <dl className="flex flex-col gap-3">
          <Dato etiqueta="Comisión">
            {cuenta.comision_tipo
              ? etiquetaComision(cuenta.comision_tipo, cuenta.comision_porcentaje, cuenta.comision_monto_fijo)
              : "Sin comisión"}
          </Dato>
        </dl>
      </Seccion>
    </div>
  );
}

/**
 * Ficha de una cuenta destino: el panel a la derecha que se abre al pulsar su fila, con la estructura de la ficha de un
 * pedido: cabecera con el título, sus insignias, las flechas para pasar a la cuenta de arriba o de abajo (en el orden en
 * que se ven en la tabla) y cerrar; el país y la comisión; una fila de botones; y los datos en bloques con ícono.
 *
 * Con permiso de escritura la ficha **ya es el formulario** (no hay un botón «Modificar»), y **no tiene botones abajo**:
 * la fila de botones tiene «Eliminar» y, cuando se cambia un campo, aparecen ahí mismo «Guardar cambios» y «Cancelar»
 * (que descarta lo escrito). Guardar no cierra la ficha: los botones vuelven a ser solo «Eliminar» y sale un aviso. Con
 * cambios sin guardar, cerrar o pasar a otra cuenta pide confirmación. Sin permiso de escritura solo se leen los datos.
 * Lo que muestra sale de la fila ya cargada, así que se actualiza sola al guardar o al eliminarla (que la desactiva, no
 * la borra): la ficha queda abierta con su nuevo estado, aunque la fila haya salido de la tabla de abajo por el filtro
 * de «Eliminadas».
 */
export function FichaCuenta({
  cuenta,
  orden,
  paisId,
  paisNombre,
  puedeEscribir,
  alIr,
  alCerrar,
}: {
  /** La cuenta que se ve; sin ella (no abierta, o ya no está en la lista) el panel está cerrado. */
  cuenta: FilaCuenta | undefined;
  /** Las claves de las cuentas en el orden de la tabla. */
  orden: string[];
  paisId: string;
  paisNombre: string;
  puedeEscribir: boolean;
  alIr: (id: string) => void;
  alCerrar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [guardando, setGuardando] = useState(false);
  // De qué cuenta hay cambios sin guardar (el id, para que no pase a otra cuenta ni sobreviva a una eliminada).
  const [sinGuardarId, setSinGuardarId] = useState<string | null>(null);
  // Sube al cancelar: con otra `key` el formulario se monta de nuevo con los datos de la cuenta y suelta lo escrito.
  const [version, setVersion] = useState(0);
  const raiz = useRef<HTMLDivElement>(null);
  const sinGuardar = !!cuenta && sinGuardarId === cuenta.id;

  /** Pide confirmación si se van a perder cambios; devuelve si se puede seguir. */
  function puedeDescartar() {
    return !sinGuardar || confirm("Hay cambios sin guardar. ¿Descartarlos?");
  }

  /** El botón que se pulsó desaparece (Guardar y Cancelar solo existen con cambios): el foco vuelve al primer campo. */
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

  const indice = cuenta ? orden.indexOf(cuenta.id) : -1;
  const anterior = indice > 0 ? orden[indice - 1] : null;
  const siguiente = indice >= 0 && indice < orden.length - 1 ? orden[indice + 1] : null;
  const numero = cuenta?.numero != null ? ` #${cuenta.numero}` : "";

  return (
    <Ventana
      abierto={!!cuenta}
      alCerrar={cerrar}
      lado="derecha"
      ancho="lg"
      titulo={
        cuenta && (
          <>
            <span className="text-lg font-semibold">{`Cuenta${numero}`}</span>
            <Badge tone="neutral">{etiquetaTipoCuenta(cuenta.tipo)}</Badge>
            <Badge tone={cuenta.activa ? "success" : "destructive"}>{cuenta.activa ? "Activa" : "Eliminada"}</Badge>
          </>
        )
      }
      navegacion={
        <>
          <BotonNavegar
            texto="Cuenta anterior"
            icono={FlechaArribaIcon}
            activo={!!anterior && !guardando}
            alHacerClic={() => anterior && irA(anterior)}
          />
          <BotonNavegar
            texto="Cuenta siguiente"
            icono={FlechaAbajoIcon}
            activo={!!siguiente && !guardando}
            alHacerClic={() => siguiente && irA(siguiente)}
          />
        </>
      }
    >
      {cuenta && (
        <div ref={raiz} className="flex flex-1 flex-col">
          {puedeEscribir ? (
            // Con `key`, al pasar a otra cuenta (o al cancelar) el formulario arranca con los datos de la cuenta.
            <FormularioCuenta
              key={`${cuenta.id}-${version}`}
              paisId={paisId}
              paisNombre={paisNombre}
              cuenta={cuenta}
              botonesArriba
              encabezado={<EncabezadoFicha cuenta={cuenta} paisNombre={paisNombre} />}
              acciones={<EliminarCuentaBoton id={cuenta.id} nombre={cuenta.nombre} yaEliminada={!cuenta.activa} />}
              alGuardar={alGuardar}
              alCancelar={alCancelar}
              alCambiarGuardando={setGuardando}
              alModificar={() => setSinGuardarId(cuenta.id)}
            />
          ) : (
            <>
              <EncabezadoFicha cuenta={cuenta} paisNombre={paisNombre} />
              <DatosDeLaCuenta cuenta={cuenta} />
            </>
          )}
        </div>
      )}
    </Ventana>
  );
}
