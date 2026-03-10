import { NextResponse } from 'next/server'
import crypto from 'crypto'

export const maxDuration = 60

const CONTAINER_MAP: Record<string, string> = {
  CI: 'AZURE_BLOB_URL_CI',
  C1: 'AZURE_BLOB_URL_C1',
  C2: 'AZURE_BLOB_URL_C2',
  CB: 'AZURE_BLOB_URL_CB',
}

function parseEnvUrl(envVal: string): { baseUrl: string; sasToken: string } | null {
  const qIdx = envVal.indexOf('?')
  if (qIdx === -1) return null
  return { baseUrl: envVal.substring(0, qIdx), sasToken: envVal.substring(qIdx + 1) }
}

// Encode blob URL into a signed, tamper-proof token (no in-memory cache needed)
// Uses standard base64 with manual URL-safe replacement (base64url not supported in this runtime)
const SECRET = () => process.env.DOCUMENT_PROXY_SECRET || 'crimiknow-doc-proxy-2026'

function toBase64Url(str: string): string {
  return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(b64: string): string {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice(0, (4 - (b64.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('utf-8')
}

function encodeToken(blobUrl: string): string {
  const payload = toBase64Url(blobUrl)
  const sig = crypto.createHmac('sha256', SECRET()).update(payload).digest('hex').substring(0, 16)
  return `${sig}.${payload}`
}

function decodeToken(token: string): string | null {
  const dotIdx = token.indexOf('.')
  if (dotIdx === -1) return null
  const sig = token.substring(0, dotIdx)
  const payload = token.substring(dotIdx + 1)
  const expected = crypto.createHmac('sha256', SECRET()).update(payload).digest('hex').substring(0, 16)
  if (sig !== expected) return null
  return fromBase64Url(payload)
}

/**
 * GET: Stream PDF content by signed token -- same-origin, no blob URL in browser
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 })
  }

  const blobUrl = decodeToken(token)
  if (!blobUrl || !blobUrl.includes('blob.core.windows.net')) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 403 })
  }

  try {
    // Clean the URL: strip leaked fragments, encode special chars Azure requires
    const cleanBlobUrl = blobUrl.replace(/#.*$/, '')
    const safeBlobUrl = cleanBlobUrl
      .replace(/\[/g, '%5B')
      .replace(/\]/g, '%5D')
      .replace(/\{/g, '%7B')
      .replace(/\}/g, '%7D')
    
    const response = await fetch(safeBlobUrl)
    
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      const isBlobNotFound = body.includes('BlobNotFound') || response.status === 404
      if (isBlobNotFound) {
        return NextResponse.json(
          { error: 'Document not found in storage. The file may have been moved or renamed.' },
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        )
      }
      return NextResponse.json(
        { error: 'Failed to fetch document from storage' },
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const contentType = response.headers.get('content-type') || 'application/pdf'
    // Read full body as ArrayBuffer (response.body passthrough returns blank in this runtime)
    const buffer = await response.arrayBuffer()

    return new Response(buffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'private, no-store, no-cache',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    })
  } catch (err) {
    console.error('[Documents Proxy] Stream error:', err)
    return NextResponse.json(
      { error: 'Failed to stream document' },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * POST: Resolve search/type/q to a proxy token + document name
 * Delegates to /api/documents for the heavy resolution logic (with listing fallback),
 * then wraps the resolved blob URL in a signed token for secure proxied streaming.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { search, type, q, source } = body

    // Build query params for the documents route
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    if (type) params.set('type', type)
    if (q) params.set('q', q)
    if (source) params.set('source', source)

    // Call the documents route internally to resolve the blob URL
    const origin = new URL(request.url).origin
    const resolveRes = await fetch(`${origin}/api/documents?${params.toString()}`)
    
    // Safely parse -- the documents route may return non-JSON on error
    const resolveContentType = resolveRes.headers.get('content-type') || ''
    let resolveData: { url?: string; name?: string; error?: string; hint?: string }
    if (resolveContentType.includes('application/json')) {
      resolveData = await resolveRes.json()
    } else {
      return NextResponse.json(
        { error: 'Document not found in the knowledge base' },
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!resolveRes.ok || !resolveData.url) {
      return NextResponse.json(
        { error: resolveData.error || 'Document not found', hint: resolveData.hint },
        { status: resolveRes.status || 404, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Wrap the resolved blob URL in a signed token
    const token = encodeToken(resolveData.url)
    return NextResponse.json({ token, name: resolveData.name || 'Document' })
  } catch (err) {
    console.error('[Documents Proxy] POST error:', err)
    return NextResponse.json({ error: 'Failed to resolve document' }, { status: 500 })
  }
}
