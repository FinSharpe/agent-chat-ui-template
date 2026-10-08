import type { Metadata } from "next";
import "./globals.css";
import localFont from "next/font/local";
import React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";

const inter = localFont({
  src: [
    { path: "./fonts/Inter-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Inter-Medium.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Inter-SemiBold.ttf", weight: "600", style: "normal" },
  ],
  preload: true,
  display: "swap",
});

export const metadata: Metadata = {
  title: "Agent Chat",
  description: "Conversations, research, and reports with your agent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
