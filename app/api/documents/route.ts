import { NextResponse } from 'next/server'

export const maxDuration = 30

// Maps index label -> env var key
const CONTAINER_MAP: Record<string, string> = {
  CI: 'AZURE_BLOB_URL_CI',
  C1: 'AZURE_BLOB_URL_C1',
  C2: 'AZURE_BLOB_URL_C2',
  CB: 'AZURE_BLOB_URL_CB',
}

const ABBREVIATIONS: Record<string, string> = {
  'R.A.': 'Republic Act',
  'RA': 'Republic Act',
  'P.D.': 'Presidential Decree',
  'PD': 'Presidential Decree',
  'B.P.': 'Batas Pambansa',
  'BP': 'Batas Pambansa',
  'E.O.': 'Executive Order',
  'EO': 'Executive Order',
  'A.M.': 'Administrative Matter',
  'AM': 'Administrative Matter',
}

const RPC_PATH = 'Criminal Law 1 Part 1/CIRCUMSTANCES AFFECTING CRIMINAL LIABILITY/Revised Penal Code.pdf'

/**
 * Encode a blob path segment for Azure Blob Storage URLs.
 * Uses encodeURIComponent, then decodes chars that Azure expects literal in URL paths.
 * Without this, commas become %2C and semicolons become %3B which causes 404s.
 */
function encodeAzureBlobSegment(segment: string): string {
  return encodeURIComponent(segment)
    .replace(/%2C/gi, ',')
    .replace(/%3B/gi, ';')
    .replace(/%40/gi, '@')
    .replace(/%3A/gi, ':')
    .replace(/%24/gi, '$')
    .replace(/%2B/gi, '+')
}

/**
 * Parse an env var into { baseUrl, sasToken }.
 * Expects full URL format: "https://account.blob.core.windows.net/container?sp=r&st=..."
 */
function parseEnvUrl(envVal: string): { baseUrl: string; sasToken: string } | null {
  const qIdx = envVal.indexOf('?')
  if (qIdx === -1) return null
  return {
    baseUrl: envVal.substring(0, qIdx),
    sasToken: envVal.substring(qIdx + 1),
  }
}

function buildSearchTerms(query: string): string[] {
  const terms: string[] = []

  const artMatch = query.match(/Art(?:icle)?\.?\s*(\d+)/i)
  if (artMatch) {
    terms.push(`Article ${artMatch[1]}`)
    terms.push(`Art. ${artMatch[1]}`)
    terms.push(`Art ${artMatch[1]}`)
  }

  const lawMatch = query.match(/(R\.A\.|RA|P\.D\.|PD|B\.P\.|BP|E\.O\.|EO|A\.M\.|AM)\s*(?:No\.?)?\s*(\d+)/i)
  if (lawMatch) {
    terms.push(lawMatch[2])
    const expanded = ABBREVIATIONS[lawMatch[1]] || ABBREVIATIONS[lawMatch[1].toUpperCase()]
    if (expanded) {
      terms.push(`${expanded} No. ${lawMatch[2]}`)
      terms.push(`${expanded} ${lawMatch[2]}`)
    }
  }

  const fullMatch = query.match(/(Republic Act|Presidential Decree|Batas Pambansa|Executive Order|Act)\s*(?:No\.?)?\s*(\d+)/i)
  if (fullMatch) {
    terms.push(fullMatch[2])
    terms.push(fullMatch[0].trim())
  }

  const grMatch = query.match(/G\.R\.\s*No[s]?\.\s*(?:L-)?(\d+)/i)
  if (grMatch) {
    terms.push(grMatch[1])
    terms.push(`G.R. No. ${grMatch[1]}`)
  }

  // Full case name: "People v. De Jesus" -> "People v. De Jesus", also just surname(s)
  const vsMatchFull = query.match(/((?:People|Republic|State)\s+(?:of\s+the\s+Philippines\s+)?v[s]?\.\s+[A-Za-zÀ-ÿñÑ\s,.]+?)(?:\s*[,(]|\s*G\.R\.|$)/i)
  if (vsMatchFull) terms.push(vsMatchFull[1].trim())
  const vsMatchReverse = query.match(/([A-Za-zÀ-ÿñÑ]+(?:\s+[A-Za-zÀ-ÿñÑ]+)*)\s+v[s]?\.\s+(People|Republic|State|Court)/i)
  if (vsMatchReverse) terms.push(`${vsMatchReverse[1].trim()} v. ${vsMatchReverse[2]}`)
  // Also extract just the surname(s) after "v." for broader matching
  const vsMatch = query.match(/v[s]?\.\s+([A-Za-zÀ-ÿñÑ]+(?:\s+[A-Za-zÀ-ÿñÑ]+){0,2})/i)
  if (vsMatch) terms.push(vsMatch[1].trim())

  const namedMatch = query.match(/(Revised Penal Code|Dangerous Drugs Act|Cybercrime Prevention Act|Anti-[A-Za-z\s]+(?:Act|Law)|Data Privacy Act)/i)
  if (namedMatch) terms.push(namedMatch[1].trim())

  if (terms.length === 0) {
    const cleaned = query.replace(/[*_#]/g, '').trim()
    if (cleaned.length > 3) terms.push(cleaned)
  }

  return [...new Set(terms)]
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const index = searchParams.get('index')
  const file = searchParams.get('file')
  const search = searchParams.get('search')
  const type = searchParams.get('type')
  const article = searchParams.get('article')
  const q = searchParams.get('q')
  const mode = searchParams.get('mode')
  const source = searchParams.get('source')

  try {
    // Mode 0: Revised Penal Code direct access with article search
    if (type === 'rpc') {
      const envKey = CONTAINER_MAP['C1']
      const envVal = process.env[envKey]
      if (!envVal) return NextResponse.json({ error: 'AZURE_BLOB_URL_C1 not configured' }, { status: 500 })
      
      const parsed = parseEnvUrl(envVal)
      if (!parsed) return NextResponse.json({ error: 'AZURE_BLOB_URL_C1 must be full URL with ?sasToken', hint: 'Format: https://account.blob.core.windows.net/container?sp=r&st=...' }, { status: 500 })

      const encodedPath = RPC_PATH.split('/').map(s => encodeAzureBlobSegment(s)).join('/')
      let blobUrl = `${parsed.baseUrl}/${encodedPath}?${parsed.sasToken}`

      const searchParam = q || article
      if (searchParam) {
        blobUrl += `#search=${encodeURIComponent(searchParam)}`
      }

      if (mode === 'redirect') {
        return NextResponse.redirect(blobUrl)
      }
      return NextResponse.json({ url: blobUrl, name: `Revised Penal Code${searchParam ? ` - ${searchParam}` : ''}` })
    }

    // Mode 1: Direct access by index + filename
    if (index && file) {
      const envKey = CONTAINER_MAP[index.toUpperCase()]
      if (!envKey) return NextResponse.json({ error: `Unknown index: ${index}` }, { status: 404 })
      const envVal = process.env[envKey]
      if (!envVal) return NextResponse.json({ error: `${envKey} not configured` }, { status: 500 })
      const parsed = parseEnvUrl(envVal)
      if (!parsed) return NextResponse.json({ error: `${envKey} must be full URL with ?sasToken` }, { status: 500 })
      const blobUrl = `${parsed.baseUrl}/${file.split('/').map(s => encodeAzureBlobSegment(s)).join('/')}?${parsed.sasToken}`
      return NextResponse.json({ url: blobUrl, name: file })
    }

    // Mode 2: Search via Azure AI Search, then build direct blob URL
    if (search) {
      const terms = buildSearchTerms(search)

      const searchEndpoint = process.env.AZURE_SEARCH_ENDPOINT
      const searchApiKey = process.env.AZURE_SEARCH_API_KEY

      if (!searchEndpoint || !searchApiKey) {
        return NextResponse.json({ error: 'Search not configured' }, { status: 500 })
      }

      // --- STEP 1: Try direct blob listing by FILENAME match FIRST ---
      // This is the most reliable method: list all blobs in the container and match
      // by filename. Requires SAS tokens with list permission (sp=rl).
      {
        const containerKeys = source === 'barexam'
          ? [CONTAINER_MAP['CB']]
          : [CONTAINER_MAP['C1'], CONTAINER_MAP['C2']]

        const surnameForListing = search.match(/v[s]?\.\s+([A-Za-zÀ-ÿñÑ]+)/i)?.[1]?.toLowerCase() || ''
        const grForListing = search.match(/G\.?R\.?\s*No[s]?\.?\s*((?:L-)?[\d-]+)/i)?.[1] || ''

        const allContainerBlobs: { path: string; baseUrl: string; sasToken: string }[] = []

        for (const envKey of containerKeys) {
          if (!envKey) continue
          const envVal = process.env[envKey]
          if (!envVal) continue
          const parsed = parseEnvUrl(envVal)
          if (!parsed) continue

          try {
            let marker = ''
            do {
              const markerParam = marker ? `&marker=${encodeURIComponent(marker)}` : ''
              const listUrl = `${parsed.baseUrl}?restype=container&comp=list&maxresults=5000${markerParam}&${parsed.sasToken}`
              const resp = await fetch(listUrl)
              if (!resp.ok) break

              const xml = await resp.text()
              const nameRegex = /<Name>([^<]+)<\/Name>/g
              let m
              while ((m = nameRegex.exec(xml)) !== null) {
                const xmlDecoded = m[1]
                  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                  .replace(/&apos;/g, "'").replace(/&quot;/g, '"')
                  .replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
                  .replace(/&#(\d+);/g, (_: string, dec: string) => String.fromCharCode(parseInt(dec, 10)))
                allContainerBlobs.push({ path: xmlDecoded, baseUrl: parsed.baseUrl, sasToken: parsed.sasToken })
              }
              const nextMarker = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/)?.[1] || ''
              marker = nextMarker
            } while (marker)
          } catch {
            // listing failed, continue to next container
          }
        }

        if (allContainerBlobs.length > 0) {
          const scored = allContainerBlobs
            .filter(b => (b.path.split('/').pop() || '').toLowerCase().endsWith('.pdf'))
            .map(b => {
              const fn = (b.path.split('/').pop() || '').toLowerCase()
              let score = 0

              const searchLower = search.toLowerCase()
              if (fn.includes(searchLower)) score += 200

              if (grForListing) {
                const isNumeric = /^\d+$/.test(grForListing)
                const grRegex = isNumeric
                  ? new RegExp(`(?<!\\d)${grForListing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\d)`, 'i')
                  : new RegExp(grForListing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
                if (grRegex.test(fn)) score += 150
              }

              if (surnameForListing && surnameForListing.length > 2 && fn.includes(surnameForListing)) score += 100

              for (const term of terms) {
                const tl = term.toLowerCase()
                if (tl.length <= 2) continue
                const isNum = /^\d+$/.test(tl)
                if (isNum) {
                  const numRegex = new RegExp(`(?<!\\d)${tl}(?!\\d)`)
                  if (numRegex.test(fn)) score += 20
                } else if (fn.includes(tl)) {
                  score += 20
                }
              }

              if (score > 0) score -= fn.length * 0.05

              return { ...b, score }
            })
            .filter(b => b.score > 0)
            .sort((a, b) => b.score - a.score)

          if (scored.length > 0) {
            const best = scored[0]
            const encodedPath = best.path.split('/').map(s => encodeAzureBlobSegment(s)).join('/')
            const blobUrl = `${best.baseUrl}/${encodedPath}?${best.sasToken}`
            const displayName = best.path.split('/').pop() || best.path
            return NextResponse.json({ url: blobUrl, name: displayName })
          }
        }
      }

      // --- STEP 2: Fall back to Azure Search if direct listing found nothing ---
      if (searchEndpoint && searchApiKey) {
        // Route by source: barexam -> CB only, default -> C1, C2 for laws/jurisprudence
        let indexOrder: [string, string][]
        if (source === 'barexam') {
          indexOrder = [['crimiknowbarexam', 'CB']]
        } else {
          indexOrder = [['crimiknow-rag', 'C1'], ['crimiknow2-rag', 'C2']]
        }
        const searchQuery = terms.join(' ')

        for (const [indexName, containerLabel] of indexOrder) {
          try {
            const searchUrl = `${searchEndpoint.replace(/\/$/, '')}/indexes/${indexName}/docs/search?api-version=2024-07-01`
            const searchResponse = await fetch(searchUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'api-key': searchApiKey },
              body: JSON.stringify({
                search: searchQuery,
                queryType: 'simple',
                searchMode: 'any',
                top: 15,
              }),
            })
            if (!searchResponse.ok) continue

            const searchResult = await searchResponse.json()
            if (!searchResult.value || searchResult.value.length === 0) continue

            // Collect all unique candidate blob paths from search results
            const seenPaths = new Set<string>()
            interface BlobCandidate { blobName: string; blobBase: string; sasToken: string; score: number; originalEncodedPath: string }
            const candidates: BlobCandidate[] = []
            
            // Extract search terms for filename matching
            const searchLower = searchQuery.toLowerCase()
            // For jurisprudence like "People v. Mejia", extract the surname
            const surnameMatch = searchLower.match(/v[s]?\.\s+([a-zà-ÿñ]+)/i)
            const surname = surnameMatch ? surnameMatch[1].toLowerCase() : ''
            // For G.R. No. references, extract the number
            const grNoMatch = searchLower.match(/g\.?r\.?\s*no[s]?\.?\s*((?:l-)?[\d-]+)/i)
            const grNumber = grNoMatch ? grNoMatch[1].toLowerCase() : ''
            
            for (const doc of searchResult.value) {
              const base64Fields = [doc.parent_id, doc.metadata_storage_path]
              
              for (const field of base64Fields) {
                if (!field) continue
                try {
                  let decoded = field
                  if (field.startsWith('aHR0')) {
                    let padded = field
                    while (padded.length % 4 !== 0) padded += '='
                    decoded = Buffer.from(padded, 'base64').toString('utf-8')
                  }
                  
                  decoded = decoded.replace(/[\x00-\x1f]/g, '')
                  decoded = decoded.replace(/\.(pdf|docx?|xlsx?|pptx?|txt)[^/&?]*/i, '.$1')
                  // Strip #search= or %23search= fragments appended by Azure Search indexer
                  decoded = decoded.replace(/#search=.*$/i, '').replace(/%23search=.*$/i, '')
                  
                  if (!decoded.includes('blob.core.windows.net')) continue
                  if (seenPaths.has(decoded)) continue
                  seenPaths.add(decoded)
                  
                  const blobUrl = new URL(decoded)
                  // Keep the original encoded path from the index (this is the true storage path)
                  const originalEncodedPath = blobUrl.pathname.split('/').slice(2).join('/')
                  const blobName = decodeURIComponent(originalEncodedPath)
                  const containerPath = blobUrl.pathname.split('/').slice(0, 2).join('/')
                  const blobBase = `${blobUrl.origin}${containerPath}`
                  
                  let sasToken = ''
                  for (const [label, envKey] of Object.entries(CONTAINER_MAP)) {
                    const envVal = process.env[envKey]
                    if (!envVal) { continue }
                    const parsed = parseEnvUrl(envVal)
                    if (!parsed) { continue }

                    if (parsed.baseUrl === blobBase) {
                      sasToken = parsed.sasToken
                      break
                    }
                  }
                  
                  if (!sasToken) continue
                  
                  // Score by filename relevance (higher = better match)
                  const blobFilename = (blobName.split('/').pop() || '').toLowerCase()
                  let score = 0
                  
                  // Exact full search query in filename (best)
                  if (blobFilename.includes(searchLower)) score += 100
                  // G.R. number match (very strong for jurisprudence)
                  if (grNumber && blobFilename.includes(grNumber)) score += 80
                  // Surname match (strong for case names)
                  if (surname && surname.length > 2 && blobFilename.includes(surname)) score += 60
                  // Individual term matches
                  for (const term of terms) {
                    const tl = term.toLowerCase()
                    if (tl.length > 2 && blobFilename.includes(tl)) score += 10
                  }
                  candidates.push({ blobName, blobBase, sasToken, score, originalEncodedPath })
                } catch {
                  continue
                }
              }
            }
            
            // Sort candidates by score (highest first)
            candidates.sort((a, b) => b.score - a.score)
            
            for (const candidate of candidates) {
              // For bar exam source, trust the Azure Search results -- the index already filtered
              // by relevance, so don't require strict filename matching
              // For other sources, skip zero-score candidates (wrong documents that mention the term)
              if (candidate.score === 0 && source !== 'barexam') continue
              
              // Use the original encoded path from the search index, with special chars encoded
              const safePath = candidate.originalEncodedPath
                .replace(/\[/g, '%5B')
                .replace(/\]/g, '%5D')
                .replace(/\{/g, '%7B')
                .replace(/\}/g, '%7D')
              const resolvedUrl = `${candidate.blobBase}/${safePath}?${candidate.sasToken}`
              return NextResponse.json({ url: resolvedUrl, name: candidate.blobName })
            }
            
            // Do NOT fall back to score-0 candidates -- those are wrong documents
            // that merely mention the search term in their content.
          } catch {
            continue
          }
        }
      }

      // --- STEP 3: Last resort -- search ALL containers by partial filename match ---
      {
        const allKeys = source === 'barexam'
          ? ['CB']
          : ['C1', 'C2', 'CB']
        
        const blobSearchTerms: string[] = []
        const lawNum = search.match(/(?:R\.A\.|RA|Republic Act|P\.D\.|PD|Presidential Decree)\s*(?:No\.?)?\s*(\d+)/i)
        const grNum = search.match(/G\.R\.\s*No[s]?\.\s*(?:L-)?(\d+[-\d]*)/i)
        const caseNameMatch = search.match(/v[s]?\.\s+([A-Za-zÀ-ÿñÑ]+(?:\s+[A-Za-zÀ-ÿñÑ]+){0,2})/i)
        if (lawNum) blobSearchTerms.push(lawNum[1])
        if (grNum) blobSearchTerms.push(grNum[1])
        if (caseNameMatch) blobSearchTerms.push(caseNameMatch[1].trim())
        if (blobSearchTerms.length === 0) blobSearchTerms.push(search.replace(/[*_#]/g, '').trim())

        for (const containerLabel of allKeys) {
          const envKey = CONTAINER_MAP[containerLabel]
          const envVal = process.env[envKey]
          if (!envVal) continue
          const parsed = parseEnvUrl(envVal)
          if (!parsed) continue

          try {
            let marker = ''
            const allNames: string[] = []
            for (let page = 0; page < 5; page++) {
              const markerParam = marker ? `&marker=${encodeURIComponent(marker)}` : ''
              const listUrl = `${parsed.baseUrl}?restype=container&comp=list&maxresults=5000${markerParam}&${parsed.sasToken}`
              const resp = await fetch(listUrl)
              if (!resp.ok) break
              const xml = await resp.text()
              const nameRegex = /<Name>([^<]+)<\/Name>/g
              let m2
              while ((m2 = nameRegex.exec(xml)) !== null) {
                allNames.push(m2[1]
                  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                  .replace(/&apos;/g, "'").replace(/&quot;/g, '"')
                  .replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) => String.fromCharCode(parseInt(hex, 16)))
                  .replace(/&#(\d+);/g, (_: string, dec: string) => String.fromCharCode(parseInt(dec, 10))))
              }
              const nextMarkerMatch = xml.match(/<NextMarker>([^<]+)<\/NextMarker>/)
              if (nextMarkerMatch?.[1]) { marker = nextMarkerMatch[1] } else { break }
            }

            for (const term of blobSearchTerms) {
              const termLower = term.toLowerCase()
              const candidates = allNames.filter(name => name.toLowerCase().includes(termLower))
              if (candidates.length > 0) {
                const bestMatch = candidates.find(name => {
                  const filename = (name.split('/').pop() || '').toLowerCase()
                  return filename.includes(termLower)
                }) || candidates[0]
                const encodedPath = bestMatch.split('/').map(s => encodeAzureBlobSegment(s)).join('/')
                const blobUrl = `${parsed.baseUrl}/${encodedPath}?${parsed.sasToken}`
                const displayName = bestMatch.split('/').pop() || bestMatch
                return NextResponse.json({ url: blobUrl, name: displayName })
              }
            }
          } catch { continue }
        }
      }

      return NextResponse.json({
        error: 'Document not found',
        search,
        termsSearched: terms,
        hint: 'Try searching the Supreme Court E-Library at elibrary.judiciary.gov.ph'
      }, { status: 404 })
    }

    return NextResponse.json({ error: 'Missing parameters. Use ?search=... or ?index=...&file=...' }, { status: 400 })
  } catch (err) {
    console.error('[v0] Documents API error:', err)
    return NextResponse.json({ error: 'Failed to fetch document', detail: String(err) }, { status: 500 })
  }
}
