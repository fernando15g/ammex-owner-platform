import "./globals.css";

export const metadata = {
  title: "Ammex OS — Owner Platform",
  description: "Owner command center",
};

// Apply saved theme before first paint (default light) — no flash on load.
const themeScript = `(function(){try{var t=localStorage.getItem('ammex-theme');document.documentElement.setAttribute('data-theme',(t==='dark'||t==='light')?t:'light');}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="light">
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
