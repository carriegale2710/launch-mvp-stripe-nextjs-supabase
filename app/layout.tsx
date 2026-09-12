'use client';

import "./globals.css";
import { AuthProvider } from '@/contexts/AuthContext';
import TopBar from '../components/TopBar';
import ProtectedRoute from '@/contexts/ProtectedRoute';
import { Analytics } from "@vercel/analytics/react"
// import { PostHogProvider } from '@/contexts/PostHogContext';
// import { PostHogErrorBoundary } from '@/components/PostHogErrorBoundary';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="antialiased"
        style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
      >
        <Analytics mode="auto" />
        {/* <PostHogErrorBoundary>
          <PostHogProvider> */}
            <AuthProvider>   
                <ProtectedRoute>
                  <TopBar />    
                  <main>{children}</main>
                </ProtectedRoute>
            </AuthProvider>
          {/* </PostHogProvider>
        </PostHogErrorBoundary> */}
      </body>
    </html>
  );
}
