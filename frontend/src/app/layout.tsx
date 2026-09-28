import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/Providers";

export const metadata: Metadata = {
  title: "KH Cloud — Cloud Control Plane",
  description:
    "A premium cloud control plane for deploying apps, databases, object storage, and edge functions.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="font-sans antialiased bg-[#0b0d11] text-[#f1f3f6]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
