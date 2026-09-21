"use client";

import { useState, useTransition, type ReactNode } from "react";
import { alternarActivaCuenta } from "./actions";
import { etiquetaComision, etiquetaTipoCuenta, type FilaCuenta } from "./def-cuentas";
import { EliminarCuentaBoton } from "./eliminar-cuenta-boton";
import { FormularioCuenta, Seccion } from "./formulario-cuenta";
import { Badge } from "@/components/ui/badge";
import { BotonAccion } from "@/components/ui/boton-accion";
import { anilloFoco } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Ventana } from "@/components/ui/ventana";
import { EstadoIcon, ExtractoIcon, FlechaAbajoIcon, FlechaArribaIcon, GastoIcon, WalletIcon } from "@/lib/nav-icons";
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

/** Desactivar o reactivar la cuenta: no borra nada, y es lo que hay que hacer cuando ya tiene retiros y no se puede
 * eliminar. */
function AlternarActivaBoton({ cuenta }: { cuenta: FilaCuenta }) {
  const [pending, startTransition] = useTransition();
  const { mostrarToast } = useToast();

  function alHacerClic() {
    const formData = new FormData();
    formData.set("id", cuenta.id);
    formData.set("activa", String(!cuenta.activa));
    startTransition(async () => {
      try {
        await alternarActivaCuenta(formData);
      } catch {
        mostrarToast("No se pudo cambiar el estado de la cuenta. Inténtalo de nuevo.", "destructive");
      }
    });
  }

  return (
    <BotonAccion icono={EstadoIcon} onClick={alHacerClic} disabled={pending}>
      {cuenta.activa ? "Desactivar" : "Reactivar"}
    </BotonAccion>
  );
}

/** Los datos de la cuenta solo para leer: lo que ve quien no tiene permiso de escritura en Retiros. */
function DatosDeLaCuenta({ cuenta }: { cuenta: FilaCuenta }) {
  const datosBinance = datosBinanceDeLaBase(cuenta.datos_binance);
  return (
    <div className="flex flex-col divide-y divide-border p-5">
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
 * Ficha de una cuenta destino: el panel a la derecha que se abre al pulsar su fila. Arriba, el título con su número y
 * estado, las flechas para pasar a la cuenta de arriba o de abajo (en el orden en que se ven en la tabla) y cerrar.
 * Con permiso de escritura la ficha **ya es el formulario**: no hay un botón «Modificar»; se cambian los campos, se
 * pulsa «Guardar cambios» (que cierra la ficha) y las acciones Desactivar y Eliminar están arriba de los campos. Si hay
 * cambios sin guardar, cerrar o pasar a otra cuenta pide confirmación. Sin permiso de escritura solo se leen los datos.
 * Lo que muestra sale de la fila ya cargada, así que se actualiza sola, y si la cuenta se elimina deja de existir y el
 * panel se cierra.
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
  /** La cuenta que se ve; sin ella (no abierta, o ya eliminada) el panel está cerrado. */
  cuenta: FilaCuenta | undefined;
  /** Las claves de las cuentas en el orden de la tabla. */
  orden: string[];
  paisId: string;
  paisNombre: string;
  puedeEscribir: boolean;
  alIr: (id: string) => void;
  alCerrar: () => void;
}) {
  const [guardando, setGuardando] = useState(false);
  // De qué cuenta hay cambios sin guardar (el id, para que no pase a otra cuenta ni sobreviva a una eliminada).
  const [sinGuardarId, setSinGuardarId] = useState<string | null>(null);
  const sinGuardar = !!cuenta && sinGuardarId === cuenta.id;

  /** Pide confirmación si se van a perder cambios; devuelve si se puede seguir. */
  function puedeDescartar() {
    return !sinGuardar || confirm("Hay cambios sin guardar. ¿Descartarlos?");
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
    setGuardando(false); // el formulario se desmonta: ya no avisará que terminó
    setSinGuardarId(null);
    alCerrar();
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
            <Badge tone={cuenta.activa ? "success" : "neutral"}>{cuenta.activa ? "Activa" : "Inactiva"}</Badge>
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
      {cuenta &&
        (puedeEscribir ? (
          <div className="flex flex-1 flex-col">
            <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2 border-b border-border p-5">
              <AlternarActivaBoton cuenta={cuenta} />
              <EliminarCuentaBoton id={cuenta.id} nombre={cuenta.nombre} />
            </div>
            {/* Con `key`, al pasar a otra cuenta el formulario arranca con los datos de esa cuenta. */}
            <FormularioCuenta
              key={cuenta.id}
              paisId={paisId}
              paisNombre={paisNombre}
              cuenta={cuenta}
              alGuardar={alGuardar}
              alCancelar={cerrar}
              alCambiarGuardando={setGuardando}
              alModificar={() => setSinGuardarId(cuenta.id)}
            />
          </div>
        ) : (
          <DatosDeLaCuenta cuenta={cuenta} />
        ))}
    </Ventana>
  );
}
