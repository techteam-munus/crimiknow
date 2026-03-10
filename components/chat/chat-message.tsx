'use client'

import { useState, useRef } from 'react'
import { User, ThumbsUp, ThumbsDown, Copy, Download, Check, ChevronDown, FileText, FileType, FileDown } from 'lucide-react'
import { CrimiKnowIcon } from '@/components/ui/crimiknow-logo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PdfViewer } from '@/components/chat/pdf-viewer'
import type { Message } from '@/hooks/use-azure-chat'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ChatMessageProps {
  message: Message & { id?: string; rating?: number }
  onRatingChange?: (messageId: string, rating: number) => void
  isFreeTier?: boolean
}

export function ChatMessage({ message, onRatingChange, isFreeTier = false }: ChatMessageProps) {
  const isUser = message.role === 'user'
  const text = message.content
  const [currentRating, setCurrentRating] = useState<number>(message.rating || 0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pdfViewer, setPdfViewer] = useState<{ url: string; title: string } | null>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const handleCopy = async () => {
    try {
      // Get the rendered HTML content from the DOM
      if (contentRef.current) {
        const htmlContent = contentRef.current.innerHTML
        const plainText = contentRef.current.innerText
        
        // Copy both HTML and plain text formats so paste works in rich text editors
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([htmlContent], { type: 'text/html' }),
            'text/plain': new Blob([plainText], { type: 'text/plain' }),
          }),
        ])
      } else {
        await navigator.clipboard.writeText(text)
      }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      // Fallback to plain text if ClipboardItem is not supported
      try {
        await navigator.clipboard.writeText(text)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch (e) {
        console.error('Failed to copy:', e)
      }
    }
  }

  // Clean HTML content for downloads: replace button citation links with bold underlined text
  const getCleanHtml = () => {
    const raw = contentRef.current?.innerHTML || text
    // Replace <button ...><svg ...>...</svg>text</button> with <b><u>text</u></b>
    // Also replace any remaining <button> tags
    return raw
      .replace(/<button[^>]*>(?:<svg[^>]*>[\s\S]*?<\/svg>)?\s*([\s\S]*?)<\/button>/gi, '<b><u>$1</u></b>')
      .replace(/<button[^>]*>([\s\S]*?)<\/button>/gi, '<b><u>$1</u></b>')
  }

  const docStyles = `
    body {
      font-family: 'Georgia', 'Times New Roman', serif;
      line-height: 1.7;
      max-width: 750px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #1a1a1a;
      font-size: 11pt;
    }
    h1, h2, h3, h4 { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-weight: 600; }
    h1 { font-size: 1.6em; margin-top: 1.8em; margin-bottom: 0.6em; border-bottom: 2px solid #166534; padding-bottom: 0.3em; }
    h2 { font-size: 1.35em; margin-top: 1.6em; margin-bottom: 0.5em; color: #166534; }
    h3 { font-size: 1.15em; margin-top: 1.4em; margin-bottom: 0.4em; }
    h4 { font-size: 1.05em; margin-top: 1.2em; margin-bottom: 0.3em; }
    p { margin: 0.8em 0; text-align: justify; }
    ul, ol { margin: 0.8em 0; padding-left: 2em; }
    li { margin: 0.4em 0; }
    table { border-collapse: collapse; width: 100%; margin: 1.2em 0; page-break-inside: avoid; font-size: 10pt; }
    th, td { border: 1px solid #9ca3af; padding: 8px 12px; text-align: left; }
    th { background-color: #166534 !important; color: white !important; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    tr:nth-child(even) { background-color: #f0fdf4 !important; }
    tr:nth-child(odd) { background-color: #ffffff; }
    td { vertical-align: top; }
    strong, b { font-weight: 700; }
    em { font-style: italic; }
    code { background-color: #f3f4f6; padding: 2px 6px; border-radius: 3px; font-size: 0.9em; font-family: 'Courier New', monospace; }
    pre { background-color: #f3f4f6; padding: 14px; border-radius: 6px; overflow-x: auto; font-size: 0.85em; }
    blockquote { border-left: 4px solid #166534; margin: 1em 0; padding: 0.5em 1em; color: #374151; background-color: #f0fdf4; }
    hr { border: none; border-top: 1px solid #d1d5db; margin: 1.5em 0; }
    a { color: #166534; text-decoration: underline; }
    .header { text-align: center; margin-bottom: 2.5em; padding-bottom: 1.2em; border-bottom: 2px solid #166534; }
    .header h1 { border: none; margin: 0; color: #166534; font-size: 1.8em; }
    .header p { color: #6b7280; margin: 0.3em 0 0 0; font-style: italic; }
    .content { min-height: 200px; }
    .content > *:first-child { margin-top: 0; }
    .footer { margin-top: 3em; padding-top: 1em; border-top: 1px solid #d1d5db; text-align: center; color: #9ca3af; font-size: 0.8em; }
  `

  const buildHtmlDoc = (content: string, includeScript?: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CrimiKnow Response - ${new Date().toLocaleDateString()}</title>
  <style>
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .no-print { display: none !important; }
      @page { margin: 1.5cm 2cm; size: A4; }
    }
    ${docStyles}
  </style>
</head>
<body>
  <div class="header">
    <h1>CrimiKnow</h1>
    <p>AI-Powered Library for Philippine Criminal Law</p>
  </div>
  <div class="content">${content}</div>
  <div class="footer">
    <p>Generated by CrimiKnow on ${new Date().toLocaleString()}</p>
    <p>This document is for educational and reference purposes only.</p>
  </div>
  ${includeScript || ''}
</body>
</html>`

  const handleDownloadPdf = () => {
    const html = buildHtmlDoc(getCleanHtml(), `<script>window.onload=function(){setTimeout(function(){window.print();},500)};</script>`)
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
    }
  }

  const handleDownloadHtml = () => {
    const html = buildHtmlDoc(getCleanHtml())
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `crimiknow-response-${new Date().toISOString().slice(0, 10)}.html`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleDownloadWord = () => {
    // Word-compatible HTML with mso styles
    const wordHtml = `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>
    ${docStyles}
    /* Word-specific table fixes */
    table { mso-table-lspace: 0; mso-table-rspace: 0; }
    th { mso-style-textfill-fill-color: #166534; background: #166534; color: white; }
  </style>
</head>
<body>
  <div class="header">
    <h1>CrimiKnow</h1>
    <p>AI-Powered Library for Philippine Criminal Law</p>
  </div>
  <div class="content">${getCleanHtml()}</div>
  <div class="footer">
    <p>Generated by CrimiKnow on ${new Date().toLocaleString()}</p>
    <p>This document is for educational and reference purposes only.</p>
  </div>
</body>
</html>`
    const blob = new Blob(['\ufeff' + wordHtml], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `crimiknow-response-${new Date().toISOString().slice(0, 10)}.doc`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleRating = async (rating: number) => {
    if (!message.id || isSubmitting) return
    
    // Toggle off if clicking same rating
    const newRating = currentRating === rating ? 0 : rating
    
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/chat/messages/${message.id}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating: newRating }),
      })
      
      if (res.ok) {
        setCurrentRating(newRating)
        onRatingChange?.(message.id, newRating)
      }
    } catch (error) {
      console.error('Failed to update rating:', error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (<>
    <div
      className={cn(
        'flex gap-2 sm:gap-4 py-4 sm:py-5 w-full',
        isUser ? 'flex-row-reverse' : 'flex-row'
      )}
    >
      <div
        className={cn(
          'flex items-center justify-center w-9 h-9 rounded-xl shrink-0 mt-1',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'
        )}
      >
        {isUser ? (
          <User className="w-4 h-4" />
        ) : (
          <CrimiKnowIcon className="w-5 h-5" />
        )}
      </div>
      <div
        className={cn(
          'rounded-xl px-4 py-4 sm:px-6 sm:py-5 min-w-0',
          isUser
            ? 'bg-primary text-primary-foreground ml-auto max-w-[85%] sm:max-w-[75%]'
            : 'bg-card border border-border text-card-foreground flex-1 w-full'
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words">{text}</div>
        ) : (
          <>
            <div ref={contentRef} className="prose prose-sm sm:prose-base lg:prose-lg max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:text-foreground prose-h1:mt-8 prose-h1:mb-4 prose-h2:mt-7 prose-h2:mb-3 prose-h3:mt-6 prose-h3:mb-2 prose-h4:mt-5 prose-h4:mb-2 prose-p:text-foreground/90 prose-p:leading-relaxed prose-p:mb-4 prose-strong:text-foreground prose-li:text-foreground/90 prose-li:mb-1.5 prose-ul:mb-5 prose-ul:mt-2 prose-ol:mb-5 prose-ol:mt-2 prose-hr:my-8 prose-blockquote:my-5 overflow-x-auto break-words [overflow-wrap:anywhere] [&>*+h1]:mt-10 [&>*+h2]:mt-8 [&>*+h3]:mt-7 [&>*+h4]:mt-6 [&_li>ul]:mt-2 [&_li>ol]:mt-2 [&_li>p]:mb-2">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4 rounded-lg border-2 border-border">
                      <table className="w-full border-collapse text-sm">{children}</table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-muted/70 border-b-2 border-border">{children}</thead>
                  ),
                  tbody: ({ children }) => (
                    <tbody className="divide-y divide-border">{children}</tbody>
                  ),
                  tr: ({ children }) => (
                    <tr className="border-b border-border hover:bg-muted/30 transition-colors">{children}</tr>
                  ),
                  th: ({ children }) => (
                    <th className="px-4 py-3 text-left font-semibold text-foreground border-r border-border last:border-r-0 whitespace-nowrap">{children}</th>
                  ),
                  td: ({ children }) => (
                    <td className="px-4 py-3 text-foreground/90 border-r border-border last:border-r-0 align-top">{children}</td>
                  ),
                  a: ({ href, children }) => {
                    const isDocLink = href?.startsWith('/api/documents')
                    if (isDocLink && href) {
                      return (
                        <button
                          type="button"
                          onClick={async (e) => {
                            e.preventDefault()
                            try {
                              const urlObj = new URL(href, window.location.origin)
                              const search = urlObj.searchParams.get('search')
                              const type = urlObj.searchParams.get('type')
                              const q = urlObj.searchParams.get('q')
                              const source = urlObj.searchParams.get('source')

                              // Resolve via proxy (server streams the PDF, avoids blob URL encoding issues)
                              const res = await fetch('/api/documents/proxy', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ search, type, q, source }),
                              })
                              
                              // Safely parse response -- may not be JSON if server errors
                              let data
                              const resContentType = res.headers.get('content-type') || ''
                              if (resContentType.includes('application/json')) {
                                data = await res.json()
                              } else {
                                alert('This document was not found in the knowledge base. It may only be referenced within another document.')
                                return
                              }

                              if (data.token) {
                                // Fetch the PDF as a blob, then open via object URL in new tab
                                const pdfRes = await fetch(`/api/documents/proxy?token=${encodeURIComponent(data.token)}`)
                                const contentType = pdfRes.headers.get('content-type') || ''
                                
                                // Handle 404 / non-PDF responses gracefully
                                if (!pdfRes.ok || (!contentType.includes('application/pdf') && !contentType.includes('application/octet-stream'))) {
                                  // Try to parse error JSON from proxy
                                  let errorMsg = 'This document could not be loaded. The file may have been moved or renamed in storage.'
                                  try {
                                    if (contentType.includes('application/json')) {
                                      const errorData = await pdfRes.json()
                                      if (errorData.error) errorMsg = errorData.error
                                    }
                                  } catch { /* use default message */ }
                                  alert(errorMsg)
                                  return
                                }
                                
                                const blob = await pdfRes.blob()
                                if (blob.size < 100) {
                                  alert('This document appears to be empty or corrupted. It may have been moved or renamed in storage.')
                                  return
                                }
                                const pdfBlob = new Blob([blob], { type: 'application/pdf' })
                                const blobUrl = URL.createObjectURL(pdfBlob)
                                window.open(blobUrl, '_blank')
                                setTimeout(() => URL.revokeObjectURL(blobUrl), 60000)
                              } else {
                                alert(data.error || 'This document was not found in the knowledge base. It may only be referenced within another document.')
                              }
                            } catch {
                              alert('This document was not found. It may only be referenced within another document.')
                            }
                          }}
                          className="text-primary font-medium no-underline inline-flex items-center gap-1 bg-primary/5 hover:bg-primary/10 px-1.5 py-0.5 rounded text-sm border border-primary/20 transition-colors cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                            <line x1="16" y1="13" x2="8" y2="13"/>
                            <line x1="16" y1="17" x2="8" y2="17"/>
                            <polyline points="10 9 9 9 8 9"/>
                          </svg>
                          {children}
                        </button>
                      )
                    }
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 text-primary hover:text-primary/80 transition-colors"
                      >
                        {children}
                      </a>
                    )
                  },
                }}
              >
                {text}
              </ReactMarkdown>
            </div>
            
            {/* Action buttons for assistant messages */}
            <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-3 border-t border-border/50">
              <div className="flex items-center gap-1 sm:gap-2">
                <span className="text-xs text-muted-foreground mr-1 sm:mr-2 hidden sm:inline">Was this helpful?</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRating(1)}
                  disabled={isSubmitting}
                  className={cn(
                    "h-8 px-2 gap-1",
                    currentRating === 1 && "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400"
                  )}
                >
                  <ThumbsUp className="h-4 w-4" />
                  <span className="text-xs">Yes</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRating(-1)}
                  disabled={isSubmitting}
                  className={cn(
                    "h-8 px-2 gap-1",
                    currentRating === -1 && "bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400"
                  )}
                >
                  <ThumbsDown className="h-4 w-4" />
                  <span className="text-xs">No</span>
                </Button>
              </div>
              
              {/* Copy and Download buttons */}
              <TooltipProvider>
                <div className="flex items-center gap-1">
                  {!isFreeTier && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleCopy}
                          className="h-8 px-2"
                        >
                          {copied ? (
                            <Check className="h-4 w-4 text-green-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{copied ? 'Copied!' : 'Copy response'}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  
                  {!isFreeTier && (
                    <DropdownMenu>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 gap-0.5"
                            >
                              <Download className="h-4 w-4" />
                              <ChevronDown className="h-3 w-3 opacity-50" />
                            </Button>
                          </DropdownMenuTrigger>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Download response</p>
                        </TooltipContent>
                      </Tooltip>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={handleDownloadPdf} className="gap-2 cursor-pointer">
                          <FileDown className="h-4 w-4" />
                          <span>Save as PDF</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDownloadHtml} className="gap-2 cursor-pointer">
                          <FileType className="h-4 w-4" />
                          <span>Save as HTML</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleDownloadWord} className="gap-2 cursor-pointer">
                          <FileText className="h-4 w-4" />
                          <span>Save as Word</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </TooltipProvider>
            </div>
          </>
        )}
      </div>
    </div>
    {pdfViewer && (
      <PdfViewer
        url={pdfViewer.url}
        title={pdfViewer.title}
        onClose={() => setPdfViewer(null)}
      />
    )}
  </>
  )
}
