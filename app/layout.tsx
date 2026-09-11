import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rent vs. Buy — Stochastic Housing Workbench",
  description:
    "A Monte Carlo workbench for the India rent-vs-buy decision: every input is a configurable random variable.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
