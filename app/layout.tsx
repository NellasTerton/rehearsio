import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rehearsio",
  description: "Собеседование, на котором можно облажаться — потренируйтесь с AI перед настоящим интервью.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,400;0,500;0,600&family=Playfair+Display:ital,wght@1,400;1,500&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
