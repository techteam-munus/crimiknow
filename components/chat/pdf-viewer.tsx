'use client'

import { useState, useEffect, useRef } from 'react'
import { X, Maximize2, Minimize2 } from 'lucide-react'

interface PdfViewerProps {
  url: string
  title: string
  onClose: () => void
}

export function PdfViewer({ url, title, onClose }: PdfViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | false>(false)
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)

  // Fetch the PDF as a blob and create a local object URL
  // This hides the real Azure blob URL from the user
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(false)
    setBlobUrl(null)

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }

    fetch(url)
      .then(resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        return resp.blob()
      })
      .then(blob => {
        if (cancelled) return
        const localUrl = URL.createObjectURL(blob)
        blobUrlRef.current = localUrl
        setBlobUrl(localUrl)
        setLoading(false)
      })
      .catch(() => {
        if (!cancelled) {
          setError('The document could not be loaded. It may have been moved or renamed.')
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
    }
  }, [url])

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className={`bg-background flex flex-col shadow-2xl transition-all duration-300 ${
          isFullscreen ? 'w-full' : 'w-full md:w-3/4 lg:w-2/3'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/50">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <svg className="w-4 h-4 shrink-0 text-primary" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <h3 className="text-sm font-medium truncate">{title}</h3>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* PDF Content - no download, no copy, no URL exposure */}
        <div
          className="flex-1 relative overflow-hidden select-none"
          onContextMenu={(e) => e.preventDefault()}
        >
          {loading && !error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">Loading document...</p>
              </div>
            </div>
          )}
          {error ? (
            <div className="absolute inset-0 flex items-center justify-center bg-background">
              <div className="flex flex-col items-center gap-4 text-center px-6 max-w-md">
                <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                  <X className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground mb-1">Unable to load document</p>
                  <p className="text-xs text-muted-foreground">{typeof error === 'string' ? error : 'The document could not be displayed.'}</p>
                </div>
              </div>
            </div>
          ) : blobUrl ? (
            <iframe
              src={`${blobUrl}#toolbar=0&navpanes=0`}
              className="w-full h-full border-0"
              title={title}
              sandbox="allow-same-origin allow-scripts"
            />
          ) : null}
        </div>
      </div>
    </div>
  )
}
