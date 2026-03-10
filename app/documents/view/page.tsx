'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect, Suspense } from 'react'
import { ArrowLeft, FileText, ExternalLink, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

function DocumentViewer() {
  const searchParams = useSearchParams()
  const search = searchParams.get('search')
  const index = searchParams.get('index')
  const file = searchParams.get('file')
  const type = searchParams.get('type')
  const q = searchParams.get('q')
  const article = searchParams.get('article') || q
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  const displayName = type === 'rpc' 
    ? `Revised Penal Code${article ? ` - ${article}` : ''}` 
    : file || search || 'Document'

  // Build the API URL to get the direct blob URL
  let apiUrl = ''
  if (type === 'rpc') {
    apiUrl = `/api/documents?type=rpc${q ? `&q=${encodeURIComponent(q)}` : article ? `&article=${encodeURIComponent(article)}` : ''}`
  } else if (search) {
    apiUrl = `/api/documents?search=${encodeURIComponent(search)}`
  } else if (index && file) {
    apiUrl = `/api/documents?index=${encodeURIComponent(index)}&file=${encodeURIComponent(file)}`
  }

  useEffect(() => {
    if (!apiUrl) return

    async function fetchDocUrl() {
      try {
        console.log('[v0] Fetching document URL from:', apiUrl)
        const res = await fetch(apiUrl)
        const data = await res.json()
        
        console.log('[v0] Document API response:', res.status, data.url ? 'has URL' : 'no URL', data.error || '')
        
        if (data.url) {
          setPdfUrl(data.url)
          setLoading(false)
          return
        }
        
        setError(data.error || 'Document not found')
        setLoading(false)
      } catch (err) {
        console.error('[v0] Error fetching document URL:', err)
        setError('Failed to load document')
        setLoading(false)
      }
    }
    
    fetchDocUrl()
  }, [apiUrl])

  if (!apiUrl) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-4">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-muted-foreground">No document specified.</p>
        <Button variant="outline" onClick={() => window.close()}>Close</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <Button variant="ghost" size="sm" onClick={() => window.close()} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Close
        </Button>
        <div className="h-5 w-px bg-border" />
        <FileText className="w-4 h-4 text-primary shrink-0" />
        <p className="text-sm font-medium text-foreground truncate">{displayName}</p>
        {pdfUrl && (
          <a 
            href={pdfUrl} 
            target="_blank" 
            rel="noopener noreferrer"
            className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" />
            Open directly
          </a>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex flex-col items-center justify-center flex-1 gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading document...</p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center justify-center flex-1 gap-6 px-4">
          <div className="flex flex-col items-center gap-3 max-w-md text-center">
            <AlertCircle className="w-10 h-10 text-destructive" />
            <h2 className="text-lg font-semibold">Could not load document</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <a href="https://elibrary.judiciary.gov.ph" target="_blank" rel="noopener noreferrer">
                SC E-Library
              </a>
            </Button>
            <Button variant="outline" onClick={() => window.close()}>Close</Button>
          </div>
        </div>
      )}

      {/* Search hint bar for article/provision lookups */}
      {pdfUrl && !error && (article || search) && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2.5 flex items-center gap-3 text-sm shrink-0">
          <svg className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <span className="text-amber-800 dark:text-amber-200">
            {'To jump to '}<strong>{article || search}</strong>{', press '}
            <kbd className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900 border border-amber-300 dark:border-amber-700 rounded text-xs font-mono">Ctrl+F</kbd>
            {' (or '}
            <kbd className="px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900 border border-amber-300 dark:border-amber-700 rounded text-xs font-mono">Cmd+F</kbd>
            {' on Mac) and search for "'}
            <strong>{article || search}</strong>
            {'"'}
          </span>
        </div>
      )}

      {/* PDF viewer */}
      {pdfUrl && !error && (
        <iframe
          src={pdfUrl}
          className="flex-1 w-full border-0"
          title={displayName}
          onLoad={() => setLoading(false)}
          onError={() => { setLoading(false); setError('Could not display document. Try the "Open directly" link.') }}
        />
      )}
    </div>
  )
}

export default function DocumentViewPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    }>
      <DocumentViewer />
    </Suspense>
  )
}
