"use client";

import { useState } from "react";
import { Tarjeta, botonNormal, botonPeligro, botonPrincipal, fecha } from "@/components/proveedor/piezas-proveedor";
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

/**
 * «Cuenta de Chin» (solo administradores): la cuenta con la que el proveedor entra a su portal. Entra por la misma página de inicio de
 * sesión del sistema y llega directo a su portal; no ve nada más.
 */
export function CuentaProveedor({ proveedor, cuenta: inicial, entrada }: { proveedor: { id: string; nombre: string }; cuenta: CuentaPortal | null; entrada: string }) {
  const { mostrarToast } = useToast();
  const [cuenta, setCuenta] = useState(inicial);
  const [nombre, setNombre] = useState(proveedor.nombre);
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmarDesactivar, setConfirmarDesactivar] = useState(false);

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      mostrarToast("Copiado");
    } catch {
      mostrarToast("No se pudo copiar: selecciónalo y cópialo a mano.", "destructive");
    }
  }

  if (!cuenta)
    return (
      <Tarjeta titulo={`Cuenta de ${proveedor.nombre}`}>
        <form
          className="flex max-w-xl flex-col gap-3 p-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setOcupado(true);
            const r = await crearCuentaProveedor(proveedor.id, nombre, email);
            setOcupado(false);
            if (r.error || !r.clave) return mostrarToast(r.error ?? "No se pudo crear la cuenta.", "destructive");
            setClave(r.clave);
            setCuenta({ id: "", nombre: nombre.trim(), email: email.trim().toLowerCase(), activo: true, ultimoIngreso: null });
          }}
        >
          <p className="m-0 text-sm text-muted-foreground">{proveedor.nombre} todavía no tiene cuenta para entrar a su portal.</p>
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
      </Tarjeta>
    );

  return (
    <Tarjeta titulo={`Cuenta de ${proveedor.nombre}`}>
      <div className="flex max-w-2xl flex-col gap-4 p-4">
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Nombre</dt>
          <dd className="m-0 font-medium">{cuenta.nombre}</dd>
          <dt className="text-muted-foreground">Correo</dt>
          <dd className="m-0 font-medium">{cuenta.email ?? "—"}</dd>
          <dt className="text-muted-foreground">Estado</dt>
          <dd className="m-0">{cuenta.activo ? <Badge tone="success">Activa</Badge> : <Badge tone="neutral">Desactivada</Badge>}</dd>
          <dt className="text-muted-foreground">Último ingreso</dt>
          <dd className="m-0 font-medium tabular-nums">{cuenta.ultimoIngreso ? fecha(cuenta.ultimoIngreso.slice(0, 10)) : "Todavía no entra"}</dd>
          <dt className="text-muted-foreground">Entra en</dt>
          <dd className="m-0 font-medium break-all">{entrada}</dd>
        </dl>

        {clave && (
          <div role="status" className="flex flex-col gap-2 rounded-lg border border-border bg-muted px-3 py-3 text-sm">
            <span>
              Clave temporal de {cuenta.nombre}: se muestra <b>solo ahora</b>. Pásasela por un medio seguro junto con la dirección de entrada.
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <code className="rounded bg-card px-2 py-1 text-[15px] font-semibold tracking-wide select-all">{clave}</code>
              <button type="button" className={botonNormal} onClick={() => copiar(clave)}>
                Copiar clave
              </button>
            </span>
          </div>
        )}

        {cuenta.id && (
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
                    setCuenta({ ...cuenta, activo: !cuenta.activo });
                    mostrarToast(cuenta.activo ? "Cuenta desactivada: ya no puede entrar." : "Cuenta activada.");
                  }}
                >
                  {cuenta.activo ? `Sí, desactivar` : "Activar cuenta"}
                </button>
              </>
            )}
          </div>
        )}
        {!cuenta.id && <p className="m-0 text-xs text-muted-foreground">Recarga la página para administrar la cuenta.</p>}
      </div>
    </Tarjeta>
  );
}
