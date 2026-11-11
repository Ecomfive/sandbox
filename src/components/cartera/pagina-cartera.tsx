// Página de una cartera (Server Component): comprueba el permiso, carga los documentos y arma los indicadores. La usan
// /cuentas-por-cobrar y /cuentas-por-pagar.

import { EncabezadoAF4 } from "@/components/af4/encabezado-af4";
import { EstadoVacioAF4 } from "@/components/af4/estado-af4";
import { Pagina } from "@/components/ui/pagina";
import { hoyPanama, inicioDeMes } from "@/lib/af4/fecha";
import { requireModulo } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarCartera } from "@/lib/finanzas/cargar-cartera";
import { MODULO_DE_CLASE, resumirCartera, type Clase } from "@/lib/finanzas/cxc-cxp";
import { VistaCartera } from "./vista-cartera";

export async function PaginaCartera({ clase }: { clase: Clase }) {
  const modulo = MODULO_DE_CLASE[clase];
  const usuario = await requireModulo(modulo);
  const titulo = clase === "cobrar" ? "Cuentas por cobrar" : "Cuentas por pagar";
  const hoy = hoyPanama();
  const datos = await cargarCartera(createServiceClient(), clase, hoy);
  if ("error" in datos) {
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoAF4 titulo={titulo} imprimir={false} />
        <EstadoVacioAF4 titulo={`No se pudieron leer las ${titulo.toLowerCase()}`}>{datos.error}</EstadoVacioAF4>
      </Pagina>
    );
  }
  const resumen = resumirCartera(
    datos.filas.map((f) => ({ contraparte: f.contraparte, monto: f.monto, fecha: f.fecha, vencimiento: f.vencimiento, estado_manual: f.estadoManual, abonos: f.abonos })),
    hoy,
  );
  // La antigüedad se calcula a hoy: los datos llegan hasta el último documento cargado.
  const ultimo = datos.filas.reduce<string | null>((a, f) => (f.fecha && (!a || f.fecha > a) ? f.fecha : a), null);
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoAF4 titulo={titulo} datosHasta={ultimo ? inicioDeMes(ultimo) : null} />
      <VistaCartera
        clase={clase}
        filas={datos.filas}
        resumen={resumen}
        unidades={datos.unidades}
        cuentas={datos.cuentas}
        contrapartes={datos.contrapartes}
        puedeEscribir={!usuario.modulosSoloLectura.includes(modulo)}
      />
    </Pagina>
  );
}
