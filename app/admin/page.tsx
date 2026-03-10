'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { 
  Users, 
  CreditCard, 
  Activity, 
  TrendingUp, 
  Search, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  AlertTriangle,
  UserCheck,
  MessageSquare,
  DollarSign,
  Loader2,
  ArrowLeft,
  Flame,
  Bot,
  Check,
  Wrench,
  Power,
  RefreshCw
} from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'

interface PopularQuestion {
  question: string
  hits: number
}

interface Stats {
  totalUsers: number
  activeUsers: number
  onlineUsers: number
  recentSignups: number
  subscriptionsByTier: Record<string, number>
  paidUsers: number
  totalQueries: number
  totalRevenue: number
  monthlyRevenue: number
  growthRate: number
  popularQuestions: PopularQuestion[]
}

interface UserSubscription {
  tier_id: string
  status: string
  billing_cycle: string
  current_period_end: string
  subscription_tiers: {
    name: string
    price_monthly: number
  } | null
}

interface UserUsage {
  query_count: number
  period_start: string
  period_end: string
}

interface User {
  id: string
  email: string
  full_name: string | null
  created_at: string
  updated_at: string
  is_admin: boolean
  last_active: string | null
  subscription: UserSubscription | null
  usage: UserUsage | null
}

// Check if user is online (active within last 5 minutes)
const isUserOnline = (lastActive: string | null): boolean => {
  if (!lastActive) return false
  const lastActiveTime = new Date(lastActive).getTime()
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
  return lastActiveTime > fiveMinutesAgo
}

// Get time ago string
const getLastActiveText = (lastActive: string | null): string => {
  if (!lastActive) return 'Never'
  const diff = Date.now() - new Date(lastActive).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

interface UsersResponse {
  users: User[]
  total: number
  page: number
  limit: number
  totalPages: number
}




export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)


  // Maintenance mode
  const [maintEnabled, setMaintEnabled] = useState(false)
  const [maintMessage, setMaintMessage] = useState('')
  const [maintStart, setMaintStart] = useState('')
  const [maintEnd, setMaintEnd] = useState('')
  const [maintLoading, setMaintLoading] = useState(true)
  const [maintSaving, setMaintSaving] = useState(false)
  const [maintSaved, setMaintSaved] = useState(false)

  const [statsLastUpdated, setStatsLastUpdated] = useState<Date | null>(null)
  const [statsRefreshing, setStatsRefreshing] = useState(false)

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) setStatsRefreshing(true)
    try {
      const res = await fetch('/api/admin/stats')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
        setStatsLastUpdated(new Date())
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setStatsLoading(false)
      setStatsRefreshing(false)
    }
  }, [])

  // Fetch stats on mount
  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  // Fetch users
  useEffect(() => {
    async function fetchUsers() {
      setUsersLoading(true)
      try {
        const params = new URLSearchParams({
          page: page.toString(),
          limit: '10',
          ...(search && { search })
        })
        const res = await fetch(`/api/admin/users?${params}`)
        if (res.ok) {
          const data: UsersResponse = await res.json()
          setUsers(data.users)
          setTotalPages(data.totalPages)
          setTotalUsers(data.total)
        }
      } catch (error) {
        console.error('Error fetching users:', error)
      } finally {
        setUsersLoading(false)
      }
    }
    fetchUsers()
  }, [page, search])

  // Fetch maintenance settings
  useEffect(() => {
    async function fetchMaintenance() {
      try {
        const res = await fetch('/api/admin/maintenance')
        if (res.ok) {
          const data = await res.json()
          setMaintEnabled(data.enabled)
          setMaintMessage(data.message)
          setMaintStart(data.startTime)
          setMaintEnd(data.endTime)
        }
      } catch (error) {
        console.error('Error fetching maintenance:', error)
      } finally {
        setMaintLoading(false)
      }
    }
    fetchMaintenance()
  }, [])

  // Handle maintenance save
  const handleMaintenanceSave = async () => {
    setMaintSaving(true)
    setMaintSaved(false)
    try {
      const res = await fetch('/api/admin/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: maintEnabled,
          message: maintMessage,
          startTime: maintStart,
          endTime: maintEnd,
        }),
      })
      if (res.ok) {
        setMaintSaved(true)
        setTimeout(() => setMaintSaved(false), 3000)
      }
    } catch (error) {
      console.error('Error saving maintenance:', error)
    } finally {
      setMaintSaving(false)
    }
  }



  // Handle search with debounce
  const handleSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  // Handle delete user
  const handleDeleteUser = async () => {
    if (!deleteUserId) return
    
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/users/${deleteUserId}`, {
        method: 'DELETE'
      })
      
      if (res.ok) {
        setUsers(users.filter(u => u.id !== deleteUserId))
        setTotalUsers(prev => prev - 1)
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to delete user')
      }
    } catch (error) {
      console.error('Error deleting user:', error)
      alert('Failed to delete user')
    } finally {
      setDeleting(false)
      setDeleteUserId(null)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Link href="/chat">
                <Button variant="ghost" size="sm" className="shrink-0">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Back to Chat</span>
                </Button>
              </Link>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">Admin Dashboard</h1>
                <p className="text-sm text-muted-foreground hidden sm:block">Manage users and view analytics</p>
              </div>
            </div>
            <div className="shrink-0">
              <Link href="/admin/curated-answers">
                <Button size="sm" className="bg-green-700 hover:bg-green-800 w-full sm:w-auto">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Q&A Knowledge Base
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Header with Refresh */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-lg font-semibold">Dashboard</h2>
          <div className="flex items-center gap-2">
            {statsLastUpdated && (
              <span className="text-xs text-muted-foreground">
                Updated {statsLastUpdated.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchStats(true)}
              disabled={statsRefreshing}
              className="gap-1.5"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${statsRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.totalUsers || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    +{stats?.recentSignups || 0} this week
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.activeUsers || 0}</div>
                  <p className="text-xs text-muted-foreground">
                    Last 30 days ({stats?.onlineUsers || 0} online now)
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Queries</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{stats?.totalQueries || 0}</div>
                  <p className="text-xs text-muted-foreground">All time</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <div className="text-2xl font-bold">{formatCurrency(stats?.monthlyRevenue || 0)}</div>
                  <p className="text-xs text-muted-foreground">
                    Total: {formatCurrency(stats?.totalRevenue || 0)}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* AI Settings Link */}
        <Card className="mb-8">
          <CardContent className="flex items-center justify-between py-6">
            <div className="flex items-center gap-3">
              <Bot className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-medium">AI Settings</p>
                <p className="text-sm text-muted-foreground">Configure the AI model and system prompt</p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/ai-settings">
                Manage
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/* Maintenance Mode */}
        <Card className="mb-8">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3">
            <div>
              <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                <Wrench className="h-5 w-5 shrink-0" />
                Maintenance Mode
              </CardTitle>
              <CardDescription className="mt-1">
                Take the system offline for maintenance. Users can still sign up but cannot use the chat.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {maintSaved && (
                <div className="flex items-center gap-1 text-sm text-green-600">
                  <Check className="h-4 w-4" />
                  Saved
                </div>
              )}
              {maintEnabled && (
                <Badge variant="destructive" className="text-xs">Active</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {maintLoading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <div className="space-y-5">
                {/* Toggle */}
                <div className="flex items-center justify-between rounded-lg border p-4">
                  <div className="flex items-center gap-3">
                    <Power className={`h-5 w-5 ${maintEnabled ? 'text-red-500' : 'text-muted-foreground'}`} />
                    <div>
                      <p className="text-sm font-medium">{maintEnabled ? 'Maintenance is ON' : 'Maintenance is OFF'}</p>
                      <p className="text-xs text-muted-foreground">
                        {maintEnabled ? 'Non-admin users are blocked from using chat' : 'System is operating normally'}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant={maintEnabled ? 'destructive' : 'outline'}
                    size="sm"
                    onClick={() => setMaintEnabled(!maintEnabled)}
                  >
                    {maintEnabled ? 'Turn Off' : 'Turn On'}
                  </Button>
                </div>

                {/* Time Window */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Start Time</Label>
                    <Input
                      type="datetime-local"
                      value={maintStart}
                      onChange={(e) => setMaintStart(e.target.value)}
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground">Leave empty to start immediately when enabled</p>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">End Time (Expected Ready)</Label>
                    <Input
                      type="datetime-local"
                      value={maintEnd}
                      onChange={(e) => setMaintEnd(e.target.value)}
                      className="text-sm"
                    />
                    <p className="text-xs text-muted-foreground">Shown to users as expected completion time</p>
                  </div>
                </div>

                {/* Message */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Message to Users</Label>
                  <textarea
                    value={maintMessage}
                    onChange={(e) => setMaintMessage(e.target.value)}
                    placeholder="e.g. We're upgrading our systems to serve you better. Please check back soon."
                    rows={3}
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                </div>

                {/* Save */}
                <div className="flex items-center gap-3">
                  <Button onClick={handleMaintenanceSave} disabled={maintSaving} size="sm">
                    {maintSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Changes take effect immediately. Admins always have access.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Subscription Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-lg">Subscriptions by Plan</CardTitle>
              <CardDescription>Active subscriptions breakdown</CardDescription>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <div className="space-y-4">
                  {stats?.subscriptionsByTier && Object.entries(stats.subscriptionsByTier).map(([tier, count]) => (
                    <div key={tier} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${
                          tier.toLowerCase().includes('free') ? 'bg-gray-400' :
                          tier.toLowerCase().includes('basic') ? 'bg-blue-500' :
                          tier.toLowerCase().includes('professional') ? 'bg-purple-500' :
                          'bg-amber-500'
                        }`} />
                        <span className="text-sm font-medium capitalize">{tier}</span>
                      </div>
                      <span className="text-sm text-muted-foreground">{count} users</span>
                    </div>
                  ))}
                  {(!stats?.subscriptionsByTier || Object.keys(stats.subscriptionsByTier).length === 0) && (
                    <p className="text-sm text-muted-foreground">No active subscriptions</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Quick Stats</CardTitle>
              <CardDescription>Overview of system health</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                    <Activity className="w-4 h-4" />
                    <span className="text-sm font-medium">System Status</span>
                  </div>
                  <p className="mt-1 text-lg font-semibold text-green-800 dark:text-green-300">Operational</p>
                </div>
                <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm font-medium">Growth Rate</span>
                  </div>
                  <p className="mt-1 text-lg font-semibold text-blue-800 dark:text-blue-300">
                    {stats?.growthRate !== undefined 
                      ? `${stats.growthRate >= 0 ? '+' : ''}${stats.growthRate}%`
                      : '0%'
                    }
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">Week over week</p>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                  <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                    <CreditCard className="w-4 h-4" />
                    <span className="text-sm font-medium">Paid Users</span>
                  </div>
                  <p className="mt-1 text-lg font-semibold text-purple-800 dark:text-purple-300">
                    {stats?.paidUsers || 0}
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-400">
                    {stats && stats.totalUsers > 0 
                      ? `${((stats.paidUsers / stats.totalUsers) * 100).toFixed(1)}% conversion`
                      : '0% conversion'
                    }
                  </p>
                </div>
                <div className="p-4 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                    <MessageSquare className="w-4 h-4" />
                    <span className="text-sm font-medium">Avg Queries/User</span>
                  </div>
                  <p className="mt-1 text-lg font-semibold text-amber-800 dark:text-amber-300">
                    {stats && stats.activeUsers > 0 
                      ? (stats.totalQueries / stats.activeUsers).toFixed(1)
                      : '0'
                    }
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">Per active user</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Popular Questions */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Popular Questions</CardTitle>
                <CardDescription>Most frequently asked questions by hit count</CardDescription>
              </div>
              <Flame className="h-5 w-5 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : stats?.popularQuestions && stats.popularQuestions.length > 0 ? (
              <div className="space-y-3">
                {stats.popularQuestions.map((item, index) => {
                  const maxHits = stats.popularQuestions[0]?.hits || 1
                  const barWidth = Math.max((item.hits / maxHits) * 100, 8)
                  return (
                    <div key={index} className="group">
                      <div className="flex items-start justify-between gap-4 mb-1">
                        <div className="flex items-start gap-2 min-w-0 flex-1">
                          <span className={`shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                            index === 0 ? 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400' :
                            index === 1 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400' :
                            index === 2 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-400' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {index + 1}
                          </span>
                          <p className="text-sm text-foreground leading-tight">{item.question}</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0 tabular-nums">
                          {item.hits} {item.hits === 1 ? 'hit' : 'hits'}
                        </Badge>
                      </div>
                      <div className="ml-8 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            index === 0 ? 'bg-orange-500' :
                            index === 1 ? 'bg-amber-500' :
                            index === 2 ? 'bg-yellow-500' :
                            'bg-muted-foreground/30'
                          }`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No questions recorded yet</p>
            )}
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <CardTitle className="text-lg">All Users</CardTitle>
                <CardDescription>
                  {totalUsers} total users
                </CardDescription>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by email or name..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => handleSearch(e.target.value)}
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {usersLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Subscription</TableHead>
                        <TableHead>Queries</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user) => {
                        const subscription = user.subscription
                        const usage = user.usage
                        const tierName = (subscription?.subscription_tiers as { name: string; monthly_price: number } | null)?.name
                        
                        return (
                          <TableRow key={user.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{user.full_name || 'No name'}</div>
                                <div className="text-sm text-muted-foreground">{user.email}</div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant={
                                tierName?.toLowerCase().includes('professional') 
                                  ? 'default' 
                                  : tierName?.toLowerCase().includes('basic')
                                    ? 'secondary'
                                    : 'outline'
                              }>
                                {tierName || 'Free Trial'}
                              </Badge>
                            </TableCell>
                            <TableCell>{usage?.query_count || 0}</TableCell>
                            <TableCell>{formatDate(user.created_at)}</TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-2">
                                  {isUserOnline(user.last_active) ? (
                                    <div className="flex items-center gap-1.5">
                                      <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
                                      </span>
                                      <span className="text-xs font-medium text-green-600">Online</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <span className="h-2.5 w-2.5 rounded-full bg-gray-300"></span>
                                      <span className="text-xs text-muted-foreground">{getLastActiveText(user.last_active)}</span>
                                    </div>
                                  )}
                                  {user.is_admin && (
                                    <Badge variant="destructive" className="text-xs">Admin</Badge>
                                  )}
                                </div>
                                {subscription?.status === 'active' ? (
                                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 w-fit text-xs">
                                    Subscribed
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200 w-fit text-xs">
                                    Free
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => setDeleteUserId(user.id)}
                                disabled={user.is_admin}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {users.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No users found
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
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteUserId} onOpenChange={() => setDeleteUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Delete User
            </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-muted-foreground text-sm">
                  This action cannot be undone. This will permanently delete the user account
                  and all associated data including:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Profile information</li>
                    <li>Subscription details</li>
                    <li>Chat history</li>
                    <li>Payment records</li>
                    <li>Usage statistics</li>
                  </ul>
                </div>
              </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDeleteUser}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete User'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
