import React, { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  BarChart3,
  Bell,
  Bot,
  Boxes,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  Sun,
  TrendingUp,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useData } from '../../contexts/DataContext';
import {
  deleteNotification,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from '../../services/notificationService';
import { updateStoreSettings } from '../../services/settingsService';
import { formatDateTime } from '../../utils/format';
import type { DataSourceFilter } from '../../types';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, adminOnly: false },
  { to: '/products', label: 'Products', icon: Package, adminOnly: false },
  { to: '/inventory', label: 'Inventory', icon: Boxes, adminOnly: false },
  { to: '/sales', label: 'Sales', icon: ShoppingCart, adminOnly: false },
  { to: '/forecasting', label: 'Demand Forecasting', icon: TrendingUp, adminOnly: false },
  { to: '/smart-reorder', label: 'Smart Reorder', icon: RefreshCw, adminOnly: false },
  { to: '/suppliers', label: 'Suppliers', icon: Truck, adminOnly: false },
  { to: '/purchase-orders', label: 'Purchase Orders', icon: ClipboardList, adminOnly: false },
  { to: '/assistant', label: 'AI Business Assistant', icon: Bot, adminOnly: false },
  { to: '/analytics', label: 'Analytics & Reports', icon: BarChart3, adminOnly: false },
  { to: '/users', label: 'User Management', icon: Users, adminOnly: true },
  { to: '/settings', label: 'Settings', icon: Settings, adminOnly: false },
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile, firebaseUser, isAdmin, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const {
    dataSourceFilter,
    setDataSourceFilter,
    globalSearch,
    setGlobalSearch,
    notifications,
    unreadNotificationCount,
    settings,
    seedingDemo,
    dataError,
    dismissDataError,
    retrySync,
  } = useData();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
  const [notifError, setNotifError] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleTheme = async () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    toggleTheme();
    if (firebaseUser) {
      try {
        await updateStoreSettings(firebaseUser.uid, { theme: next });
      } catch {
        // Local UI theme already updated
      }
    }
  };

  const handleMarkAllRead = async () => {
    if (!firebaseUser) return;
    setNotifError(null);
    const unreadIds = notifications.filter((n) => !n.isRead).map((n) => n.notificationId);
    try {
      await markAllNotificationsAsRead(firebaseUser.uid, unreadIds);
    } catch (err) {
      setNotifError(err instanceof Error ? err.message : 'Unable to mark notifications as read.');
    }
  };

  const handleMarkSingleRead = async (notificationId: string) => {
    setNotifError(null);
    try {
      await markNotificationAsRead(notificationId);
    } catch (err) {
      setNotifError(err instanceof Error ? err.message : 'Unable to update notification.');
    }
  };

  const handleDismissNotification = async (notificationId: string) => {
    setNotifError(null);
    try {
      await deleteNotification(notificationId);
    } catch (err) {
      setNotifError(err instanceof Error ? err.message : 'Unable to dismiss notification.');
    }
  };

  const avatarSrc =
    profile?.photoUrl ||
    firebaseUser?.photoURL ||
    '/src/assets/images/avatar_store_manager_1795355349611.jpg';

  const currentNav = NAV_ITEMS.find((item) => location.pathname.startsWith(item.to));

  const renderSidebarContent = (isMobile: boolean) => (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 select-none">
      {/* Brand Lockup */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
        <NavLink
          to="/dashboard"
          className="flex items-center gap-2.5 overflow-hidden whitespace-nowrap"
        >
          <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center shrink-0">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-5 h-5 text-white"
              aria-hidden="true"
            >
              <path
                d="M3 9.5L12 4L21 9.5V20H3V9.5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path
                d="M7.5 16.5L10.5 13.5L13 15.5L16.5 11.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          {(!collapsed || isMobile) && (
            <span className="font-display text-base font-bold tracking-tight text-white whitespace-nowrap">
              StockSense AI
            </span>
          )}
        </NavLink>

        {isMobile ? (
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation menu"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setCollapsed((prev) => !prev)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Store Subtitle */}
      {(!collapsed || isMobile) && (
        <div className="px-4 py-3 border-b border-slate-800/80 text-xs text-slate-400 truncate">
          {settings?.storeName || 'FreshMart Superstore'}
        </div>
      )}

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto py-3 px-2.5 space-y-1" aria-label="Main navigation">
        {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              title={collapsed && !isMobile ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-teal-600/20 text-teal-300'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {(!collapsed || isMobile) && <span className="truncate">{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Sidebar Footer */}
      {(!collapsed || isMobile) && (
        <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
          <span className="truncate">{profile?.role === 'ADMIN' ? 'Administrator' : 'Inventory Manager'}</span>
          <span className="font-mono text-[11px] text-slate-500">INR</span>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:block shrink-0 border-r border-slate-800 transition-all duration-200 ${
          collapsed ? 'w-[68px]' : 'w-64'
        }`}
      >
        <div className="sticky top-0 h-screen">{renderSidebarContent(false)}</div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] h-full z-10">
            {renderSidebarContent(true)}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="hidden sm:block text-sm font-semibold text-slate-800 dark:text-slate-100 whitespace-nowrap">
              {currentNav?.label || 'StockSense AI'}
            </div>

            <div className="relative w-48 sm:w-64 md:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search"
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                placeholder="Search SKU, product, invoice..."
                aria-label="Global search"
                className="w-full pl-9 pr-3 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Data Source Filter */}
            <div
              className="hidden md:flex items-center gap-0.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
              role="group"
              aria-label="Data source filter"
            >
              {(['all', 'sample', 'real'] as DataSourceFilter[]).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setDataSourceFilter(opt)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap capitalize ${
                    dataSourceFilter === opt
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {opt === 'all' ? 'All Data' : opt === 'sample' ? 'Sample' : 'Real'}
                </button>
              ))}
            </div>

            {/* Theme Switcher */}
            <button
              type="button"
              onClick={handleToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Notifications */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                aria-label="Notifications"
                className="relative p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
              >
                <Bell className="w-4 h-4" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center tabular-nums">
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">Notification Center</span>
                      <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[11px]">
                        <button
                          type="button"
                          onClick={() => setNotifFilter('all')}
                          className={`px-2 py-0.5 rounded ${
                            notifFilter === 'all'
                              ? 'bg-white dark:bg-slate-900 font-semibold text-slate-900 dark:text-white'
                              : 'text-slate-500'
                          }`}
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => setNotifFilter('unread')}
                          className={`px-2 py-0.5 rounded ${
                            notifFilter === 'unread'
                              ? 'bg-white dark:bg-slate-900 font-semibold text-slate-900 dark:text-white'
                              : 'text-slate-500'
                          }`}
                        >
                          Unread ({unreadNotificationCount})
                        </button>
                      </div>
                    </div>
                    {unreadNotificationCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Mark all
                      </button>
                    )}
                  </div>
                  {notifError && (
                    <div className="px-4 py-2 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 text-[11px] text-red-700 dark:text-red-300">
                      {notifError}
                    </div>
                  )}
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                    {(() => {
                      const visibleNotifs =
                        notifFilter === 'unread'
                          ? notifications.filter((n) => !n.isRead)
                          : notifications;
                      if (visibleNotifs.length === 0) {
                        return (
                          <div className="px-4 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
                            {notifFilter === 'unread'
                              ? 'All notifications have been read.'
                              : 'No alerts yet. Stock and purchase order alerts appear here.'}
                          </div>
                        );
                      }
                      return visibleNotifs.slice(0, 20).map((n) => (
                        <div
                          key={n.notificationId}
                          className={`px-4 py-3 text-xs space-y-1 ${
                            n.isRead
                              ? 'opacity-75 bg-white dark:bg-slate-900'
                              : 'bg-sky-50/50 dark:bg-slate-800/60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="inline-block px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide rounded bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-200 mr-1.5">
                                {n.notificationType.replace(/_/g, ' ')}
                              </span>
                              <span className="font-semibold text-slate-900 dark:text-slate-100">
                                {n.title}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {!n.isRead && (
                                <button
                                  type="button"
                                  onClick={() => void handleMarkSingleRead(n.notificationId)}
                                  className="text-[11px] font-medium text-teal-600 dark:text-teal-400 hover:underline whitespace-nowrap"
                                >
                                  Mark read
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => void handleDismissNotification(n.notificationId)}
                                aria-label={`Dismiss ${n.title}`}
                                className="text-slate-400 hover:text-red-500"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                            {n.message}
                          </p>
                          <div className="text-[11px] text-slate-400">
                            {formatDateTime(n.createdAt, settings?.timezone)}
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                  <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between text-xs">
                    <span className="text-slate-500">{notifications.length} total alerts</span>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        navigate('/analytics?tab=notifications');
                      }}
                      className="font-medium text-teal-600 dark:text-teal-400 hover:underline"
                    >
                      Open Notification Center
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Menu */}
            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((prev) => !prev)}
                className="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <img
                  src={avatarSrc}
                  alt={profile?.name || 'User avatar'}
                  referrerPolicy="no-referrer"
                  className="w-7 h-7 rounded-md object-cover bg-slate-200 dark:bg-slate-700"
                />
                <span className="hidden sm:inline text-xs font-medium text-slate-800 dark:text-slate-200 max-w-[120px] truncate">
                  {profile?.name || firebaseUser?.email}
                </span>
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg z-50 py-2">
                  <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {profile?.name || 'Store User'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {profile?.email || firebaseUser?.email}
                    </div>
                    <div className="text-[11px] font-medium text-teal-600 dark:text-teal-400 mt-1">
                      Role: {profile?.role === 'ADMIN' ? 'Admin' : 'Inventory Manager'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/settings');
                    }}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    Store &amp; Profile Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      void logout();
                    }}
                    className="w-full text-left px-4 py-2 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {seedingDemo && (
          <div className="bg-sky-50 dark:bg-sky-950/40 border-b border-sky-200 dark:border-sky-900 px-6 py-2 text-xs text-sky-800 dark:text-sky-300">
            Setting up initial supermarket demo catalog and 90-day sales history in Firestore...
          </div>
        )}

        {dataError && (
          <div
            role="alert"
            className="bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 px-4 lg:px-6 py-2.5 text-xs text-red-700 dark:text-red-300 flex flex-wrap items-center justify-between gap-3"
          >
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate sm:whitespace-normal">{dataError}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={retrySync}
                className="px-2.5 py-1 rounded bg-white dark:bg-slate-900 border border-red-200 dark:border-red-800 font-medium hover:bg-red-100 dark:hover:bg-red-950"
              >
                Retry Sync
              </button>
              <button
                type="button"
                onClick={dismissDataError}
                className="underline hover:no-underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Main Page Content */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
