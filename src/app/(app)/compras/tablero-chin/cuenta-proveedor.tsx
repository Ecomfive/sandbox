"use client";

import { useState } from "react";
import { botonNormal, botonPeligro, botonPrincipal, fecha } from "@/components/proveedor/piezas-proveedor";
import { Badge } from "@/components/ui/badge";
import { fieldClass, labelClass } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cambiarCuentaProveedorActiva, crearCuentaProveedor, nuevaClaveProveedor } from "./cuenta-actions";

export interface CuentaPortal {
  id: string;
  nombre: string;
  email: string | null;
  activo: boolean;
  ultimoIngreso: string | null;
}

/** La clave temporal recién generada: se muestra una sola vez, junto con la dirección de entrada. */
function ClaveTemporal({ nombre, clave, entrada }: { nombre: string; clave: string; entrada: string }) {
  const { mostrarToast } = useToast();
  async function copiar() {
    try {
      await navigator.clipboard.writeText(clave);
      mostrarToast("Copiado");
    } catch {
      mostrarToast("No se pudo copiar: selecciónalo y cópialo a mano.", "destructive");
    }
  }
  return (
    <div role="status" className="flex flex-col gap-2 rounded-lg border border-border bg-muted px-3 py-3 text-sm">
      <span>
        Clave temporal de {nombre}: se muestra <b>solo ahora</b>. Pásasela por un medio seguro junto con la dirección de entrada.
      </span>
      <span className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-card px-2 py-1 text-[15px] font-semibold tracking-wide select-all">{clave}</code>
        <button type="button" className={botonNormal} onClick={copiar}>
          Copiar clave
        </button>
      </span>
      <span className="text-muted-foreground">
        Entra en <b className="break-all text-foreground">{entrada}</b>
      </span>
    </div>
  );
}

/**
 * «Crear cuenta» (solo administradores): una cuenta nueva para entrar al portal del proveedor, con su nombre y su correo. Entra por la
 * misma página de inicio de sesión del sistema y llega directo a su portal; no ve nada más.
 */
export function CrearCuentaProveedor({
  proveedor,
  entrada,
  alCrear,
  alTerminar,
}: {
  proveedor: { id: string; nombre: string };
  entrada: string;
  alCrear: (cuenta: CuentaPortal) => void;
  alTerminar: () => void;
}) {
  const { mostrarToast } = useToast();
  const [nombre, setNombre] = useState(proveedor.nombre);
  const [email, setEmail] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [creada, setCreada] = useState<{ nombre: string; clave: string } | null>(null);

  if (creada)
    return (
      <div className="flex flex-col gap-4">
        <p className="m-0 text-sm">
          Listo: <b>{creada.nombre}</b> ya puede entrar al portal de {proveedor.nombre}.
        </p>
        <ClaveTemporal nombre={creada.nombre} clave={creada.clave} entrada={entrada} />
        <div>
          <button type="button" className={botonPrincipal} onClick={alTerminar}>
            Cerrar
          </button>
        </div>
      </div>
    );

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setOcupado(true);
        const r = await crearCuentaProveedor(proveedor.id, nombre, email);
        setOcupado(false);
        if (r.error || !r.clave || !r.cuenta) return mostrarToast(r.error ?? "No se pudo crear la cuenta.", "destructive");
        alCrear(r.cuenta);
        setCreada({ nombre: r.cuenta.nombre, clave: r.clave });
      }}
    >
      <p className="m-0 text-sm text-muted-foreground">
        Entra a su portal con este correo y una clave temporal que verás una sola vez. Puede haber una cuenta por cada persona de {proveedor.nombre}.
      </p>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={80} className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1">
        <span className={labelClass}>Correo con el que entra</span>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="Ej: ventas@proveedor.com" className={fieldClass} />
      </label>
      <div>
        <button type="submit" className={botonPrincipal} disabled={ocupado}>
          {ocupado ? "Creando…" : "Crear cuenta"}
        </button>
      </div>
    </form>
  );
}

/** «Cuenta de Chin» (solo administradores): las cuentas con las que el proveedor entra a su portal; a cada una, clave nueva o desactivarla. */
export function CuentasProveedor({
  proveedor,
  cuentas,
  entrada,
  alCambiar,
}: {
  proveedor: { id: string; nombre: string };
  cuentas: CuentaPortal[];
  entrada: string;
  alCambiar: (cuenta: CuentaPortal) => void;
}) {
  if (!cuentas.length)
    return <p className="m-0 text-sm text-muted-foreground">{proveedor.nombre} todavía no tiene cuenta para entrar a su portal: créala con «Crear cuenta».</p>;
  return (
    <div className="flex flex-col gap-3">
      {cuentas.map((c) => (
        <FichaCuenta key={c.id} cuenta={c} entrada={entrada} alCambiar={alCambiar} />
      ))}
    </div>
  );
}

function FichaCuenta({ cuenta, entrada, alCambiar }: { cuenta: CuentaPortal; entrada: string; alCambiar: (cuenta: CuentaPortal) => void }) {
  const { mostrarToast } = useToast();
  const [clave, setClave] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(false);

  return (
    <section className="flex flex-col gap-4 rounded-[10px] border border-border bg-card p-4">
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt className="text-muted-foreground">Nombre</dt>
        <dd className="m-0 font-medium">{cuenta.nombre}</dd>
        <dt className="text-muted-foreground">Correo</dt>
        <dd className="m-0 font-medium break-all">{cuenta.email ?? "—"}</dd>
        <dt className="text-muted-foreground">Estado</dt>
        <dd className="m-0">{cuenta.activo ? <Badge tone="success">Activa</Badge> : <Badge tone="neutral">Desactivada</Badge>}</dd>
        <dt className="text-muted-foreground">Último ingreso</dt>
        <dd className="m-0 font-medium tabular-nums">{cuenta.ultimoIngreso ? fecha(cuenta.ultimoIngreso.slice(0, 10)) : "Todavía no entra"}</dd>
        <dt className="text-muted-foreground">Entra en</dt>
        <dd className="m-0 font-medium break-all">{entrada}</dd>
      </dl>

      {clave && <ClaveTemporal nombre={cuenta.nombre} clave={clave} entrada={entrada} />}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={botonNormal}
          disabled={ocupado}
          onClick={async () => {
            setOcupado(true);
            const r = await nuevaClaveProveedor(cuenta.id);
            setOcupado(false);
            if (r.error || !r.clave) return mostrarToast(r.error ?? "No se pudo cambiar la clave.", "destructive");
            setClave(r.clave);
          }}
        >
          Generar clave nueva
        </button>
        {cuenta.activo && !confirmarDesactivar && (
          <button type="button" className={botonPeligro} disabled={ocupado} onClick={() => setConfirmarDesactivar(true)}>
            Desactivar cuenta
          </button>
        )}
        {(confirmarDesactivar || !cuenta.activo) && (
          <>
            {confirmarDesactivar && (
              <button type="button" className={botonNormal} disabled={ocupado} onClick={() => setConfirmarDesactivar(false)}>
                No
              </button>
            )}
            <button
              type="button"
              className={cuenta.activo ? botonPeligro : botonPrincipal}
              disabled={ocupado}
              onClick={async () => {
                setOcupado(true);
                const r = await cambiarCuentaProveedorActiva(cuenta.id, !cuenta.activo);
                setOcupado(false);
                setConfirmarDesactivar(false);
                if (r.error) return mostrarToast(r.error, "destructive");
                alCambiar({ ...cuenta, activo: !cuenta.activo });
                mostrarToast(cuenta.activo ? "Cuenta desactivada: ya no puede entrar." : "Cuenta activada.");
              }}
            >
              {cuenta.activo ? "Sí, desactivar" : "Activar cuenta"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
