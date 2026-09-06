import type { Metadata } from "next";
import "./globals.css";
import "./relay-extra.css";

export const metadata: Metadata = {
  title: "Relay — Remote Production for OBS",
  description: "Professional remote contribution, return feeds and production control for OBS workflows.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
