'use client'

import { useState, useEffect, useCallback } from 'react'
import { UserPlus, Pencil, Trash2, Users, ShieldCheck, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

const ALL_PERMISSIONS = ['dashboard', 'integrations', 'feedback', 'chat', 'reports', 'users'] as const
type Permission = (typeof ALL_PERMISSIONS)[number]

const PERMISSION_LABELS: Record<Permission, string> = {
  dashboard: 'Dashboard',
  integrations: 'Integrations',
  feedback: 'Feedback Items',
  chat: 'AI Chat',
  reports: 'Reports',
  users: 'Users',
}

interface User {
  email: string
  createdAt: string
  permissions: string[]
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserPerms, setCurrentUserPerms] = useState<string[]>([])
  const canManage = currentUserPerms.includes('users')

  // Add user dialog
  const [addOpen, setAddOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [newPerms, setNewPerms] = useState<string[]>([...ALL_PERMISSIONS])
  const [adding, setAdding] = useState(false)

  // Change password dialog
  const [pwOpen, setPwOpen] = useState(false)
  const [pwEmail, setPwEmail] = useState('')
  const [pwValue, setPwValue] = useState('')
  const [showPwValue, setShowPwValue] = useState(false)
  const [pwSaving, setPwSaving] = useState(false)

  // Permissions dialog
  const [permOpen, setPermOpen] = useState(false)
  const [permEmail, setPermEmail] = useState('')
  const [permValues, setPermValues] = useState<string[]>([])
  const [permSaving, setPermSaving] = useState(false)

  const loadUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/users')
      const data = await res.json()
      setUsers(data.users ?? [])
    } catch {
      toast.error('Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => setCurrentUserPerms(d.permissions ?? []))
      .catch(() => {})
    loadUsers()
  }, [loadUsers])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword, permissions: newPerms }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to add user'); return }
      toast.success(`User ${newEmail} added`)
      setAddOpen(false)
      setNewEmail('')
      setNewPassword('')
      setShowNewPassword(false)
      setNewPerms([...ALL_PERMISSIONS])
      loadUsers()
    } finally {
      setAdding(false)
    }
  }

  async function handleDelete(email: string) {
    if (!confirm(`Delete user ${email}? They will no longer be able to sign in.`)) return
    const res = await fetch(`/api/users/${encodeURIComponent(email)}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success(`User ${email} deleted`)
      loadUsers()
    } else {
      const data = await res.json()
      toast.error(data.error ?? 'Failed to delete user')
    }
  }

  async function handlePasswordSave(e: React.FormEvent) {
    e.preventDefault()
    setPwSaving(true)
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(pwEmail)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwValue }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to update password'); return }
      toast.success('Password updated')
      setPwOpen(false)
      setPwValue('')
      setShowPwValue(false)
    } finally {
      setPwSaving(false)
    }
  }

  function openPermDialog(user: User) {
    setPermEmail(user.email)
    setPermValues(user.permissions ?? [...ALL_PERMISSIONS])
    setPermOpen(true)
  }

  async function handlePermSave(e: React.FormEvent) {
    e.preventDefault()
    setPermSaving(true)
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(permEmail)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: permValues }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to update permissions'); return }
      toast.success('Permissions updated')
      setPermOpen(false)
      loadUsers()
    } finally {
      setPermSaving(false)
    }
  }

  function toggleNewPerm(p: string) {
    setNewPerms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  function togglePerm(p: string) {
    setPermValues(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">User Management</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage who can access Feedback Agent
            </p>
          </div>
          {canManage && (
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              Add User
            </button>
          )}
        </div>

        {/* Users table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="bg-muted/30 px-4 py-3 border-b border-border flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">
              {users.length} {users.length === 1 ? 'user' : 'users'}
            </span>
          </div>

          {loading ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : users.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">No users found.</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="text-left px-4 py-3 font-medium">Access</th>
                  <th className="text-left px-4 py-3 font-medium">Created</th>
                  <th className="text-right px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
                  <tr
                    key={user.email}
                    className={`${i < users.length - 1 ? 'border-b border-border' : ''} hover:bg-muted/20 transition-colors`}
                  >
                    <td className="px-4 py-3 text-sm font-medium">{user.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {ALL_PERMISSIONS.map(p => (
                          <span
                            key={p}
                            className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-medium ${
                              (user.permissions ?? ALL_PERMISSIONS).includes(p)
                                ? 'bg-primary/15 text-primary'
                                : 'bg-muted/40 text-muted-foreground/50 line-through'
                            }`}
                          >
                            {PERMISSION_LABELS[p]}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(user.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setPwEmail(user.email); setPwValue(''); setPwOpen(true) }}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                          title="Change password"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {canManage && (
                          <button
                            onClick={() => openPermDialog(user)}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                            title="Edit permissions"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canManage && user.email.toLowerCase() !== 'ben@zeni.ai' && (
                          <button
                            onClick={() => handleDelete(user.email)}
                            disabled={users.length <= 1}
                            className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={users.length <= 1 ? 'Cannot delete the last user' : 'Delete user'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add User Dialog */}
      {addOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setAddOpen(false)} />
          <div className="relative bg-background border border-border rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-1">Add User</h2>
            <p className="text-sm text-muted-foreground mb-5">New users can sign in immediately.</p>
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="user@zeni.ai"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full px-3 py-2 pr-9 rounded-lg border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showNewPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Page Access</label>
                <div className="space-y-2">
                  {ALL_PERMISSIONS.map(p => (
                    <label key={p} className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={newPerms.includes(p)}
                        onChange={() => toggleNewPerm(p)}
                        className="w-4 h-4 rounded accent-primary"
                      />
                      <span className="text-sm group-hover:text-foreground text-muted-foreground transition-colors">
                        {PERMISSION_LABELS[p]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {adding ? 'Adding…' : 'Add User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Dialog */}
      {pwOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPwOpen(false)} />
          <div className="relative bg-background border border-border rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-1">Change Password</h2>
            <p className="text-sm text-muted-foreground mb-5 truncate">{pwEmail}</p>
            <form onSubmit={handlePasswordSave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showPwValue ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={pwValue}
                    onChange={e => setPwValue(e.target.value)}
                    placeholder="Min. 8 characters"
                    className="w-full px-3 py-2 pr-9 rounded-lg border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwValue(v => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPwValue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPwOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwSaving}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {pwSaving ? 'Saving…' : 'Update Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Permissions Dialog */}
      {permOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setPermOpen(false)} />
          <div className="relative bg-background border border-border rounded-xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-1">Edit Permissions</h2>
            <p className="text-sm text-muted-foreground mb-5 truncate">{permEmail}</p>
            <form onSubmit={handlePermSave} className="space-y-4">
              <div className="space-y-2">
                {ALL_PERMISSIONS.map(p => (
                  <label key={p} className="flex items-center gap-2.5 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={permValues.includes(p)}
                      onChange={() => togglePerm(p)}
                      className="w-4 h-4 rounded accent-primary"
                    />
                    <span className="text-sm group-hover:text-foreground text-muted-foreground transition-colors">
                      {PERMISSION_LABELS[p]}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPermOpen(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted/40 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={permSaving}
                  className="flex-1 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {permSaving ? 'Saving…' : 'Save Permissions'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
