import React from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, FileText, Settings, Search, Bell, Menu } from 'lucide-react';

const Layout = () => {
  const location = useLocation();

  const getPageTitle = () => {
    if (location.pathname.includes('/admin/dashboard')) return 'Dashboard';
    if (location.pathname.includes('/admin/telecallers')) {
      return location.pathname.split('/').length > 3 ? 'Telecaller Details' : 'Telecaller';
    }
    if (location.pathname.includes('/admin/reports')) return 'Reports';
    return 'Admin Panel';
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-800">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col hidden md:flex">
        <div className="h-16 flex items-center px-6 border-b border-slate-200">
          <span className="text-xl font-bold text-slate-900 tracking-tight">LOGO</span>
          <Menu className="ml-auto w-5 h-5 text-slate-400 cursor-pointer" />
        </div>
        
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          <NavLink
            to="/admin/dashboard"
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
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 lg:px-8">
          <h1 className="text-xl font-semibold text-slate-800 hidden lg:block">
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
            
            <div className="w-8 h-8 rounded-full bg-slate-800 overflow-hidden border-2 border-white shadow-sm">
              <img src="https://i.pravatar.cc/150?img=47" alt="Profile" className="w-full h-full object-cover" />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto bg-slate-50 p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;
