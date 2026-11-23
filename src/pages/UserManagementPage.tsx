import { useEffect, useState } from 'react';
import { ShieldAlert, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { listAllUsers, updateUserRole } from '../services/userService';
import { formatDate } from '../utils/format';
import { StatusLabel } from '../components/common/StatusLabel';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import type { UserProfile, UserRole } from '../types';

export function UserManagementPage() {
  const { isAdmin, firebaseUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<{
    user: UserProfile;
    nextRole: UserRole;
  } | null>(null);
  const [updating, setUpdating] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listAllUsers();
      setUsers(list.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      void loadUsers();
    } else {
      setLoading(false);
    }
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-8 max-w-xl mx-auto text-center space-y-3">
        <ShieldAlert className="w-8 h-8 text-amber-600 mx-auto" />
        <h2 className="text-lg font-semibold">Administrator Access Required</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Your account is assigned the <strong>Inventory Manager</strong> role. Only administrators
          can list users and assign team roles. Role checks are enforced by Firestore Security Rules.
        </p>
      </div>
    );
  }

  const handleConfirmRoleChange = async () => {
    if (!pendingChange) return;
    setUpdating(true);
    try {
      await updateUserRole(pendingChange.user.uid, pendingChange.nextRole);
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === pendingChange.user.uid ? { ...u, role: pendingChange.nextRole } : u
        )
      );
      setPendingChange(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
          User Management &amp; RBAC
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Manage team roles with server-side and Firestore security rule enforcement
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Users className="w-4 h-4 text-teal-600" />
            <span>Registered Accounts ({users.length})</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 bg-slate-50/70 dark:bg-slate-800/40">
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Joined</th>
                <th className="py-3 px-4 text-right">Change Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    Loading user accounts...
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isSelf = u.uid === firebaseUser?.uid;
                  return (
                    <tr key={u.uid}>
                      <td className="py-3 px-4 font-medium text-sm">{u.name}</td>
                      <td className="py-3 px-4 font-mono">{u.email}</td>
                      <td className="py-3 px-4">
                        <StatusLabel
                          label={u.role === 'ADMIN' ? 'Admin' : 'Inventory Manager'}
                          tone={u.role === 'ADMIN' ? 'success' : 'info'}
                        />
                      </td>
                      <td className="py-3 px-4 text-slate-500">{formatDate(u.createdAt)}</td>
                      <td className="py-3 px-4 text-right">
                        <select
                          disabled={isSelf}
                          value={u.role}
                          onChange={(e) =>
                            setPendingChange({
                              user: u,
                              nextRole: e.target.value as UserRole,
                            })
                          }
                          className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg disabled:opacity-50"
                        >
                          <option value="INVENTORY_MANAGER">INVENTORY_MANAGER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Security Governance & Promotion Guide */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          <span>First Admin Promotion &amp; Security Policy</span>
        </div>
        <p className="leading-relaxed">
          All newly registered users are assigned <span className="font-mono">INVENTORY_MANAGER</span> by default and are blocked by Firestore Security Rules from elevating their own role. To promote an initial administrator directly via Firebase Console:
        </p>
        <ol className="list-decimal list-inside space-y-1">
          <li>Open Firebase Console → Firestore Database → select database <span className="font-mono">ai-studio-c7affb91-0e56-44bd-ae9f-5bf2049d1268</span>.</li>
          <li>Navigate to the <span className="font-mono">users</span> collection and open the target user&apos;s UID document.</li>
          <li>Update the <span className="font-mono">role</span> field from <span className="font-mono">INVENTORY_MANAGER</span> to <span className="font-mono">ADMIN</span> and save.</li>
        </ol>
      </div>

      <ConfirmDialog
        open={Boolean(pendingChange)}
        title="Confirm Role Change"
        description={
          pendingChange
            ? `Change ${pendingChange.user.name} (${pendingChange.user.email}) role to ${pendingChange.nextRole}?`
            : ''
        }
        confirmLabel="Update Role"
        loading={updating}
        onConfirm={handleConfirmRoleChange}
        onCancel={() => setPendingChange(null)}
      />
    </div>
  );
}
