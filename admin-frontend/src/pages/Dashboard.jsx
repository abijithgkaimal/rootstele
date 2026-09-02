import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import {
  Phone,
  Headphones,
  Calendar,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  Download,
  MessageSquare,
  MessageCircle,
  Sparkles,
  Send,
  ArrowRight,
  Shield,
  Building,
  CheckCircle2
} from 'lucide-react';

const StatCard = ({ title, value, subtitle, icon: Icon, color, trend, cardBg }) => (
  <div className={`${cardBg || 'bg-white'} rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col relative`}>
    <div className="flex justify-between items-start mb-4">
      <h3 className="text-slate-600 font-medium text-sm leading-snug">{title}</h3>
      <div className={`p-2.5 rounded-xl ${color.bg} ${color.text}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
    <div className="mt-2">
      <span className={`text-[28px] leading-none font-bold ${cardBg ? 'text-rose-500' : 'text-slate-800'}`}>
        {value}
      </span>
      <p className={`text-xs mt-3 font-medium ${trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-rose-500' : 'text-slate-500'}`}>
        {subtitle}
      </p>
    </div>
  </div>
);

const ChannelMiniBadge = ({ channel }) => {
  const ch = (channel || '').toLowerCase();
  if (ch === 'whatsapp') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        WhatsApp
      </span>
    );
  }
  if (ch === 'instagram') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-pink-50 text-pink-700">
        <span className="w-1.5 h-1.5 rounded-full bg-pink-500"></span>
        Instagram
      </span>
    );
  }
  if (ch === 'facebook') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
        Facebook
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700">
      {channel}
    </span>
  );
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({
    totalLeads: 0,
    completedLeads: 0,
    totalLossOfSaleLeads: 0,
    followupLeadsToBeCalled: 0,
    totalComplaints: 0,
    chats: {
      totalChats: 0,
      openChats: 0,
      resolvedChats: 0,
      whatsappChats: 0,
      instagramChats: 0,
      facebookChats: 0,
      convertedLeadsFromChat: 0,
      brands: {
        suitor_guy: 0,
        zorucci: 0,
        dapper_squad: 0
      },
      recentConversations: []
    }
  });
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('TODAY');

  const todayStr = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const [customFromDate, setCustomFromDate] = useState(todayStr());
  const [customToDate, setCustomToDate] = useState(todayStr());

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let queryParams = '';
        const today = new Date();
        let fromDate = null;
        let toDate = null;

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

        if (fromDate && toDate) {
          queryParams = `?fromDate=${fromDate}&toDate=${toDate}`;
        }

        const res = await axios.get(`/api/admin/dashboard-summary${queryParams}`);
        if (res.data.success) {
          setSummary(res.data.data);
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateFilter, customFromDate, customToDate]);

  const handleExportCSV = () => {
    let queryParams = '';
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (dateFilter === 'TODAY') {
      const d = toYMD(today);
      queryParams = `?fromDate=${d}&toDate=${d}`;
    } else if (dateFilter === 'YESTERDAY') {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      const d = toYMD(yesterday);
      queryParams = `?fromDate=${d}&toDate=${d}`;
    } else if (dateFilter === 'THIS MONTH') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      queryParams = `?fromDate=${toYMD(firstDay)}&toDate=${toYMD(lastDay)}`;
    } else if (dateFilter === 'CUSTOM' && customFromDate && customToDate) {
      queryParams = `?fromDate=${customFromDate}&toDate=${customToDate}`;
    }

    window.open(`/api/admin/reports/completed-leads/export${queryParams}`, '_blank');
  };

  const chats = summary.chats || {};
  const totalCombinedInteractions = (summary.totalLeads || 0) + (chats.totalChats || 0);

  return (
    <div className="max-w-[1400px] mx-auto space-y-6 sm:space-y-8">
      {/* Header section */}
      <div className="flex flex-col space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Executive Dashboard</h1>
            <p className="text-slate-500 text-xs sm:text-[15px] mt-1 font-medium">
              Overall view of calling operations, multi-channel chats & store performance
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
            {['YESTERDAY', 'TODAY', 'THIS MONTH', 'CUSTOM'].map((filter) => (
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
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm w-full sm:w-auto">
              <div className="flex items-center justify-between sm:justify-start gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-2">From:</span>
                <input
                  type="date"
                  value={customFromDate}
                  onChange={(e) => setCustomFromDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 flex-1 sm:flex-none"
                />
              </div>
              <div className="flex items-center justify-between sm:justify-start gap-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider pl-2 sm:pl-0">To:</span>
                <input
                  type="date"
                  value={customToDate}
                  onChange={(e) => setCustomToDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 flex-1 sm:flex-none"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Primary Stats Grid (Calls + Chats Combined) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
        <StatCard
          title="Total Leads"
          value={loading ? '-' : summary.totalLeads}
          subtitle="Call inquiries & syncs"
          trend="up"
          icon={Phone}
          color={{ bg: 'bg-slate-100', text: 'text-slate-800' }}
        />
        <StatCard
          title="Completed Calls"
          value={loading ? '-' : summary.completedLeads}
          subtitle="Telecalling calls attended"
          trend="up"
          icon={Headphones}
          color={{ bg: 'bg-emerald-100/60', text: 'text-emerald-600' }}
        />
        <StatCard
          title="Total Chats"
          value={loading ? '-' : (chats.totalChats || 0)}
          subtitle="WhatsApp, Insta & FB"
          trend="up"
          icon={MessageSquare}
          color={{ bg: 'bg-indigo-100/60', text: 'text-indigo-600' }}
        />
        <StatCard
          title="Converted to Leads"
          value={loading ? '-' : (chats.convertedLeadsFromChat || 0)}
          subtitle="Chat-to-CRM conversions"
          trend="up"
          icon={TrendingUp}
          color={{ bg: 'bg-amber-100/60', text: 'text-amber-600' }}
        />
        <StatCard
          title="Follow-ups Pending"
          value={loading ? '-' : summary.followupLeadsToBeCalled}
          subtitle="Scheduled callbacks"
          icon={Calendar}
          color={{ bg: 'bg-purple-100/60', text: 'text-purple-600' }}
        />
      </div>

      {/* Dual Deep-Dive Operational Containers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Calling & Lead Operations Overview */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col justify-between space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-50 text-orange-600">
                <Headphones className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Call Operations Summary</h2>
                <p className="text-xs text-slate-500 font-medium">Telecaller calling performance & lead categories</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/admin/call-reports')}
              className="text-xs font-bold text-slate-900 hover:text-slate-700 flex items-center gap-1 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl transition-colors"
            >
              View Call Reports <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Calls 4-grid breakdown */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100/80">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Completed Calls</span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{summary.completedLeads}</div>
              <p className="text-[11px] text-emerald-600 font-medium mt-1">Processed successfully</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100/80">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Follow-ups</span>
              <div className="text-2xl font-bold text-slate-900 mt-1">{summary.followupLeadsToBeCalled}</div>
              <p className="text-[11px] text-purple-600 font-medium mt-1">Awaiting callback</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100/80">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Loss of Sale</span>
              <div className="text-2xl font-bold text-rose-600 mt-1">{summary.totalLossOfSaleLeads}</div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">Unconverted opportunities</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100/80">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Complaints</span>
              <div className="text-2xl font-bold text-rose-500 mt-1">{summary.totalComplaints}</div>
              <p className="text-[11px] text-slate-500 font-medium mt-1">Flagged for resolution</p>
            </div>
          </div>
        </div>

        {/* Right: Multi-Channel Chat Operations Overview */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 flex flex-col justify-between space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Multi-Channel Chat Operations</h2>
                <p className="text-xs text-slate-500 font-medium">WhatsApp, Instagram & Facebook live metrics</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/admin/reports')}
              className="text-xs font-bold text-slate-900 hover:text-slate-700 flex items-center gap-1 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl transition-colors"
            >
              View Chat Reports <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 3 Channels Row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-2xl bg-emerald-50/50 border border-emerald-100/80 text-center">
              <div className="flex items-center justify-center gap-1.5 text-emerald-700 font-bold text-xs uppercase mb-1">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </div>
              <div className="text-2xl font-bold text-emerald-900">{chats.whatsappChats || 0}</div>
              <p className="text-[11px] text-emerald-600 font-medium mt-1">Direct WA Chats</p>
            </div>

            <div className="p-4 rounded-2xl bg-pink-50/50 border border-pink-100/80 text-center">
              <div className="flex items-center justify-center gap-1.5 text-pink-700 font-bold text-xs uppercase mb-1">
                <Sparkles className="w-4 h-4" /> Instagram
              </div>
              <div className="text-2xl font-bold text-pink-900">{chats.instagramChats || 0}</div>
              <p className="text-[11px] text-pink-600 font-medium mt-1">Direct DMs</p>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100/80 text-center">
              <div className="flex items-center justify-center gap-1.5 text-blue-700 font-bold text-xs uppercase mb-1">
                <MessageSquare className="w-4 h-4" /> Facebook
              </div>
              <div className="text-2xl font-bold text-blue-900">{chats.facebookChats || 0}</div>
              <p className="text-[11px] text-blue-600 font-medium mt-1">Messenger Chats</p>
            </div>
          </div>

          {/* Brand breakdown pills */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Brand Activity:</span>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-lg bg-cyan-50 text-cyan-800 text-xs font-bold border border-cyan-100">
                Suitor Guy: {chats.brands?.suitor_guy || 0}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-white text-xs font-bold">
                Zorucci: {chats.brands?.zorucci || 0}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 text-xs font-bold border border-purple-100">
                Dapper Squad: {chats.brands?.dapper_squad || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Live Omnichannel Recent Activity Feed */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Recent Customer Chat Interactions</h2>
            <p className="text-xs text-slate-500 font-medium">Real-time incoming multi-channel messages across brands</p>
          </div>
          <button
            onClick={() => navigate('/admin/reports')}
            className="text-xs font-bold text-slate-900 hover:text-slate-700 flex items-center gap-1 bg-slate-50 hover:bg-slate-100 px-3 py-1.5 rounded-xl transition-colors"
          >
            All Logs <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-400 text-sm">Loading recent interactions...</div>
        ) : !chats.recentConversations || chats.recentConversations.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-sm">No recent conversations recorded.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {chats.recentConversations.map((c) => (
              <div
                key={c._id}
                onClick={() => navigate('/admin/reports')}
                className="p-4 rounded-2xl bg-slate-50/70 border border-slate-100 hover:border-slate-300 hover:bg-slate-50 transition-all cursor-pointer flex flex-col justify-between space-y-3"
              >
                <div className="flex items-center justify-between">
                  <ChannelMiniBadge channel={c.channel} />
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                    {c.brandName || c.brand}
                  </span>
                </div>

                <div>
                  <div className="font-bold text-slate-800 text-sm">{c.participant?.name || 'Customer'}</div>
                  <div className="text-xs text-slate-500 mt-0.5 truncate">{c.lastMessage?.text || 'New message'}</div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-200/60 font-medium">
                  <span>Assigned: <strong className="text-slate-700">{c.assignedTo || 'Unassigned'}</strong></span>
                  <span>
                    {c.lastActivityAt
                      ? new Date(c.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : ''}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
