/**
 * Azure Blob Storage utility using pre-generated SAS tokens.
 * No crypto libraries or SDKs needed -- just URL construction.
 * 
 * Each env var contains the FULL container URL with SAS token appended:
 * e.g., https://crimiknowindex.blob.core.windows.net/cki?sv=2023-...&sig=...
 */

const CONTAINER_MAP: Record<string, { envKey: string; description: string }> = {
  CI:  { envKey: 'AZURE_BLOB_URL_CI',  description: 'CrimiKnow Index' },
  C1:  { envKey: 'AZURE_BLOB_URL_C1',  description: 'CrimiKnow Academe' },
  C2:  { envKey: 'AZURE_BLOB_URL_C2',  description: 'CrimiKnow Academe 2' },
  CB:  { envKey: 'AZURE_BLOB_URL_CB',  description: 'Bar Exam Materials' },
}

function parseContainerUrl(fullUrl: string): { baseUrl: string; sasToken: string } | null {
  const qIdx = fullUrl.indexOf('?')
  if (qIdx === -1) return null
  return {
    baseUrl: fullUrl.substring(0, qIdx),
    sasToken: fullUrl.substring(qIdx + 1),
  }
}

/**
 * Construct a direct blob URL with SAS token for a given index and filename.
 * Returns null if the index env var is not configured.
 */
export async function getDirectBlobUrl(index: string, blobName: string): Promise<string | null> {
  const entry = CONTAINER_MAP[index.toUpperCase()]
  if (!entry) return null
  
  const fullUrl = process.env[entry.envKey]
  if (!fullUrl) return null
  
  const parsed = parseContainerUrl(fullUrl)
  if (!parsed) return null
  
  return `${parsed.baseUrl}/${encodeURIComponent(blobName)}?${parsed.sasToken}`
}

/**
 * Get configured container labels and descriptions.
 */
export async function getConfiguredContainers(): Promise<{ label: string; description: string; configured: boolean }[]> {
  return Object.entries(CONTAINER_MAP).map(([label, entry]) => ({
    label,
    description: entry.description,
    configured: !!process.env[entry.envKey],
  }))
}

/**
 * Search for a PDF by listing blobs across all containers.
 * NOTE: SAS tokens must have read + list permissions (sp=rl).
 * Returns the first matching blob's direct URL.
 */
export async function searchForDocument(query: string): Promise<{
  url: string
  blobName: string
  index: string
  description: string
} | null> {
  const terms = extractSearchTerms(query)
  if (terms.length === 0) return null
  
  for (const [label, entry] of Object.entries(CONTAINER_MAP)) {
    const fullUrl = process.env[entry.envKey]
    if (!fullUrl) continue
    
    const parsed = parseContainerUrl(fullUrl)
    if (!parsed) continue
    
    try {
      const listUrl = `${parsed.baseUrl}?restype=container&comp=list&${parsed.sasToken}`
      const response = await fetch(listUrl)
      if (!response.ok) continue
      
      const xml = await response.text()
      const names: string[] = []
      const re = /<Name>([^<]+)<\/Name>/g
      let m
      while ((m = re.exec(xml)) !== null) {
        if (m[1].toLowerCase().endsWith('.pdf')) {
          names.push(m[1])
        }
      }
      
      for (const term of terms) {
        const match = names.find(n => n.toLowerCase().includes(term.toLowerCase()))
        if (match) {
          return {
            url: `${parsed.baseUrl}/${encodeURIComponent(match)}?${parsed.sasToken}`,
            blobName: match,
            index: label,
            description: entry.description,
          }
        }
      }
    } catch {
      continue
    }
  }
  
  return null
}

/**
 * Expand abbreviations to match actual PDF filenames.
 * e.g., "R.A. No. 9346" -> ["Republic Act No. 9346", "9346", "R.A. No. 9346"]
 */
function extractSearchTerms(query: string): string[] {
  const terms: string[] = []
  
  // Abbreviation expansions
  const abbreviations: Record<string, string> = {
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
  
  // Expand abbreviated law citations: "R.A. No. 9346" -> "Republic Act No. 9346"
  const lawMatch = query.match(/(?:R\.A\.|RA|P\.D\.|PD|B\.P\.|BP|E\.O\.|EO|A\.M\.|AM)\s*(?:No\.)?\s*(\d+)/i)
  if (lawMatch) {
    // Add the number itself (most reliable match)
    terms.push(lawMatch[1])
    
    // Build the expanded form: "Republic Act No. 9346"
    const abbrev = query.match(/(R\.A\.|RA|P\.D\.|PD|B\.P\.|BP|E\.O\.|EO|A\.M\.|AM)/i)
    if (abbrev) {
      const expanded = abbreviations[abbrev[1].toUpperCase()] || abbreviations[abbrev[1]]
      if (expanded) {
        terms.push(`${expanded} No. ${lawMatch[1]}`)
        terms.push(`${expanded} ${lawMatch[1]}`)
      }
    }
  }
  
  // Full law name citations: "Republic Act No. 9346"
  const fullLawMatch = query.match(/(?:Republic Act|Presidential Decree|Batas Pambansa|Executive Order|Act)\s*(?:No\.)?\s*(\d+)/i)
  if (fullLawMatch) {
    terms.push(fullLawMatch[1])
    terms.push(fullLawMatch[0].trim())
  }
  
  // G.R. number
  const grMatch = query.match(/G\.R\.\s*No[s]?\.\s*(?:L-)?(\d+)/i)
  if (grMatch) {
    terms.push(grMatch[1])
    terms.push(`G.R. No. ${grMatch[1]}`)
  }
  
  // Surname from "v." pattern: "People v. Tumalin" -> "Tumalin"
  const vsMatch = query.match(/v[s]?\.\s+([A-ZÀ-ÿñÑ][a-zà-ÿñ]+)/i)
  if (vsMatch) terms.push(vsMatch[1])
  
  // Named laws
  const namedMatch = query.match(/(Revised Penal Code|Dangerous Drugs Act|Cybercrime Prevention Act|Anti-[A-Za-z\s]+(?:Act|Law)|Data Privacy Act|Intellectual Property Code)/i)
  if (namedMatch) terms.push(namedMatch[1].trim())
  
  // Fallback: use cleaned query
  if (terms.length === 0) {
    const cleaned = query.replace(/[*_#]/g, '').trim()
    if (cleaned.length > 3) terms.push(cleaned)
  }
  
  // Deduplicate
  return [...new Set(terms)]
}
