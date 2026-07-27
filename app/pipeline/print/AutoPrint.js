"use client";
// Opens the print dialog once the page has rendered. From there the person
// prints, or picks "Save as PDF" — the browser is the PDF engine.
import { useEffect } from "react";

export default function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 350);
    return () => clearTimeout(t);
  }, []);
  return null;
}
