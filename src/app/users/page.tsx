'use client'

import { useState, useEffect, useCallback } from 'react'
import { UserPlus, Pencil, Trash2, Users } from 'lucide-react'
import { toast } from 'sonner'

interface User {
  email: string
  createdAt: string
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  // Add user dialog
  const [addOpen, setAddOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [adding, setAdding] = useState(false)

  // Change password dialog
  const [pwOpen, setPwOpen] = useState(false)
  const [pwEmail, setPwEmail] = useState('')
  const [pwValue, setPwValue] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

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

  useEffect(() => { loadUsers() }, [loadUsers])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Failed to add user'); return }
      toast.success(`User ${newEmail} added`)
      setAddOpen(false)
      setNewEmail('')
      setNewPassword('')
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
    } finally {
      setPwSaving(false)
    }
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
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Add User
          </button>
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
                    <td className="px-4 py-3 text-sm text-muted-foreground">
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
                        <button
                          onClick={() => handleDelete(user.email)}
                          disabled={users.length <= 1}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={users.length <= 1 ? 'Cannot delete the last user' : 'Delete user'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
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
                <input
                  type="password"
                  required
                  minLength={8}
                  value={pwValue}
                  onChange={e => setPwValue(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
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
    </div>
  )
}
