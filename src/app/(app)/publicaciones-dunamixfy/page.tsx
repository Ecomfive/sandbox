import Link from "next/link";
import { AvisoSoloPais } from "@/components/plataformas/aviso-solo-pais";
import { BarraAplicarPrecios } from "@/components/publicaciones/barra-aplicar-precios";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { puedeActualizarDropi } from "@/lib/dropi-actualizar/partes";
import { PAIS_DE_DUNAMIXFY } from "@/lib/dunamixfy/guardar";
import { formatearFechaHora } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { esAdministrador } from "@/lib/permisos/acceso";
import { formatoMonto } from "@/lib/publicaciones/moneda";
import { createServiceClient } from "@/lib/supabase/server";
import { cargarDatosDunamixfy } from "./datos-dunamixfy";
import { ListaPublicacionesDunamixfy } from "./lista-publicaciones-dunamixfy";
import { TableroDunamixfy } from "./tablero-dunamixfy";

export const metadata = { title: "Gestión de IDs Dunamixfy" };

export const dynamic = "force-dynamic";

/**
 * Los productos de ECOMFIVE en Dunamixfy (dunamixfy.cr, Costa Rica; 9 nov 2026, pedido de Hernán): tablero arriba y lista de filas debajo, con las piezas de Gestión de IDs
 * Effi. Se leen desde la pestaña de Dunamixfy con la cuenta de proveedor («Actualizar datos», lector `dunamixfy_cr`). El sistema solo lee Dunamixfy: lo único que se
 * guarda aquí es el vínculo con Producto, que confirma una persona.
 */
export default async function PublicacionesDunamixfyPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("publicaciones-dunamixfy");
  const { abrir } = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (pais.codigo !== PAIS_DE_DUNAMIXFY) {
    const permitidos = usuario.paisesPermitidos;
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Gestión de IDs Dunamixfy" oculto />
        <AvisoSoloPais plataforma="dunamixfy" paisPermitido={permitidos === null || permitidos.includes(PAIS_DE_DUNAMIXFY)} />
      </Pagina>
    );
  }
  const datos = await cargarDatosDunamixfy(supabase, pais, usuario);
  const puedeEscribir = !usuario.modulosSoloLectura.includes("publicaciones-dunamixfy");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Gestión de IDs Dunamixfy" oculto />
      {datos.faltaMigracion && (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase la migración 0264 (Dunamixfy).
        </p>
      )}
      <TableroDunamixfy publicaciones={datos.publicaciones} />
      {puedeEscribir && <BarraAplicarPrecios plataforma="dunamixfy" pendientes={datos.publicaciones.filter((x) => x.cambioPrecio).length} />}
      <div className="-mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-xs text-muted-foreground">
          {datos.ultimaLectura ? `Última lectura de Dunamixfy: ${formatearFechaHora(datos.ultimaLectura)}. ` : ""}
          {datos.fulfillmentPaga === "dropshipper"
            ? "El fulfillment lo paga el dropshipper: el margen se calcula con el costo de cada producto en Gestión de IDs Dropi, sin fulfillment."
            : datos.fulfillment === null
            ? "El margen se calcula sin fulfillment: ponlo en Configuración › Plataformas del país, en la fila «Dunamixfy»."
            : `Margen con el costo de cada producto en Gestión de IDs Dropi y el fulfillment de Dunamixfy (${formatoMonto(datos.fulfillment, datos.moneda)}).`}{" "}
          El stock es el de nuestra bodega en Dunamixfy.
        </p>
        {puedeActualizarDropi(usuario) && (
          <Link href="/publicaciones-dropi/actualizar" className="text-sm font-medium text-azul hover:underline">
            Actualizar desde Dunamixfy
          </Link>
        )}
      </div>
      <ListaPublicacionesDunamixfy
        publicaciones={datos.publicaciones}
        moneda={datos.moneda}
        codigoPais={pais.codigo}
        nombrePais={pais.nombre}
        puedeEscribir={puedeEscribir}
        puedeVerCompras={esAdministrador(usuario)}
        abrirInicial={typeof abrir === "string" ? abrir : null}
        vacio="Todavía no hay productos de Dunamixfy: falta la primera lectura."
      />
    </Pagina>
  );
}
