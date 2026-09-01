import React, { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, PhoneCall, MessageSquare, Settings, Search, X } from 'lucide-react';

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
  // Sidebar closed by default as requested
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const getPageTitle = () => {
    if (location.pathname.includes('/admin/dashboard')) return 'Dashboard';
    if (location.pathname.includes('/admin/call-reports')) return 'Call Reports';
    if (location.pathname.includes('/admin/telecallers')) {
      return location.pathname.split('/').length > 3 ? 'Telecaller Details' : 'Telecallers';
    }
    if (location.pathname.includes('/admin/reports') || location.pathname.includes('/admin/chat-reports')) return 'Chat Reports';
    return 'Admin Panel';
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden relative">
      {/* Mobile/Desktop Sidebar Overlay - only visible on small screens when open */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-800/20 z-20 md:hidden backdrop-blur-sm transition-opacity" 
          onClick={toggleSidebar}
        ></div>
      )}

      {/* Sidebar */}
      <aside 
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-300 ease-in-out shadow-lg md:shadow-none ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200 shrink-0">
          <DialexLogo iconSize="w-8 h-8" textSize="text-xl" />
          <button className="md:hidden p-1.5 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-50" onClick={toggleSidebar}>
            <X className="w-5 h-5" />
          </button>
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

          <div className="flex items-center px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-400 cursor-not-allowed mt-4 border-t border-slate-100 pt-4">
            <Settings className="w-5 h-5 mr-3 opacity-50" />
            Settings
          </div>
        </nav>

        {/* Logout Button */}
        <div className="p-4 border-t border-slate-200 shrink-0">
          <button 
            onClick={async () => {
              try {
                localStorage.removeItem('admin_token');
                await fetch('/api/admin/logout', { method: 'POST' });
                window.location.href = '/admin/login';
              } catch (e) {
                localStorage.removeItem('admin_token');
                window.location.href = '/admin/login';
              }
            }}
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
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 lg:px-6 shrink-0 sticky top-0 z-10">
          <button 
            className="p-2 mr-4 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors flex items-center justify-center focus:outline-none" 
            onClick={toggleSidebar}
            aria-label="Toggle Sidebar"
          >
            {isSidebarOpen ? <CollapseIcon className="w-5 h-5" /> : <ExpandIcon className="w-5 h-5" />}
          </button>
          
          <div className="flex items-center space-x-4 ml-auto">
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
    </div>
  );
};

export default Layout;
