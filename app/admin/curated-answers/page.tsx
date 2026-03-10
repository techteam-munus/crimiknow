'use client'

import React from "react"

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Loader2,
  ArrowLeft,
  RefreshCw,
  Pencil,
  Plus,
  MessageSquare,
  Maximize2,
  Minimize2,
  GripVertical,
  ChevronDown,
  ChevronUp,
  Eye,
  Code,
  Bold,
  Italic,
  List,
  ListOrdered,
  Table2,
  Heading2,
  Undo2,
} from 'lucide-react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface CuratedAnswer {
  id: string
  question: string
  answer: string
  rating_status: 'thumbs_up' | 'thumbs_down' | 'unreviewed'
  is_active: boolean
  source_message_id: string | null
  created_at: string
  updated_at: string
}

export default function CuratedAnswersPage() {
  const [answers, setAnswers] = useState<CuratedAnswer[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [ratingFilter, setRatingFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalAnswers, setTotalAnswers] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState('')

  // Edit dialog state
  const [editItem, setEditItem] = useState<CuratedAnswer | null>(null)
  const [editQuestion, setEditQuestion] = useState('')
  const [editAnswer, setEditAnswer] = useState('')
  const [editRating, setEditRating] = useState<'thumbs_up' | 'thumbs_down' | 'unreviewed'>('unreviewed')
  const [saving, setSaving] = useState(false)

  // Preview toggle states
  const [editTab, setEditTab] = useState<'edit' | 'preview'>('preview')
  const [addTab, setAddTab] = useState<'edit' | 'preview'>('edit')

  // Dialog expand states
  const [editExpanded, setEditExpanded] = useState(false)
  const [addExpanded, setAddExpanded] = useState(false)

  // Column resize state
  const [columnWidths, setColumnWidths] = useState<number[]>([30, 40, 10, 10, 10])
  const resizingCol = useRef<number | null>(null)
  const startX = useRef(0)
  const startWidths = useRef<number[]>([])
  const tableRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (colIndex: number, e: React.MouseEvent) => {
    e.preventDefault()
    resizingCol.current = colIndex
    startX.current = e.clientX
    startWidths.current = [...columnWidths]
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (resizingCol.current === null || !tableRef.current) return
    const tableWidth = tableRef.current.offsetWidth
    const deltaX = e.clientX - startX.current
    const deltaPercent = (deltaX / tableWidth) * 100
    const colIdx = resizingCol.current
    const newWidths = [...startWidths.current]
    const newLeft = Math.max(5, newWidths[colIdx] + deltaPercent)
    const newRight = Math.max(5, newWidths[colIdx + 1] - deltaPercent)
    newWidths[colIdx] = newLeft
    newWidths[colIdx + 1] = newRight
    setColumnWidths(newWidths)
  }, [])

  const handleMouseUp = useCallback(() => {
    resizingCol.current = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove])

  // Add dialog state
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newAnswer, setNewAnswer] = useState('')
  const [newRating, setNewRating] = useState<'thumbs_up' | 'thumbs_down' | 'unreviewed'>('unreviewed')
  const [adding, setAdding] = useState(false)

  // Row expand state
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Expanded row split resizer
  const [expandSplit, setExpandSplit] = useState(25) // question takes 25%, answer takes 75%
  const expandResizing = useRef(false)
  const expandStartX = useRef(0)
  const expandStartSplit = useRef(25)
  const expandContainerRef = useRef<HTMLDivElement | null>(null)

  const handleExpandResizeDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    expandResizing.current = true
    expandStartX.current = e.clientX
    expandStartSplit.current = expandSplit
    document.addEventListener('mousemove', handleExpandResizeMove)
    document.addEventListener('mouseup', handleExpandResizeUp)
  }

  const handleExpandResizeMove = useCallback((e: MouseEvent) => {
    if (!expandResizing.current || !expandContainerRef.current) return
    const containerWidth = expandContainerRef.current.offsetWidth
    const deltaX = e.clientX - expandStartX.current
    const deltaPercent = (deltaX / containerWidth) * 100
    const newSplit = Math.min(60, Math.max(15, expandStartSplit.current + deltaPercent))
    setExpandSplit(newSplit)
  }, [])

  const handleExpandResizeUp = useCallback(() => {
    expandResizing.current = false
    document.removeEventListener('mousemove', handleExpandResizeMove)
    document.removeEventListener('mouseup', handleExpandResizeUp)
  }, [handleExpandResizeMove])

  // Delete dialog state
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchAnswers = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '15',
        rating: ratingFilter,
        ...(search && { search }),
      })
      const res = await fetch(`/api/admin/curated-answers?${params}`)
      if (res.ok) {
        const data = await res.json()
        setAnswers(data.answers)
        setTotalPages(data.totalPages)
        setTotalAnswers(data.total)
      }
    } catch (error) {
      console.error('Error fetching curated answers:', error)
    } finally {
      setLoading(false)
    }
  }, [page, search, ratingFilter])

  useEffect(() => {
    fetchAnswers()
  }, [fetchAnswers])

  const handleSync = async () => {
    setSyncing(true)
    setSyncMessage('')
    try {
      const res = await fetch('/api/admin/curated-answers/sync', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setSyncMessage(data.message)
        fetchAnswers()
      }
    } catch (error) {
      console.error('Error syncing:', error)
      setSyncMessage('Sync failed')
    } finally {
      setSyncing(false)
      setTimeout(() => setSyncMessage(''), 5000)
    }
  }

  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  const handleFilterChange = (value: string) => {
    setRatingFilter(value)
    setPage(1)
  }

  const openEditDialog = (item: CuratedAnswer) => {
    setEditItem(item)
    setEditQuestion(item.question)
    setEditAnswer(item.answer)
    setEditRating(item.rating_status)
  }

  const handleSaveEdit = async () => {
    if (!editItem) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/curated-answers/${editItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: editQuestion,
          answer: editAnswer,
          rating_status: editRating,
        }),
      })
      if (res.ok) {
        const updated = await res.json()
        setAnswers(prev =>
          prev.map(a => (a.id === updated.id ? updated : a))
        )
        setEditItem(null)
      }
    } catch (error) {
      console.error('Error saving:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) return
    setAdding(true)
    try {
      const res = await fetch('/api/admin/curated-answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: newQuestion,
          answer: newAnswer,
          rating_status: newRating,
        }),
      })
      if (res.ok) {
        setShowAddDialog(false)
        setNewQuestion('')
        setNewAnswer('')
        setNewRating('unreviewed')
        fetchAnswers()
      }
    } catch (error) {
      console.error('Error adding:', error)
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/curated-answers/${deleteId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setAnswers(prev => prev.filter(a => a.id !== deleteId))
        setTotalAnswers(prev => prev - 1)
      }
    } catch (error) {
      console.error('Error deleting:', error)
    } finally {
      setDeleting(false)
      setDeleteId(null)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const MarkdownPreview = ({ content }: { content: string }) => (
    <div className="prose prose-base max-w-none dark:prose-invert prose-headings:font-semibold prose-headings:text-foreground prose-p:text-foreground/90 prose-p:leading-relaxed prose-strong:text-foreground prose-li:text-foreground/90 overflow-x-auto">
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
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )

  const getRatingBadge = (ratingStatus: string) => {
    if (ratingStatus === 'thumbs_up') {
      return (
        <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
          <ThumbsUp className="h-3 w-3" />
          Good
        </Badge>
      )
    }
    if (ratingStatus === 'thumbs_down') {
      return (
        <Badge className="bg-red-100 text-red-700 border-red-200 gap-1">
          <ThumbsDown className="h-3 w-3" />
          Bad
        </Badge>
      )
    }
    return (
      <Badge variant="outline" className="gap-1 text-muted-foreground">
        <Minus className="h-3 w-3" />
        Unrated
      </Badge>
    )
  }

  const ratingCounts = {
    up: answers.filter(a => a.rating_status === 'thumbs_up').length,
    down: answers.filter(a => a.rating_status === 'thumbs_down').length,
    none: answers.filter(a => a.rating_status === 'unreviewed').length,
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4">
              <Link href="/admin">
                <Button variant="ghost" size="sm" className="shrink-0">
                  <ArrowLeft className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Back to Dashboard</span>
                </Button>
              </Link>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-foreground truncate">Q&A Knowledge Base</h1>
                <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block">
                  Manage curated answers - approved answers are served first before calling Azure AI
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSync}
                disabled={syncing}
                className="flex-1 sm:flex-none bg-transparent"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{syncing ? 'Syncing...' : 'Sync from Chat'}</span>
                <span className="sm:hidden">{syncing ? 'Sync...' : 'Sync'}</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setShowAddDialog(true)}
                className="bg-green-700 hover:bg-green-800 flex-1 sm:flex-none"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Q&A
              </Button>
            </div>
          </div>
          {syncMessage && (
            <p className="text-sm text-green-600 mt-2">{syncMessage}</p>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-blue-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalAnswers}</p>
                  <p className="text-xs text-muted-foreground">Total Q&A Pairs</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <ThumbsUp className="w-5 h-5 text-green-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{ratingCounts.up}</p>
                  <p className="text-xs text-muted-foreground">Approved (Thumbs Up)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 rounded-lg">
                  <ThumbsDown className="w-5 h-5 text-red-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{ratingCounts.down}</p>
                  <p className="text-xs text-muted-foreground">Rejected (Thumbs Down)</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 rounded-lg">
                  <Minus className="w-5 h-5 text-gray-700" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{ratingCounts.none}</p>
                  <p className="text-xs text-muted-foreground">Unrated</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-lg">All Questions & Answers</CardTitle>
                <CardDescription>{totalAnswers} total entries</CardDescription>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <Select value={ratingFilter} onValueChange={handleFilterChange}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Filter rating" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ratings</SelectItem>
                    <SelectItem value="up">Thumbs Up</SelectItem>
                    <SelectItem value="down">Thumbs Down</SelectItem>
                    <SelectItem value="none">Unrated</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search questions or answers..."
                    className="pl-9"
                    value={search}
                    onChange={(e) => handleSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto" ref={tableRef}>
                  <Table className="table-fixed w-full">
                    <TableHeader>
                      <TableRow>
                        {['', 'Question', 'Answer', 'Rating', 'Date', 'Actions'].map((heading, idx) => (
                          <TableHead
                            key={`${heading}-${idx}`}
                            className="relative align-middle select-none"
                            style={{ width: idx === 0 ? '40px' : `${columnWidths[idx - 1]}%` }}
                          >
                            <span className="block truncate">{heading}</span>
                            {idx > 0 && idx < 5 && (
                              <div
                                className="absolute top-0 right-0 h-full w-4 cursor-col-resize flex items-center justify-center z-10 group hover:bg-green-100/60 rounded"
                                onMouseDown={(e) => handleMouseDown(idx - 1, e)}
                              >
                                <GripVertical className="h-3 w-3 text-muted-foreground/40 group-hover:text-green-700 transition-colors" />
                              </div>
                            )}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {answers.map((item) => {
                        const isExpanded = expandedRows.has(item.id)
                        return (
                          <React.Fragment key={item.id}>
                            <TableRow className="cursor-pointer hover:bg-muted/50" onClick={() => toggleRow(item.id)}>
                              <TableCell className="w-[40px] py-2 align-middle">
                                <button type="button" className="p-0.5 rounded hover:bg-muted">
                                  {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                                </button>
                              </TableCell>
                              <TableCell
                                className="py-2 align-middle"
                                style={{ width: `${columnWidths[0]}%` }}
                              >
                                <p className={`text-sm font-medium leading-snug break-words ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                                  {item.question}
                                </p>
                              </TableCell>
                              <TableCell
                                className="py-2 align-middle"
                                style={{ width: `${columnWidths[1]}%` }}
                              >
                                <p className={`text-sm text-muted-foreground leading-snug break-words ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-2'}`}>
                                  {item.answer.replace(/[#*|_`>-]/g, '').substring(0, 150)}{item.answer.length > 150 && !isExpanded ? '...' : ''}
                                </p>
                              </TableCell>
                              <TableCell
                                className="py-2 align-middle"
                                style={{ width: `${columnWidths[2]}%` }}
                              >
                                {getRatingBadge(item.rating_status)}
                              </TableCell>
                              <TableCell
                                className="py-2 align-middle"
                                style={{ width: `${columnWidths[3]}%` }}
                              >
                                <span className="text-xs text-muted-foreground">
                                  {formatDate(item.created_at)}
                                </span>
                              </TableCell>
                              <TableCell
                                className="py-2 align-middle text-right"
                                style={{ width: `${columnWidths[4]}%` }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center justify-end gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => openEditDialog(item)}
                                    className="h-7 w-7 p-0"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDeleteId(item.id)}
                                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow>
                                <TableCell colSpan={6} className="p-0 border-b-2 border-green-200">
                                  <div className="bg-muted/30 px-4 py-4" ref={expandContainerRef}>
                                    <div className="flex items-stretch gap-0 min-h-[120px]">
                                      {/* Question panel */}
                                      <div className="overflow-y-auto pr-3" style={{ width: `${expandSplit}%`, minWidth: 0 }}>
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Question</h4>
                                        <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap break-words">{item.question}</p>
                                      </div>
                                      {/* Draggable divider */}
                                      <div
                                        className="shrink-0 w-3 cursor-col-resize flex items-center justify-center group relative select-none"
                                        onMouseDown={handleExpandResizeDown}
                                      >
                                        <div className="w-px h-full bg-border group-hover:bg-green-500 transition-colors absolute inset-y-0 left-1/2 -translate-x-1/2" />
                                        <div className="relative z-10 bg-muted border border-border rounded-sm p-0.5 group-hover:border-green-500 group-hover:bg-green-50 transition-colors">
                                          <GripVertical className="h-3 w-3 text-muted-foreground group-hover:text-green-700 transition-colors" />
                                        </div>
                                      </div>
                                      {/* Answer panel */}
                                      <div className="overflow-hidden pl-3 flex flex-col" style={{ width: `${100 - expandSplit}%`, minWidth: 0 }}>
                                        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 shrink-0">Answer (Formatted)</h4>
                                        <div className="bg-card rounded-lg border border-border p-4 overflow-y-auto max-h-[500px] flex-1">
                                          <MarkdownPreview content={item.answer} />
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        )
                      })}
                      {answers.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center py-12 text-muted-foreground"
                          >
                            <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-50" />
                            <p>No Q&A entries found</p>
                            <p className="text-xs mt-1">
                              Click &quot;Sync from Chat&quot; to import rated messages or add manually
                            </p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <p className="text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Edit Dialog */}
      <Dialog open={!!editItem} onOpenChange={() => { setEditItem(null); setEditTab('preview'); setEditExpanded(false) }}>
        <DialogContent
          className="overflow-hidden flex flex-col p-0"
          style={editExpanded ? {
            maxWidth: '98vw',
            width: '98vw',
            maxHeight: '98vh',
            height: '98vh',
          } : {
            maxWidth: '95vw',
            width: '1400px',
            maxHeight: '92vh',
            height: '90vh',
          }}
        >
          {/* Dialog Header */}
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Edit Q&A Entry</h2>
              <p className="text-sm text-muted-foreground">Edit the answer using the toolbar or switch to raw markdown. Approved answers are served before calling AI.</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditExpanded(!editExpanded)}
                className="h-8 px-3 gap-2"
              >
                {editExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                <span className="text-xs">{editExpanded ? 'Minimize' : 'Fullscreen'}</span>
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-4 h-full">
              {/* Question */}
              <div className="shrink-0">
                <label className="text-sm font-medium mb-1.5 block">Question</label>
                <Textarea
                  value={editQuestion}
                  onChange={(e) => setEditQuestion(e.target.value)}
                  rows={2}
                  className="resize-none"
                />
              </div>

              {/* Answer - main editing area */}
              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <label className="text-sm font-medium">Answer</label>
                  <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-muted/30">
                    <button
                      type="button"
                      onClick={() => setEditTab('preview')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                        editTab === 'preview'
                          ? 'bg-green-700 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Visual Editor
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditTab('edit')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                        editTab === 'edit'
                          ? 'bg-green-700 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Code className="h-3.5 w-3.5" />
                      Markdown Source
                    </button>
                  </div>
                </div>

                {editTab === 'edit' ? (
                  <div className="flex-1 min-h-0 flex flex-col border border-border rounded-lg overflow-hidden">
                    {/* Formatting toolbar for markdown */}
                    <div className="flex items-center gap-0.5 px-2 py-1.5 bg-muted/40 border-b border-border shrink-0 flex-wrap">
                      {[
                        { icon: Bold, label: 'Bold', insert: '**bold**' },
                        { icon: Italic, label: 'Italic', insert: '*italic*' },
                        { icon: Heading2, label: 'Heading', insert: '\n## Heading\n' },
                        { icon: List, label: 'Bullet List', insert: '\n- Item 1\n- Item 2\n- Item 3\n' },
                        { icon: ListOrdered, label: 'Numbered List', insert: '\n1. Item 1\n2. Item 2\n3. Item 3\n' },
                        { icon: Table2, label: 'Table', insert: '\n| Column 1 | Column 2 | Column 3 |\n|---|---|---|\n| Cell | Cell | Cell |\n' },
                      ].map(({ icon: Icon, label, insert }) => (
                        <Button
                          key={label}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title={label}
                          onClick={() => setEditAnswer(prev => prev + insert)}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </Button>
                      ))}
                    </div>
                    <Textarea
                      value={editAnswer}
                      onChange={(e) => setEditAnswer(e.target.value)}
                      className="resize-none font-mono text-sm flex-1 min-h-[200px] border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      style={{ height: '100%' }}
                    />
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col border border-border rounded-lg overflow-hidden">
                    {/* Visual editor toolbar */}
                    <div className="flex items-center gap-0.5 px-2 py-1.5 bg-muted/40 border-b border-border shrink-0 flex-wrap">
                      <p className="text-xs text-muted-foreground px-2">Formatted preview - switch to &quot;Markdown Source&quot; to edit the raw text</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 bg-card">
                      {editAnswer.trim() ? (
                        <MarkdownPreview content={editAnswer} />
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No answer content to preview.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Rating */}
              <div className="shrink-0 pt-2">
                <label className="text-sm font-medium mb-1.5 block">Rating</label>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant={editRating === 'thumbs_up' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEditRating('thumbs_up')}
                    className={editRating === 'thumbs_up' ? 'bg-green-700 hover:bg-green-800' : ''}
                  >
                    <ThumbsUp className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant={editRating === 'thumbs_down' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEditRating('thumbs_down')}
                    className={editRating === 'thumbs_down' ? 'bg-red-600 hover:bg-red-700' : ''}
                  >
                    <ThumbsDown className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    variant={editRating === 'unreviewed' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setEditRating('unreviewed')}
                  >
                    <Minus className="h-4 w-4 mr-2" />
                    Unrated
                  </Button>
                  <span className="text-xs text-muted-foreground ml-2">
                    Only approved answers are served as cached responses.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0 bg-muted/20">
            <Button variant="outline" onClick={() => setEditItem(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={saving}
              className="bg-green-700 hover:bg-green-800"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={(open) => { setShowAddDialog(open); if (!open) { setAddTab('edit'); setAddExpanded(false) } }}>
        <DialogContent
          className="overflow-hidden flex flex-col p-0"
          style={addExpanded ? {
            maxWidth: '98vw',
            width: '98vw',
            maxHeight: '98vh',
            height: '98vh',
          } : {
            maxWidth: '95vw',
            width: '1400px',
            maxHeight: '92vh',
            height: '90vh',
          }}
        >
          <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-border shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Add New Q&A Entry</h2>
              <p className="text-sm text-muted-foreground">Add a question and answer pair to the knowledge base.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddExpanded(!addExpanded)}
              className="h-8 px-3 gap-2 shrink-0"
            >
              {addExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              <span className="text-xs">{addExpanded ? 'Minimize' : 'Fullscreen'}</span>
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
            <div className="flex flex-col gap-4 h-full">
              <div className="shrink-0">
                <label className="text-sm font-medium mb-1.5 block">Question</label>
                <Textarea
                  value={newQuestion}
                  onChange={(e) => setNewQuestion(e.target.value)}
                  rows={2}
                  placeholder="e.g., What is the difference between murder and homicide?"
                  className="resize-none"
                />
              </div>

              <div className="flex-1 min-h-0 flex flex-col">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <label className="text-sm font-medium">Answer</label>
                  <div className="flex items-center gap-1 rounded-lg border border-border p-0.5 bg-muted/30">
                    <button
                      type="button"
                      onClick={() => setAddTab('edit')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                        addTab === 'edit'
                          ? 'bg-green-700 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Code className="h-3.5 w-3.5" />
                      Markdown Source
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddTab('preview')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                        addTab === 'preview'
                          ? 'bg-green-700 text-white shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Preview
                    </button>
                  </div>
                </div>
                {addTab === 'edit' ? (
                  <div className="flex-1 min-h-0 flex flex-col border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-0.5 px-2 py-1.5 bg-muted/40 border-b border-border shrink-0 flex-wrap">
                      {[
                        { icon: Bold, label: 'Bold', insert: '**bold**' },
                        { icon: Italic, label: 'Italic', insert: '*italic*' },
                        { icon: Heading2, label: 'Heading', insert: '\n## Heading\n' },
                        { icon: List, label: 'Bullet List', insert: '\n- Item 1\n- Item 2\n- Item 3\n' },
                        { icon: ListOrdered, label: 'Numbered List', insert: '\n1. Item 1\n2. Item 2\n3. Item 3\n' },
                        { icon: Table2, label: 'Table', insert: '\n| Column 1 | Column 2 | Column 3 |\n|---|---|---|\n| Cell | Cell | Cell |\n' },
                      ].map(({ icon: Icon, label, insert }) => (
                        <Button
                          key={label}
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          title={label}
                          onClick={() => setNewAnswer(prev => prev + insert)}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </Button>
                      ))}
                    </div>
                    <Textarea
                      value={newAnswer}
                      onChange={(e) => setNewAnswer(e.target.value)}
                      placeholder="Enter the answer (supports markdown)..."
                      className="resize-none font-mono text-sm flex-1 min-h-[200px] border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                      style={{ height: '100%' }}
                    />
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 flex flex-col border border-border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-0.5 px-2 py-1.5 bg-muted/40 border-b border-border shrink-0">
                      <p className="text-xs text-muted-foreground px-2">Formatted preview</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 bg-card">
                      {newAnswer.trim() ? (
                        <MarkdownPreview content={newAnswer} />
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No answer content to preview.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="shrink-0 pt-2">
                <label className="text-sm font-medium mb-1.5 block">Rating</label>
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    variant={newRating === 'thumbs_up' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewRating('thumbs_up')}
                    className={newRating === 'thumbs_up' ? 'bg-green-700 hover:bg-green-800' : ''}
                  >
                    <ThumbsUp className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant={newRating === 'thumbs_down' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewRating('thumbs_down')}
                    className={newRating === 'thumbs_down' ? 'bg-red-600 hover:bg-red-700' : ''}
                  >
                    <ThumbsDown className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    variant={newRating === 'unreviewed' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setNewRating('unreviewed')}
                  >
                    <Minus className="h-4 w-4 mr-2" />
                    Unrated
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border shrink-0 bg-muted/20">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAdd}
              disabled={adding || !newQuestion.trim() || !newAnswer.trim()}
              className="bg-green-700 hover:bg-green-800"
            >
              {adding ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Entry'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Q&A Entry</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this question and answer from the knowledge base.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
