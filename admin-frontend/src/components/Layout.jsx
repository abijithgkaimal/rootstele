import React, { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, PhoneCall, MessageSquare, Search } from 'lucide-react';

// Custom toggle icons matching the requested design
const CollapseIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 18l-6-6 6-6" />
    <line x1="16" y1="6" x2="16" y2="18" />
    <line x1="20" y1="6" x2="20" y2="18" />
  </svg>
);

const ExpandIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6l6 6-6 6" />
    <line x1="8" y1="6" x2="8" y2="18" />
    <line x1="4" y1="6" x2="4" y2="18" />
  </svg>
);

import { DialexLogo } from './DialexLogo';

const Layout = () => {
  const location = useLocation();
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const isSidebarOpen = isPinned || isHovered;

  const getPageTitle = () => {
    if (location.pathname.includes('/admin/dashboard')) return 'Dashboard';
    if (location.pathname.includes('/admin/call-reports')) return 'Call Reports';
    if (location.pathname.includes('/admin/telecallers')) {
      return location.pathname.split('/').length > 3 ? 'Telecaller Details' : 'Telecallers';
    }
    if (location.pathname.includes('/admin/reports') || location.pathname.includes('/admin/chat-reports')) return 'Chat Reports';
    return 'Admin Panel';
  };

  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const adminUsername = localStorage.getItem('admin_username') || 'Admin';

  const handleConfirmLogout = async () => {
    try {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_username');
      await fetch('/api/admin/logout', { method: 'POST' });
      window.location.href = '/admin/login';
    } catch (e) {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_username');
      window.location.href = '/admin/login';
    }
  };

  const toggleSidebar = () => {
    setIsPinned((prev) => !prev);
    setIsHovered(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden relative">
      {/* Invisible hover trigger on the left edge when sidebar is collapsed */}
      {!isSidebarOpen && (
        <div
          className="hidden md:block fixed left-0 top-0 bottom-0 w-4 z-40 cursor-pointer"
          onMouseEnter={() => setIsHovered(true)}
          title="Hover to open navigation"
        />
      )}

      {/* Mobile/Desktop Sidebar Overlay - only visible on small screens when open */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-800/20 z-20 md:hidden backdrop-blur-sm transition-opacity" 
          onClick={() => {
            setIsPinned(false);
            setIsHovered(false);
          }}
        ></div>
      )}

      {/* Sidebar */}
      <aside 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-300 ease-in-out shadow-xl md:shadow-md ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 flex items-center px-5 border-b border-slate-200 shrink-0 gap-3 bg-slate-50/50">
          <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-sm ring-2 ring-slate-200 shrink-0">
            {adminUsername.charAt(0).toUpperCase()}
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold text-slate-800 truncate leading-tight">
              {adminUsername}
            </span>
            <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1 leading-tight mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Admin
            </span>
          </div>
        </div>
        
        <nav className="flex-1 py-5 px-3 space-y-1.5 overflow-y-auto">
          <NavLink
            to="/admin/dashboard"
            onClick={() => window.innerWidth < 768 && setIsSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                isActive ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <LayoutDashboard className="w-5 h-5 mr-3 opacity-80" />
            Dashboard
          </NavLink>

          <NavLink
            to="/admin/call-reports"
            onClick={() => window.innerWidth < 768 && setIsSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                isActive ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <PhoneCall className="w-5 h-5 mr-3 opacity-80" />
            Call Reports
          </NavLink>

          <NavLink
            to="/admin/reports"
            onClick={() => window.innerWidth < 768 && setIsSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                isActive ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <MessageSquare className="w-5 h-5 mr-3 opacity-80" />
            Chat Reports
          </NavLink>

          <NavLink
            to="/admin/telecallers"
            onClick={() => window.innerWidth < 768 && setIsSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                isActive ? 'bg-slate-100 text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <Users className="w-5 h-5 mr-3 opacity-80" />
            Telecallers
          </NavLink>
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-slate-200 shrink-0">
          <button 
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-rose-500 hover:bg-rose-50 transition-colors"
          >
            <svg className="w-5 h-5 mr-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content - dynamically adjusts margin based on sidebar state on desktop */}
      <main 
        className={`flex-1 flex flex-col h-screen overflow-hidden transition-all duration-300 ease-in-out ${
          isSidebarOpen ? 'md:ml-64' : 'ml-0'
        }`}
      >
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 shrink-0 sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <button 
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center focus:outline-none" 
              onClick={toggleSidebar}
              onMouseEnter={() => setIsHovered(true)}
              aria-label="Toggle Sidebar"
              title={isPinned ? 'Click to collapse navigation' : 'Click to pin navigation'}
            >
              {isSidebarOpen ? <CollapseIcon className="w-5 h-5" /> : <ExpandIcon className="w-5 h-5" />}
            </button>
            <DialexLogo iconSize="w-8 h-8" textSize="text-xl" />
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="relative hidden md:block group">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
              <input
                type="text"
                placeholder="Search telecallers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-64 rounded-full bg-slate-100 border border-transparent text-sm focus:bg-white focus:border-slate-300 focus:ring-4 focus:ring-slate-100 outline-none transition-all shadow-inner"
              />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-[#fafafa] p-4 sm:p-6 lg:p-8">
          <Outlet context={{ searchTerm }} />
        </div>
      </main>

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl border border-slate-100 transform animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-rose-50 text-rose-500 mx-auto mb-4">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
            </div>
            
            <h3 className="text-lg font-bold text-center text-slate-800 mb-1">Confirm Logout</h3>
            <p className="text-sm text-center text-slate-500 mb-6">
              Are you sure you want to log out of the admin panel?
            </p>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="flex-1 px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-sm font-semibold text-white shadow-md shadow-rose-200 transition-colors"
              >
                Yes, Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
