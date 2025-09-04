import type { Metadata } from "next";
import "./globals.css";
import AppHeader from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "Gifty",
  description: "Gift cards for local businesses in El Salvador",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900 antialiased">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 pb-24 pt-6">{children}</main>
        <footer className="border-t bg-white">
          <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-neutral-500">
            <p>
              © {new Date().getFullYear()} Gifty — Send gifts, not remittances.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
