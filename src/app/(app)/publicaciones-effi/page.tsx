import { AvisoSoloPais } from "@/components/plataformas/aviso-solo-pais";
import { EncabezadoPagina } from "@/components/ui/encabezado-pagina";
import { Pagina } from "@/components/ui/pagina";
import { requireModulo } from "@/lib/auth";
import { llaveEffi } from "@/lib/effi/api";
import { PAIS_DE_EFFI } from "@/lib/effi/sincronizar";
import { formatearFechaHora } from "@/lib/formato";
import { getPaisActual } from "@/lib/pais";
import { esAdministrador } from "@/lib/permisos/acceso";
import { formatoMonto } from "@/lib/publicaciones/moneda";
import { createServiceClient } from "@/lib/supabase/server";
import { BotonActualizarEffi } from "./boton-actualizar-effi";
import { cargarDatosEffi } from "./datos-effi";
import { ListaPublicacionesEffi } from "./lista-publicaciones-effi";
import { TableroEffi } from "./tablero-effi";

export const metadata = { title: "Gestión de IDs Effi" };

export const dynamic = "force-dynamic";

/**
 * Los artículos de la cuenta de Effi, leídos por su API oficial (5 nov 2026): tablero arriba y lista de filas debajo, con las piezas de Gestión de IDs Drop. El
 * sistema solo lee Effi: el stock es el de nuestras bodegas (las de nombre de tienda son de cada dropshipper) y el vínculo con Producto lo confirma una persona.
 */
export default async function PublicacionesEffiPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const usuario = await requireModulo("publicaciones-effi");
  const { abrir } = await searchParams;
  const supabase = createServiceClient();
  const pais = await getPaisActual(supabase);
  if (pais.codigo !== PAIS_DE_EFFI) {
    const permitidos = usuario.paisesPermitidos;
    return (
      <Pagina ancho="ancha" className="flex flex-col gap-6">
        <EncabezadoPagina titulo="Gestión de IDs Effi" oculto />
        <AvisoSoloPais nombre="Effi" paisPermitido={permitidos === null || permitidos.includes(PAIS_DE_EFFI)} />
      </Pagina>
    );
  }
  const datos = await cargarDatosEffi(supabase, pais, usuario);
  const puedeEscribir = !usuario.modulosSoloLectura.includes("publicaciones-effi");
  return (
    <Pagina ancho="ancha" className="flex flex-col gap-6">
      <EncabezadoPagina titulo="Gestión de IDs Effi" oculto />
      {datos.faltaMigracion && (
        <p role="alert" className="m-0 rounded-lg border border-border bg-card px-4 py-3 text-sm text-destructive">
          Falta correr en Supabase la migración 0230 (Gestión de IDs Effi).
        </p>
      )}
      <TableroEffi publicaciones={datos.publicaciones} />
      <div className="-mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 text-xs text-muted-foreground">
          {datos.ultimaLectura ? `Última lectura de Effi: ${formatearFechaHora(datos.ultimaLectura)}. ` : ""}
          {datos.fulfillment === null
            ? "El margen se calcula sin fulfillment: ponlo en Configuración › Plataformas del país, en la fila «EFFI»."
            : `Margen con el costo en Effi y el fulfillment de Effi (${formatoMonto(datos.fulfillment, datos.moneda)}).`}{" "}
          El stock es el de la bodega Principal; las bodegas de los dropshippers no cuentan.
        </p>
        {puedeEscribir && !datos.faltaMigracion && <BotonActualizarEffi hayLlave={llaveEffi() !== null} />}
      </div>
      <ListaPublicacionesEffi
        publicaciones={datos.publicaciones}
        moneda={datos.moneda}
        codigoPais={pais.codigo}
        nombrePais={pais.nombre}
        puedeEscribir={puedeEscribir}
        puedeVerCompras={esAdministrador(usuario)}
        abrirInicial={typeof abrir === "string" ? abrir : null}
        vacio="Todavía no hay artículos de Effi: falta la primera lectura."
      />
    </Pagina>
  );
}
