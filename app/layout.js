import "./globals.css";

export const metadata = {
  title: "Ammex OS — Owner Platform",
  description: "Owner command center",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
