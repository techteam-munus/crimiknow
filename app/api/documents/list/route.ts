import { NextResponse } from 'next/server'

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const index = (searchParams.get('index') || 'CI').toUpperCase()
  const prefix = searchParams.get('prefix') || ''
  
  const envKey = CONTAINER_MAP[index]
  if (!envKey) {
    return NextResponse.json({ error: 'Invalid index', validIndexes: Object.keys(CONTAINER_MAP) })
  }
  
  const envVal = process.env[envKey]
  if (!envVal) {
    return NextResponse.json({ error: `${envKey} not configured`, configured: false })
  }

  const parsed = parseEnvUrl(envVal)
  if (!parsed) {
    return NextResponse.json({ error: `${envKey} must be full URL with ?sasToken` })
  }

  const listUrl = `${parsed.baseUrl}?restype=container&comp=list&maxresults=50${prefix ? `&prefix=${encodeURIComponent(prefix)}` : ''}&${parsed.sasToken}`
  
  try {
    const response = await fetch(listUrl)
    if (!response.ok) {
      const text = await response.text()
      return NextResponse.json({ error: 'Azure API error', status: response.status, body: text.slice(0, 500) })
    }
    
    const xml = await response.text()
    const names: string[] = []
    const regex = /<Name>([^<]+)<\/Name>/g
    let match
    while ((match = regex.exec(xml)) !== null) {
      names.push(match[1])
    }
    
    return NextResponse.json({ 
      index, 
      baseUrl: parsed.baseUrl,
      blobCount: names.length,
      blobs: names,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Fetch failed', message: String(err) })
  }
}
