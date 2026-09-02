import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import axios from 'axios';
import {
  MessageSquare,
  MessageCircle,
  Send,
  Sparkles,
  TrendingUp,
  Download,
  Search,
  CheckCircle,
  Users
} from 'lucide-react';

const StatCard = ({ title, value, subtitle, icon: Icon, color, trend }) => (
  <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col relative">
    <div className="flex justify-between items-start mb-4">
      <h3 className="text-slate-600 font-medium text-sm w-28 leading-snug">{title}</h3>
      <div className={`p-2.5 rounded-xl ${color.bg} ${color.text}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
    <div className="mt-2">
      <span className="text-[28px] leading-none font-bold text-slate-800">
        {value}
      </span>
      <p className={`text-xs mt-3 font-medium ${trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-rose-500' : 'text-slate-500'}`}>
        {subtitle}
      </p>
    </div>
  </div>
);

const ChannelBadge = ({ channel }) => {
  const ch = (channel || '').toLowerCase();
  if (ch === 'whatsapp') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        WhatsApp
      </span>
    );
  }
  if (ch === 'instagram') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-pink-50 text-pink-700">
        <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
        Instagram
      </span>
    );
  }
  if (ch === 'facebook') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
        Facebook
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
      {channel}
    </span>
  );
};

const BrandBadge = ({ brand, brandName }) => {
  const b = (brand || '').toLowerCase();
  let style = 'bg-slate-100 text-slate-700';
  if (b === 'suitor_guy') style = 'bg-cyan-50 text-cyan-800';
  if (b === 'zorucci') style = 'bg-slate-800 text-white';
  if (b === 'dapper_squad') style = 'bg-purple-50 text-purple-800';

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${style}`}>
      {brandName || brand}
    </span>
  );
};

const ChatReports = () => {
  const [activeTab, setActiveTab] = useState('telecallers'); // 'telecallers' | 'conversations'
  const [summary, setSummary] = useState({
    totalConversations: 0,
    whatsappConversations: 0,
    instagramConversations: 0,
    facebookConversations: 0,
    convertedLeadsCount: 0,
    totalOutboundMessages: 0
  });
  const [telecallers, setTelecallers] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [dateFilter, setDateFilter] = useState('TODAY');
  const [channelFilter, setChannelFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');
  const [localSearch, setLocalSearch] = useState('');

  // Context search support
  const outletContext = useOutletContext();
  const contextSearch = outletContext?.searchTerm || '';
  const effectiveSearch = localSearch || contextSearch;

  const todayStr = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const [customFromDate, setCustomFromDate] = useState(todayStr());
  const [customToDate, setCustomToDate] = useState(todayStr());

  // Fetch Data
  const fetchData = async () => {
    setLoading(true);
    try {
      let fromDate = null;
      let toDate = null;
      const today = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

      if (dateFilter === 'TODAY') {
        fromDate = toYMD(today);
        toDate = fromDate;
      } else if (dateFilter === 'YESTERDAY') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        fromDate = toYMD(yesterday);
        toDate = fromDate;
      } else if (dateFilter === 'THIS MONTH') {
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        fromDate = toYMD(firstDay);
        toDate = toYMD(lastDay);
      } else if (dateFilter === 'CUSTOM') {
        if (customFromDate && customToDate) {
          fromDate = customFromDate;
          toDate = customToDate;
        }
      }

      const params = new URLSearchParams();
      if (fromDate) params.append('fromDate', fromDate);
      if (toDate) params.append('toDate', toDate);
      if (channelFilter !== 'all') params.append('channel', channelFilter);
      if (brandFilter !== 'all') params.append('brand', brandFilter);

      const [sumRes, teleRes] = await Promise.all([
        axios.get(`/api/admin/chat-reports/summary?${params.toString()}`),
        axios.get(`/api/admin/chat-reports/telecaller-performance?${params.toString()}`)
      ]);

      if (sumRes.data.success) setSummary(sumRes.data.data);
      if (teleRes.data.success) setTelecallers(teleRes.data.data.telecallers);

      if (activeTab === 'conversations') {
        params.append('page', 1);
        params.append('limit', 50);
        const convRes = await axios.get(`/api/admin/chat-reports/conversations?${params.toString()}`);
        if (convRes.data.success) {
          setConversations(convRes.data.data.conversations);
        }
      }
    } catch (err) {
      console.error('Error fetching chat reports:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateFilter, customFromDate, customToDate, channelFilter, brandFilter, activeTab]);

  const handleExportCSV = () => {
    const params = new URLSearchParams();
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (dateFilter === 'TODAY') {
      const d = toYMD(today);
      params.append('fromDate', d);
      params.append('toDate', d);
    } else if (dateFilter === 'YESTERDAY') {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      const d = toYMD(y);
      params.append('fromDate', d);
      params.append('toDate', d);
    } else if (dateFilter === 'THIS MONTH') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      params.append('fromDate', toYMD(firstDay));
      params.append('toDate', toYMD(lastDay));
    } else if (dateFilter === 'CUSTOM' && customFromDate && customToDate) {
      params.append('fromDate', customFromDate);
      params.append('toDate', customToDate);
    }

    if (channelFilter !== 'all') params.append('channel', channelFilter);
    if (brandFilter !== 'all') params.append('brand', brandFilter);

    window.open(`/api/admin/chat-reports/export?${params.toString()}`, '_blank');
  };

  const filteredTelecallers = telecallers.filter((t) => {
    if (!effectiveSearch) return true;
    const term = effectiveSearch.toLowerCase();
    return (
      (t.name && t.name.toLowerCase().includes(term)) ||
      (t.employeeId && t.employeeId.toLowerCase().includes(term)) ||
      (t.store && t.store.toLowerCase().includes(term))
    );
  });

  const filteredConversations = conversations.filter((c) => {
    if (!effectiveSearch) return true;
    const term = effectiveSearch.toLowerCase();
    return (
      (c.participant?.name && c.participant.name.toLowerCase().includes(term)) ||
      (c.participant?.phone && c.participant.phone.toLowerCase().includes(term)) ||
      (c.assignedTo && c.assignedTo.toLowerCase().includes(term))
    );
  });

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 sm:space-y-8">
      {/* Header section */}
      <div className="flex flex-col space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Chat Reports</h1>
            <p className="text-slate-500 text-xs sm:text-[15px] mt-1 font-medium">
              Overview of all WhatsApp, Instagram & Facebook activities
            </p>
          </div>
          <button
            onClick={handleExportCSV}
            className="w-full sm:w-auto justify-center bg-[#1e293b] hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center shadow-sm transition-colors shrink-0"
          >
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>

        {/* Date Filter Pills */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex bg-[#eef2f6] p-1.5 rounded-full w-full sm:w-max overflow-x-auto max-w-full">
            {['YESTERDAY', 'TODAY', 'THIS MONTH', 'ALL TIME', 'CUSTOM'].map((filter) => (
              <button
                key={filter}
                onClick={() => setDateFilter(filter)}
                className={`flex-1 sm:flex-none px-4 sm:px-6 py-2 text-xs font-bold tracking-wide rounded-full transition-all whitespace-nowrap ${
                  filter === dateFilter
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>

          {dateFilter === 'CUSTOM' && (
            <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-2">From:</span>
                <input
                  type="date"
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">To:</span>
                <input
                  type="date"
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-5">
        <StatCard
          title="Total Chats"
          value={loading ? '-' : (summary.totalConversations ?? 0)}
          subtitle="All channels combined"
          icon={MessageSquare}
          color={{ bg: 'bg-slate-100', text: 'text-slate-800' }}
        />
        <StatCard
          title="WhatsApp"
          value={loading ? '-' : (summary.whatsappConversations ?? 0)}
          subtitle="Direct WA chats"
          icon={MessageCircle}
          color={{ bg: 'bg-emerald-100/60', text: 'text-emerald-600' }}
        />
        <StatCard
          title="Instagram"
          value={loading ? '-' : (summary.instagramConversations ?? 0)}
          subtitle="Instagram DMs"
          icon={Sparkles}
          color={{ bg: 'bg-pink-100/60', text: 'text-pink-600' }}
        />
        <StatCard
          title="Facebook"
          value={loading ? '-' : (summary.facebookConversations ?? 0)}
          subtitle="Messenger chats"
          icon={MessageSquare}
          color={{ bg: 'bg-blue-100/60', text: 'text-blue-600' }}
        />
        <StatCard
          title="Converted Leads"
          value={loading ? '-' : (summary.convertedLeadsCount ?? 0)}
          subtitle="Created in CRM"
          trend="up"
          icon={TrendingUp}
          color={{ bg: 'bg-amber-100/60', text: 'text-amber-600' }}
        />
        <StatCard
          title="Outbound Sent"
          value={loading ? '-' : (summary.totalOutboundMessages ?? 0)}
          subtitle="Telecaller replies"
          icon={Send}
          color={{ bg: 'bg-indigo-100/60', text: 'text-indigo-600' }}
        />
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Controls Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-100">
          {/* Tab Switcher */}
          <div className="flex bg-[#eef2f6] p-1 rounded-full w-full sm:w-max overflow-x-auto">
            <button
              onClick={() => setActiveTab('telecallers')}
              className={`flex-1 sm:flex-none px-4 sm:px-5 py-1.5 text-xs font-bold tracking-wide rounded-full transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'telecallers'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Telecallers ({filteredTelecallers.length})
            </button>
            <button
              onClick={() => setActiveTab('conversations')}
              className={`flex-1 sm:flex-none px-4 sm:px-5 py-1.5 text-xs font-bold tracking-wide rounded-full transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'conversations'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Conversation Logs
            </button>
          </div>

          {/* Filter Selectors & Search */}
          <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="flex-1 sm:flex-none px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="all">All Channels</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="instagram">Instagram</option>
              <option value="facebook">Facebook</option>
            </select>

            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="flex-1 sm:flex-none px-3.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="all">All Brands</option>
              <option value="suitor_guy">Suitor Guy</option>
              <option value="zorucci">Zorucci</option>
              <option value="dapper_squad">Dapper Squad</option>
            </select>

            <div className="relative w-full sm:w-auto flex-1 sm:flex-none">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-slate-200 outline-none w-full sm:w-44 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Tab 1: Telecallers Performance Table */}
        {activeTab === 'telecallers' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200/60">
                  <th className="py-4 px-2 w-1/4">Telecaller</th>
                  <th className="py-4 px-2 text-center">Total Chats</th>
                  <th className="py-4 px-2 text-center">WhatsApp</th>
                  <th className="py-4 px-2 text-center">Instagram</th>
                  <th className="py-4 px-2 text-center">Facebook</th>
                  <th className="py-4 px-2 text-center">Replies Sent</th>
                  <th className="py-4 px-2 text-center">Converted Leads</th>
                  <th className="py-4 px-2 text-center">Resolution Rate</th>
                  <th className="py-4 px-2 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan="9" className="text-center py-8 text-slate-400 font-medium">
                      Loading telecaller analytics...
                    </td>
                  </tr>
                ) : filteredTelecallers.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="text-center py-8 text-slate-400 font-medium">
                      No telecallers found for the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredTelecallers.map((row) => (
                    <tr key={row.employeeId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-2">
                        <div className="font-semibold text-slate-800 flex items-center gap-2">
                          {row.name}
                          {row.store && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] font-medium">
                              {row.store}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-bold tracking-wide text-slate-500 mt-1">
                          {row.employeeId}
                        </div>
                      </td>
                      <td className="py-4 px-2 text-center font-bold text-slate-800">{row.totalChats}</td>
                      <td className="py-4 px-2 text-center font-semibold text-emerald-700">{row.whatsappChats}</td>
                      <td className="py-4 px-2 text-center font-semibold text-pink-700">{row.instagramChats}</td>
                      <td className="py-4 px-2 text-center font-semibold text-blue-700">{row.facebookChats}</td>
                      <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.outboundMessages}</td>
                      <td className="py-4 px-2 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full font-bold text-xs ${
                            row.convertedLeads > 0 ? 'bg-amber-50 text-amber-700' : 'text-slate-500'
                          }`}
                        >
                          {row.convertedLeads}
                        </span>
                      </td>
                      <td className="py-4 px-2 text-center">
                        <span className="font-semibold text-slate-700">{row.resolutionRate}%</span>
                      </td>
                      <td className="py-4 px-2 text-right">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            row.lastLoginAt && new Date(row.lastLoginAt) > new Date(Date.now() - 12 * 60 * 60 * 1000)
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              row.lastLoginAt && new Date(row.lastLoginAt) > new Date(Date.now() - 12 * 60 * 60 * 1000)
                                ? 'bg-emerald-500'
                                : 'bg-slate-400'
                            }`}
                          ></span>
                          {row.lastLoginAt && new Date(row.lastLoginAt) > new Date(Date.now() - 12 * 60 * 60 * 1000)
                            ? 'Active'
                            : 'Offline'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2: Live Conversation Logs */}
        {activeTab === 'conversations' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200/60">
                  <th className="py-4 px-2">Customer</th>
                  <th className="py-4 px-2 text-center">Channel</th>
                  <th className="py-4 px-2 text-center">Brand</th>
                  <th className="py-4 px-2">Assigned To</th>
                  <th className="py-4 px-2 text-center">Status</th>
                  <th className="py-4 px-2 text-center">CRM Lead</th>
                  <th className="py-4 px-2">Last Message</th>
                  <th className="py-4 px-2 text-right">Last Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan="8" className="text-center py-8 text-slate-400 font-medium">
                      Loading conversation logs...
                    </td>
                  </tr>
                ) : filteredConversations.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-8 text-slate-400 font-medium">
                      No conversations found.
                    </td>
                  </tr>
                ) : (
                  filteredConversations.map((c) => (
                    <tr key={c._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-4 px-2">
                        <div className="font-semibold text-slate-800">{c.participant?.name || 'Customer'}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {c.participant?.phone || c.participant?.socialUserId || '-'}
                        </div>
                      </td>
                      <td className="py-4 px-2 text-center">
                        <ChannelBadge channel={c.channel} />
                      </td>
                      <td className="py-4 px-2 text-center">
                        <BrandBadge brand={c.brand} brandName={c.brandName} />
                      </td>
                      <td className="py-4 px-2 font-medium text-slate-700">
                        {c.assignedTo ? (
                          <span className="font-semibold text-slate-800">{c.assignedTo}</span>
                        ) : (
                          <span className="text-slate-400">Unassigned</span>
                        )}
                      </td>
                      <td className="py-4 px-2 text-center">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            c.status === 'open'
                              ? 'bg-blue-50 text-blue-700'
                              : c.status === 'resolved'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {c.status || 'open'}
                        </span>
                      </td>
                      <td className="py-4 px-2 text-center">
                        {c.leadId ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 rounded font-semibold text-xs">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            {c.leadId.leadtype || 'Lead'}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="py-4 px-2 max-w-xs truncate text-slate-600 text-xs font-medium">
                        {c.lastMessage?.text || '-'}
                      </td>
                      <td className="py-4 px-2 text-right text-slate-500 text-xs whitespace-nowrap">
                        {c.lastActivityAt
                          ? new Date(c.lastActivityAt).toLocaleString('en-US', {
                              day: '2-digit',
                              month: 'short',
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            })
                          : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatReports;
