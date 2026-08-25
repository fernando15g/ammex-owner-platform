import "./globals.css";

export const metadata = {
  title: "Ammex OS — Owner Platform",
  description: "Owner command center",
  // Icons come from the file conventions app/icon.svg (browser tab) and
  // app/apple-icon.png (iOS home screen) — those OVERRIDE any metadata.icons
  // config, so the icons live as files, not here. Android reads the manifest.
  manifest: "/manifest.webmanifest",
};

// Apply saved theme before first paint (default light) — no flash on load.
const themeScript = `(function(){try{var t=localStorage.getItem('ammex-theme');document.documentElement.setAttribute('data-theme',(t==='dark'||t==='light')?t:'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light">
      <head>
        {/* Label shown under the home-screen icon — without this iOS uses the
            full <title> and truncates it to "Ammex OS — Ow…". */}
        <meta name="apple-mobile-web-app-title" content="Ammex OS" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
