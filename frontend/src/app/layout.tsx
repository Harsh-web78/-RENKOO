import './globals.css';
import AuthGate from '../components/AuthGate';
export const metadata={title:'RENKOO — AI Growth Operating System',description:'RENKOO is the AI Growth Operating System: connect your website, search and revenue data to find what is hurting growth, understand why, decide what matters, execute improvements, and prove the revenue impact.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><AuthGate>{children}</AuthGate></body></html>}
