import './globals.css';
import AuthGate from '../components/AuthGate';
export const metadata={title:'RENKOO — AI Growth Operating System',description:'AI Growth Operating System'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><AuthGate>{children}</AuthGate></body></html>}
