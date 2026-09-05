import './globals.css';

export const metadata = {
  title: 'RENKOO — Growth Operating System',
  description: 'Turn growth signals into prioritized decisions and measurable action.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="bg-background">
      <body>{children}</body>
    </html>
  );
}
