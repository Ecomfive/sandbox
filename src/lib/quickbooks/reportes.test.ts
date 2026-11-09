import assert from "node:assert/strict";
import test from "node:test";
import { columnasReporte, consultaPaginada, cuentaDeQbo, filasConsulta, filasPyg, montoReporte, rangoFechas, siguienteInicio, sumarVentasPorMes } from "./reportes";

// Respuesta inventada con la forma del reporte ProfitAndLoss de la API v3 (summarize_column_by=Month).
const PYG = {
  Header: { ReportName: "ProfitAndLoss" },
  Columns: {
    Column: [
      { ColTitle: "", ColType: "Account" },
      { ColTitle: "Sep 2026", ColType: "Money", MetaData: [{ Name: "StartDate", Value: "2026-09-01" }, { Name: "EndDate", Value: "2026-09-30" }] },
      { ColTitle: "Oct 2026", ColType: "Money", MetaData: [{ Name: "StartDate", Value: "2026-10-01" }, { Name: "EndDate", Value: "2026-10-31" }] },
      { ColTitle: "Total", ColType: "Money" },
    ],
  },
  Rows: {
    Row: [
      {
        type: "Section",
        group: "Income",
        Header: { ColData: [{ value: "Income" }] },
        Rows: { Row: [{ type: "Data", ColData: [{ value: "Ventas tienda", id: "10" }, { value: "1,000.00" }, { value: "1200.50" }, { value: "2200.50" }] }] },
        Summary: { ColData: [{ value: "Total Income" }, { value: "1000.00" }, { value: "1200.50" }, { value: "2200.50" }] },
      },
      {
        type: "Section",
        group: "COGS",
        Rows: { Row: [{ type: "Data", ColData: [{ value: "Costo de mercancía", id: "20" }, { value: "400" }, { value: "" }, { value: "400" }] }] },
      },
      {
        type: "Section",
        group: "Expenses",
        Rows: {
          Row: [
            {
              type: "Section",
              Header: { ColData: [{ value: "Gastos generales", id: "30" }] },
              Rows: { Row: [{ type: "Data", ColData: [{ value: "Publicidad Meta", id: "31" }, { value: "150" }, { value: "-10" }, { value: "140" }] }] },
            },
            { type: "Data", ColData: [{ value: "Alquiler" }, { value: "200" }, { value: "200" }, { value: "400" }] },
          ],
        },
      },
      { type: "Section", group: "NetIncome", Summary: { ColData: [{ value: "Net Income" }, { value: "250" }] } },
    ],
  },
};

test("columnas por mes, sin el total", () => {
  assert.deepEqual(columnasReporte(PYG, "mes").map((c) => c.clave), ["2026-09-01", "2026-10-01"]);
});

test("filasPyg: cuentas hoja con su grupo, subsecciones y cuentas sin id", () => {
  const f = filasPyg(PYG, "mes");
  const de = (id: string, mes: string) => f.find((x) => x.cuentaId === id && x.columna === mes)?.monto;
  assert.equal(de("10", "2026-09-01"), 1000);
  assert.equal(de("10", "2026-10-01"), 1200.5);
  assert.equal(de("20", "2026-10-01"), undefined); // vacío = 0, no se guarda
  assert.equal(f.find((x) => x.cuentaId === "31")?.grupo, "Expense");
  assert.equal(de("31", "2026-10-01"), -10);
  assert.equal(de("nombre:Alquiler", "2026-09-01"), 200);
  assert.ok(!f.some((x) => x.cuentaNombre === "Net Income"));
});

test("reporte por clase: la clave es el ColKey", () => {
  const r = { Columns: { Column: [{ ColType: "Account" }, { ColTitle: "Tienda A", ColType: "Money", MetaData: [{ Name: "ColKey", Value: "5" }] }, { ColTitle: "Total", ColType: "Money" }] }, Rows: { Row: [] } };
  assert.deepEqual(columnasReporte(r, "clase"), [{ clave: "5", titulo: "Tienda A", indice: 1 }]);
});

test("montos, consultas y paginación", () => {
  assert.equal(montoReporte("1,234.56"), 1234.56);
  assert.equal(montoReporte(""), 0);
  assert.equal(montoReporte("abc"), 0);
  assert.equal(consultaPaginada("Account", "", 1), "select * from Account startposition 1 maxresults 1000");
  assert.equal(siguienteInicio(1, 1000), 1001);
  assert.equal(siguienteInicio(1001, 20), null);
  const resp = { QueryResponse: { Account: [{ Id: "1", Name: "Caja", AccountType: "Bank", Active: true }, { Name: "sin id" }] } };
  const filas = filasConsulta(resp, "Account");
  assert.equal(filas.length, 2);
  assert.equal(cuentaDeQbo(filas[0])?.tipo, "Bank");
  assert.equal(cuentaDeQbo(filas[1]), null);
});

test("ventas por mes y rango de fechas", () => {
  const m = sumarVentasPorMes([{ TxnDate: "2026-09-03", TotalAmt: 10 }, { TxnDate: "2026-09-30", TotalAmt: "5.5" }, { TxnDate: "2026-10-01", TotalAmt: 1 }, { TxnDate: "mal" }]);
  assert.deepEqual(m.get("2026-09-01"), { documentos: 2, total: 15.5 });
  assert.deepEqual(rangoFechas(["2026-10-01", "2026-02-01"]), { desde: "2026-02-01", hasta: "2026-10-31" });
  assert.deepEqual(rangoFechas(["2024-02-01"]), { desde: "2024-02-01", hasta: "2024-02-29" });
});
