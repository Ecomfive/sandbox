import { notFound } from "next/navigation";
import { CuentasRepartidores } from "@/components/despacho/cuentas-repartidores";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { ETIQUETAS } from "@/lib/despacho/etiquetas";
import { esAdministrador } from "@/lib/permisos/acceso";
import { createServiceClient } from "@/lib/supabase/server";
import { urlDelSistema } from "@/lib/tienda/conectar-shopify";
import type { CuentaRepartidorFila } from "../repartidores-actions";

export const metadata = { title: "Cuentas de repartidores" };
export const dynamic = "force-dynamic";

/** Despacho ciudad › Cuentas de repartidores (24 nov 2026, migración 0362): solo administradores. */
export default async function CuentasRepartidoresPage() {
  const usuario = await requireModulo("despacho-ciudad");
  if (!esAdministrador(usuario)) notFound();
  const { data, error } = await createServiceClient().from("despacho_repartidores").select("id, courier, nombre, email, activo, ultimo_ingreso_en").order("nombre");
  const cuentas: CuentaRepartidorFila[] = (data ?? []).map((c) => ({
    id: c.id as string,
    courier: c.courier as string,
    nombre: c.nombre as string,
    email: c.email as string,
    activo: c.activo === true,
    ultimoIngreso: (c.ultimo_ingreso_en as string | null) ?? null,
  }));
  const entrada = `${urlDelSistema() ?? ""}/login`;
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-4">
      <EncabezadoPagina titulo="Cuentas de repartidores">
        Una cuenta por delivery para entrar a su panel desde el celular: ve solo su ruta del día y lo que marca (entregado, pospuesto o fallido, con el cobro y
        las fotos) aparece al instante en Despacho ciudad. Entran por la misma página de inicio de sesión y llegan directo a su panel.
      </EncabezadoPagina>
      {error ? (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase la migración 0362 (panel del repartidor).
        </p>
      ) : (
        <CuentasRepartidores cuentas={cuentas} repartidores={ETIQUETAS.courier.opciones.map((o) => o.nombre)} entrada={entrada} />
      )}
    </Pagina>
  );
}
