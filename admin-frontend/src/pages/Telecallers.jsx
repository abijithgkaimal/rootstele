import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Users,
  Search,
  Building,
  Phone,
  Mail,
  Shield,
  Edit3,
  ArrowRight,
  Headphones,
  MessageSquare,
  TrendingUp,
  CheckCircle2
} from 'lucide-react';
import EditTelecallerModal from '../components/EditTelecallerModal';

const Telecallers = () => {
  const navigate = useNavigate();
  const [telecallers, setTelecallers] = useState([]);
  const [chatTelecallers, setChatTelecallers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [storeFilter, setStoreFilter] = useState('All Stores');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedForEdit, setSelectedForEdit] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [leadRes, chatRes] = await Promise.all([
        axios.get('/api/admin/telecaller-leaderboard'),
        axios.get('/api/admin/chat-reports/telecaller-performance')
      ]);

      if (leadRes.data.success) {
        setTelecallers(leadRes.data.data.telecallers);
      }
      if (chatRes.data.success) {
        setChatTelecallers(chatRes.data.data.telecallers);
      }
    } catch (error) {
      console.error('Error fetching telecallers directory:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const chatMap = {};
  chatTelecallers.forEach((c) => {
    if (c.employeeId) chatMap[c.employeeId.toUpperCase()] = c;
  });

  const allStores = ['All Stores', ...new Set(telecallers.map((t) => t.store).filter(Boolean))];

  const filteredTelecallers = telecallers.filter((t) => {
    const matchesSearch =
      !searchTerm ||
      (t.name && t.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.employeeId && t.employeeId.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.phone && t.phone.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.email && t.email.toLowerCase().includes(searchTerm.toLowerCase()));

    const isActive = t.lastLoginAt && new Date(t.lastLoginAt) > new Date(Date.now() - 12 * 60 * 60 * 1000);
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && isActive) ||
      (statusFilter === 'offline' && !isActive);

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 sm:space-y-8">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Telecallers Directory</h1>
          <p className="text-slate-500 text-xs sm:text-[15px] mt-1 font-medium">
            Central office telecaller team profiles, active status & individual call and chat tracking
          </p>
        </div>

        {/* Search & Status Filter */}
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          <div className="flex bg-[#eef2f6] p-1 rounded-xl text-xs font-bold text-slate-600 w-full sm:w-auto justify-between sm:justify-start">
            <button
              onClick={() => setStatusFilter('all')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all text-center ${
                statusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              All ({telecallers.length})
            </button>
            <button
              onClick={() => setStatusFilter('active')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all text-center ${
                statusFilter === 'active' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'
              }`}
            >
              Active
            </button>
            <button
              onClick={() => setStatusFilter('offline')}
              className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg transition-all text-center ${
                statusFilter === 'offline' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Offline
            </button>
          </div>

          <div className="relative w-full sm:w-auto flex-1 sm:flex-none">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search telecaller..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-200 shadow-sm w-full sm:w-56 transition-all"
            />
          </div>
        </div>
      </div>

      {/* Telecaller Profile Cards Grid */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 font-medium">Loading telecallers directory...</div>
      ) : filteredTelecallers.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-12 text-center text-slate-400">
          <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
          <p className="font-semibold text-slate-600">No telecallers found</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting your search.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTelecallers.map((t) => {
            const isActive = t.lastLoginAt && new Date(t.lastLoginAt) > new Date(Date.now() - 12 * 60 * 60 * 1000);
            const chatData = chatMap[t.employeeId?.toUpperCase()] || {};

            return (
              <div
                key={t.employeeId}
                className="bg-white rounded-3xl border border-slate-100 hover:border-slate-300 shadow-sm hover:shadow-md transition-all p-6 flex flex-col justify-between space-y-5 group relative"
              >
                {/* Top Profile Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-bold text-base shadow-sm">
                      {t.name ? t.name.charAt(0).toUpperCase() : 'T'}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-base group-hover:text-blue-600 transition-colors">
                        {t.name}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          {t.employeeId}
                        </span>
                        <span className="text-xs text-slate-500 font-medium">{t.role || 'Telecaller'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Edit Profile Button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedForEdit(t);
                    }}
                    title="Edit Profile"
                    className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                </div>

                {/* Info Fields: Contact Details */}
                <div className="space-y-2 py-3 border-y border-slate-100 text-xs text-slate-600 font-medium">
                  {t.phone ? (
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{t.phone}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>No phone added</span>
                    </div>
                  )}
                  {t.email ? (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{t.email}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span>No email added</span>
                    </div>
                  )}
                </div>

                {/* Quick Performance Summary Badges */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Calls</span>
                    <div className="font-bold text-slate-800 text-sm mt-0.5">{t.totalCalls || 0}</div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Chats</span>
                    <div className="font-bold text-slate-800 text-sm mt-0.5">{chatData.totalChats || 0}</div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Success</span>
                    <div className="font-bold text-emerald-600 text-sm mt-0.5">{t.performance || 0}%</div>
                  </div>
                </div>

                {/* Footer Action & Status */}
                <div className="flex items-center justify-between pt-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                      isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                      }`}
                    ></span>
                    {isActive ? 'Active Today' : 'Offline'}
                  </span>

                  <button
                    onClick={() => navigate(`/admin/telecallers/${t.employeeId}`)}
                    className="text-xs font-bold text-slate-900 group-hover:text-blue-600 flex items-center gap-1 bg-slate-100 group-hover:bg-blue-50 px-3.5 py-1.5 rounded-xl transition-all"
                  >
                    View Tracking <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Telecaller Profile Modal */}
      <EditTelecallerModal
        isOpen={Boolean(selectedForEdit)}
        onClose={() => setSelectedForEdit(null)}
        telecaller={selectedForEdit}
        onSaveSuccess={(updatedUser) => {
          setTelecallers((prev) =>
            prev.map((t) =>
              t.employeeId === updatedUser.employeeId
                ? {
                    ...t,
                    name: updatedUser.name || t.name,
                    store: updatedUser.store !== undefined ? updatedUser.store : t.store,
                    role: updatedUser.role || t.role,
                    phone: updatedUser.phone !== undefined ? updatedUser.phone : t.phone,
                    email: updatedUser.email !== undefined ? updatedUser.email : t.email,
                    active: updatedUser.active !== undefined ? updatedUser.active : t.active,
                  }
                : t
            )
          );
        }}
      />
    </div>
  );
};

export default Telecallers;
