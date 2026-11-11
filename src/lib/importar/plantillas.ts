// Plantillas de Excel descargables: las hojas y los títulos exactos que espera cada importador, con una fila de ejemplo
// inventada. Lógica pura (devuelve las hojas como filas); el botón `BotonPlantilla` arma el .xlsx en el navegador.
// La prueba `plantillas.test.ts` comprueba que el «Importar» universal reconozca cada plantilla como su módulo: si un
// importador cambia sus títulos, la prueba avisa.

import type { Celda } from "@/lib/finanzas/libro-excel";
import type { ModuloImportable } from "./reconocer";

export interface HojaPlantilla {
  nombre: string;
  filas: Celda[][];
}

export interface Plantilla {
  /** Clave para el botón y el nombre del archivo. */
  clave: string;
  modulo: ModuloImportable;
  etiqueta: string;
  archivo: string;
  hojas: HojaPlantilla[];
}

const anio = () => String(new Date().getFullYear());

export function plantillas(): Plantilla[] {
  const a = anio();
  return [
    {
      clave: "libro",
      modulo: "libro-movimientos",
      etiqueta: "Libro de movimientos",
      archivo: `PLANTILLA_LIBRO_${a}.xlsx`,
      hojas: [
        {
          nombre: a,
          filas: [
            ["MES", "FECHA INCLUSIÓN", "TIENDA", "TIPO", "ESTATUS DE GESTIÓN", "TIENDA A PAGAR", "DESCRIPCIÓN", "EERR?", "FLUJO ?", "USD", "MONEDA", "PRESTACIÓN DE SERVICIO", "PAGO", "FORMA DE PAGO", "FACTURA NOMBRE/ENLACE", "N° DE FACTURA", "RUC PROVEEDOR", "¿ES BIEN DE USO?"],
            [`1-${a}`, `${a}-01-05`, "TIENDA EJEMPLO", "Packaging", "PAGADO", "", "Cajas de cartón (ejemplo)", "SI", "SI", 120.5, "USD", `${a}-01-05`, `${a}-01-06`, "BANCO EJEMPLO", "", "001-0001", "1000-200-3000 DV 60", "NO"],
          ],
        },
        { nombre: "EERR", filas: [["PERÍODO", `1-${a}`], ["TOTAL ENVÍOS", 0], ["ENTREGADOS", 0]] },
      ],
    },
    {
      clave: "bienes",
      modulo: "bienes-de-uso",
      etiqueta: "Bienes de uso",
      archivo: "PLANTILLA_BIENES_DE_USO.xlsx",
      hojas: [
        {
          nombre: "Bienes de Uso",
          filas: [
            ["Altas Bienes de uso", "Mes de Alta", "Tipo de Bien", "Meses a Amortizar", "Importe"],
            ["Escritorio (ejemplo)", `${a}-01-01`, "Muebles y Utiles", 60, 350],
          ],
        },
      ],
    },
    {
      clave: "cobrar",
      modulo: "cuentas-por-cobrar",
      etiqueta: "Cuentas por cobrar",
      archivo: "PLANTILLA_CUENTAS_POR_COBRAR.xlsx",
      hojas: [
        {
          nombre: "CPC",
          filas: [
            ["CUENTAS POR COBRAR"],
            ["N", "CLIENTE / DEUDOR", "FACT", "FECH. EMI.", "MOTIVO", "MONTO TOTAL", "ABONO 1", "ABONO 2", "ABONO 3", "MÉTODO", "S. PENDIENTE"],
            [1, "Cliente ejemplo", "F-001", `${a}-01-10`, "Venta a crédito", 500, 200, null, null, "Transferencia", 300],
          ],
        },
      ],
    },
    {
      clave: "pagar",
      modulo: "cuentas-por-pagar",
      etiqueta: "Cuentas por pagar",
      archivo: "PLANTILLA_CUENTAS_POR_PAGAR.xlsx",
      hojas: [
        {
          nombre: "CPP",
          filas: [
            ["PROVEEDOR", "DESCRIPCIÓN", "FECHA COMPRA", "PAIS", "# MONTO", "ESTATUS"],
            ["Proveedor ejemplo", "Mercancía a crédito", `${a}-01-15`, "PANAMA", 1200, "PENDIENTE"],
          ],
        },
      ],
    },
    {
      clave: "costos",
      modulo: "costos-mercancia",
      etiqueta: "Costos de mercancía",
      archivo: "PLANTILLA_COSTOS_MERCANCIA.xlsx",
      hojas: [
        {
          nombre: "MERCANCIA TIENDA EJEMPLO",
          filas: [
            ["FECHA DE LLEGADA", "MES LLEGADA", "PROVEEDOR", "N DE SEGUIMIENTO", "NOMBRE HOMOLOGADO", "PRODUCTO", "TIENDA", "CODIGO", "CANTIDAD", "COSTO UNITARIO", "COMISION CAMBIO", "PAGO DE IMPUESTO", "COSTE DE ENVIO", "FINANCIAMIENTO", "COSTO TOTAL", "ESTATUS DE MERCANCIA PARA VENTA"],
            [`${a}-01-20`, `1-${a}`, "Proveedor ejemplo", "TRK-0001", "PRODUCTO EJEMPLO", "Producto ejemplo", "TIENDA EJEMPLO", "SKU-001", 100, 2.5, 0, 0.3, 0.4, 0, 3.2, "DISPONIBLE"],
          ],
        },
        { nombre: "MAPEO", filas: [["MAPEO"], ["PRODUCTO DROPI", "PRODUCTO COSTE A USAR"], ["Producto en Dropi (ejemplo)", "PRODUCTO EJEMPLO"]] },
      ],
    },
    {
      clave: "nomina-formal",
      modulo: "nomina",
      etiqueta: "Nómina formal",
      archivo: "PLANTILLA_PLANILLA_FORMAL.xlsx",
      hojas: [
        {
          nombre: `ENERO ${a}`,
          filas: [
            ["N° de empleado", "CEDULA /PASAPORTE", "NAC", "NOMBRE COMPLETO", "CARGO", "FECHA DE INICIO", "ESTATUS", "SALARIO MENSUAL", "HORAS POR MES", "HORA RATA", "HORAS TRABAJADAS", "HORAS EXTRAS", "TOTAL HORAS EXTRAS", "TARDANZAS", "AUSENCIAS", "DESCUENTO APLICADO", "BONO", "TOTAL ASIGNACIONES", "SEGURO SOCIAL", "SEGURO EDUCATIVO", "SALARIO NETO", "OBSERVACIÓN"],
            [1, "0-000-0000", "PAN", "Persona ejemplo", "Asistente", `${a}-01-01`, "ACTIVO", 800, 208, 3.85, 208, 0, 0, 0, 0, 0, 0, 800, 78, 10, 712, ""],
          ],
        },
      ],
    },
    {
      clave: "nomina-externa",
      modulo: "nomina",
      etiqueta: "Nómina externa (USDT)",
      archivo: "PLANTILLA_NOMINA_EXTERNA.xlsx",
      hojas: [
        {
          nombre: `ENERO ${a}`,
          filas: [
            ["Nombre completo", "País", "Rol / Función", "Correo", "Frecuencia", "Periodo cubierto", "Tienda", "Sueldo Mensual USDT", "Horas extra", "Bono USDT", "TOTAL USDT", "TIPO DE PAGO", "FECHA DE PAGO", "Medio de pago", "Referencia", "Pagado", "Observación"],
            ["Persona ejemplo", "Colombia", "Diseño", "ejemplo@correo.test", "Mensual", `1-${a}`, "TIENDA EJEMPLO", 600, 0, 0, 600, "Sueldo", `${a}-01-31`, "USDT", "TX-0001", "SI", ""],
          ],
        },
      ],
    },
    {
      clave: "ventas",
      modulo: "ventas-tiendas",
      etiqueta: "Ventas por tienda",
      archivo: "PLANTILLA_VENTAS.xlsx",
      hojas: [
        {
          nombre: "Excel Matriz",
          filas: [
            ["TIENDA", "FECHA", "N° Orden", "NOMBRES Y APELLIDOS", "TOTAL VENTA", "CANTIDAD", "NOMBRE PRODUCTO", "SKU", "CORREGIMIENTO", "DIRECCIÓN", "TELÉFONO", "ESTADO PEDIDO SHOPIFY", "ETIQUETAS", "NOTAS", "FORMA DE PAGO", "VERIFICADO", "COURIER", "MONTO ENVIO", "FECHA DE ENVIO", "COSTO PRODUCTO", "EXITOSA/FALLIDA", "MES", "FACTURADO CON ITBMS", "N° FACTURA"],
            ["TIENDA EJEMPLO", `${a}-01-08`, "#1001", "Cliente ejemplo", 39.9, 1, "Producto ejemplo", "SKU-001", "Corregimiento", "Calle 1", "6000-0000", "paid", "", "", "Contra entrega", "SI", "Delivery", 3.65, `${a}-01-09`, 12, "EXITOSA", `1-${a}`, "NO", ""],
          ],
        },
      ],
    },
    {
      clave: "deliverys",
      modulo: "deliverys",
      etiqueta: "Deliverys",
      archivo: "PLANTILLA_GESTION_DELIVERYS.xlsx",
      hojas: [
        {
          nombre: "GESTION DELIVERY",
          filas: [
            ["GESTIÓN DE DELIVERYS"],
            [null, null, null, "TIENDAS", null, "PAGO POR ENTREGAS (COSTE DE ENVIO $3.65 cada uno)", null, "CALCULOS DE PAGOS DE ENVIOS"],
            ["FECHA", "MES", "NOMBRE DEL DELIVERY", "OFERFY", "NUVO", "ENTREGADO NUVO", "FALLIDO NUVO", "Pagar por envíos NUVO"],
            [`${a}-01-08`, `1-${a}`, "Repartidor ejemplo", 5, 2, 4, 1, 14.6],
          ],
        },
      ],
    },
    {
      clave: "conciliacion",
      modulo: "conciliacion-bancaria",
      etiqueta: "Extracto bancario",
      archivo: "PLANTILLA_EXTRACTO_BANCARIO.xlsx",
      hojas: [
        {
          nombre: "BANCO",
          filas: [
            ["Fecha", "Descripción", "Referencia", "Débito", "Crédito", "Saldo"],
            [`${a}-01-08`, "Depósito ejemplo", "REF-0001", null, 150, 150],
          ],
        },
      ],
    },
  ];
}

/** Las plantillas de un módulo (la nómina tiene dos). */
export const plantillasDe = (modulo: ModuloImportable) => plantillas().filter((p) => p.modulo === modulo);
