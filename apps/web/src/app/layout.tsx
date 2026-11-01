// Root layout is a pass-through; <html> lives in [locale]/layout.tsx so `lang` is correct.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
