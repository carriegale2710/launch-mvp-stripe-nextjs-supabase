import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

type CorsHandler = (request: NextRequest) => Promise<Response>;

function getCorsHeaders(request: NextRequest) {
  const allowedOrigins = [
    process.env.NEXT_PUBLIC_APP_URL,
    'http://localhost:3000',
    'http://localhost:8000',
  ].filter((value): value is string => Boolean(value));
  const origin = request.headers.get('origin') || '';
  const allowOrigin = allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0] || 'http://localhost:3000';
  
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, stripe-signature, x-client-info',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

export function withCors(handler: CorsHandler) {
  return async function corsHandler(request: NextRequest) {
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      return NextResponse.json({}, { headers: getCorsHeaders(request) });
    }

    // Call the original handler
    const response = await handler(request);

    // Add CORS headers to the response
    Object.entries(getCorsHeaders(request)).forEach(([key, value]) => {
      response.headers.set(key, value);
    });

    return response;
  };
}