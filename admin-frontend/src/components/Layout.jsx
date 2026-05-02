import React, { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Settings, Search, Bell, Menu, X } from 'lucide-react';

const Layout = () => {
  const location = useLocation();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const getPageTitle = () => {
    if (location.pathname.includes('/admin/dashboard')) return 'Dashboard';
    if (location.pathname.includes('/admin/telecallers')) {
      return location.pathname.split('/').length > 3 ? 'Telecaller Details' : 'Telecaller';
    }
    if (location.pathname.includes('/admin/reports')) return 'Reports';
    return 'Admin Panel';
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800 overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-800/50 z-20 md:hidden" 
          onClick={toggleSidebar}
        ></div>
      )}

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 z-30 w-64 bg-white border-r border-slate-200 flex flex-col transform transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center text-white font-bold text-lg">A</div>
            {/* Removed the 'LOGO' text here */}
          </div>
          <button className="md:hidden p-1 text-slate-400 hover:text-slate-600" onClick={toggleSidebar}>
            <X className="w-5 h-5" />
          </button>
          <Menu className="ml-auto w-5 h-5 text-slate-400 cursor-pointer hidden md:block" />
        </div>
        
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <NavLink
            to="/admin/dashboard"
            onClick={() => setIsSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <LayoutDashboard className="w-5 h-5 mr-3" />
            Dashboard
          </NavLink>
          
          <NavLink
            to="/admin/telecallers"
            onClick={() => setIsSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <Users className="w-5 h-5 mr-3" />
            Telecallers
          </NavLink>

          <NavLink
            to="/admin/reports"
            onClick={() => setIsSidebarOpen(false)}
            className={({ isActive }) =>
              `flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`
            }
          >
            <FileText className="w-5 h-5 mr-3" />
            Reports
          </NavLink>

          <div className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-not-allowed opacity-70">
            <LayoutDashboard className="w-5 h-5 mr-3" />
            Categories & Reason
          </div>

          <div className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-not-allowed opacity-70">
            <Settings className="w-5 h-5 mr-3" />
            Settings
          </div>
        </nav>

        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-medium">
              A
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-slate-900">Office Admin</p>
              <p className="text-xs text-slate-500 truncate w-32">admin@example.com</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 lg:px-8 shrink-0">
          <button className="md:hidden p-2 text-slate-400 hover:text-slate-600 mr-2" onClick={toggleSidebar}>
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-semibold text-slate-800 hidden sm:block">
            {getPageTitle()}
          </h1>
          
          <div className="flex items-center space-x-4 ml-auto">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search data, users, or reports"
                className="pl-9 pr-4 py-2 w-64 rounded-full bg-slate-100 border-none text-sm focus:ring-2 focus:ring-slate-200 outline-none transition-shadow"
              />
            </div>
            
            <button className="p-2 text-slate-400 hover:text-slate-600 relative">
              <Bell className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>
            
            <div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden border-2 border-white shadow-sm shrink-0">
              <img src="https://i.pravatar.cc/150?img=47" alt="Profile" className="w-full h-full object-cover" />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-slate-50 p-4 sm:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
