import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Cada página pone su nombre («Retiros») y la plantilla le agrega el del producto: «Retiros · Ecomfive».
  title: { default: "Ecomfive Business OS", template: "%s · Ecomfive" },
  description: "Gestión operativa, financiera y de inteligencia competitiva de Ecomfive por país y plataforma",
};

const SCRIPT_TEMA = `
try {
  var tema = localStorage.getItem("tema");
  if (tema === "dark") document.documentElement.dataset.theme = "dark";
} catch (e) {}
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${inter.variable} h-full antialiased`}>
      <head>
        {/* Antes del primer pintado, para que no haya parpadeo claro->oscuro al cargar. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }} />
      </head>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
