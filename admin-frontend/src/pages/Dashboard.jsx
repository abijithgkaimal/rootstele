import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Download, Phone, Headphones, TrendingDown, Calendar, AlertCircle } from 'lucide-react';

const StatCard = ({ title, value, subtitle, icon: Icon, color, trend, cardBg }) => (
  <div className={`${cardBg || 'bg-white'} rounded-2xl border border-slate-100 p-6 shadow-sm flex flex-col relative`}>
    <div className="flex justify-between items-start mb-4">
      <h3 className="text-slate-600 font-medium text-sm w-24 leading-snug">{title}</h3>
      <div className={`p-2 rounded-xl ${color.bg} ${color.text}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
    <div className="mt-2">
      <span className={`text-[28px] leading-none font-bold ${cardBg ? 'text-rose-500' : 'text-slate-800'}`}>{value}</span>
      <p className={`text-xs mt-3 font-medium ${trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-rose-500' : 'text-slate-500'}`}>
        {subtitle}
      </p>
    </div>
  </div>
);

const Dashboard = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState({
    totalLeads: 0,
    completedLeads: 0,
    totalLossOfSaleLeads: 0,
    followupLeadsToBeCalled: 0,
    totalComplaints: 0
  });
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState('TODAY');

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
        }

        if (fromDate && toDate) {
          queryParams = `?fromDate=${fromDate}&toDate=${toDate}`;
        }

        const [summaryRes, leaderRes] = await Promise.all([
          axios.get(`/api/admin/dashboard-summary${queryParams}`),
          axios.get(`/api/admin/telecaller-leaderboard${queryParams}`)
        ]);
        
        if (summaryRes.data.success) setSummary(summaryRes.data.data);
        if (leaderRes.data.success) setLeaderboard(leaderRes.data.data.telecallers);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [dateFilter]);

  const handleExportCSV = () => {
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
    }

    if (fromDate && toDate) {
      queryParams = `?fromDate=${fromDate}&toDate=${toDate}`;
    }

    window.open(`/api/admin/reports/completed-leads/export${queryParams}`, '_blank');
  };

  // Use Context for Search
  const outletContext = useOutletContext();
  const searchTerm = outletContext?.searchTerm || '';

  // Filter the leaderboard based on the searchTerm
  const filteredLeaderboard = leaderboard.filter(row => {
    if (!searchTerm) return true;
    const lowerTerm = searchTerm.toLowerCase();
    return (
      (row.name && row.name.toLowerCase().includes(lowerTerm)) ||
      (row.employeeId && row.employeeId.toLowerCase().includes(lowerTerm))
    );
  });

  return (
    <div className="max-w-[1400px] mx-auto space-y-8">
      {/* Header section */}
      <div className="flex flex-col space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Dashboard</h1>
            <p className="text-slate-500 text-[15px] mt-1 font-medium">Overview of all telecalling activities</p>
          </div>
          <button onClick={handleExportCSV} className="bg-[#1e293b] hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center shadow-sm transition-colors">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
        
        <div className="flex bg-[#eef2f6] p-1.5 rounded-full w-max">
          {['YESTERDAY', 'TODAY', 'THIS MONTH', 'CUSTOM'].map((filter) => (
            <button
              key={filter}
              onClick={() => setDateFilter(filter)}
              className={`px-6 py-2 text-xs font-bold tracking-wide rounded-full transition-all ${
                filter === dateFilter 
                  ? 'bg-white text-slate-900 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-5">
        <StatCard
          title="Total Leads"
          value={loading ? '-' : summary.totalLeads}
          subtitle="+5% from yesterday"
          trend="up"
          icon={Phone}
          color={{ bg: 'bg-emerald-100/60', text: 'text-emerald-600' }}
        />
        <StatCard
          title="Completed Leads"
          value={loading ? '-' : summary.completedLeads}
          subtitle="+8% from yesterday"
          trend="up"
          icon={Headphones}
          color={{ bg: 'bg-orange-100/60', text: 'text-orange-500' }}
        />
        <StatCard
          title="Total Loss of Sale Leads"
          value={loading ? '-' : summary.totalLossOfSaleLeads}
          subtitle="+6% from yesterday"
          trend="down"
          icon={TrendingDown}
          color={{ bg: 'bg-rose-100/60', text: 'text-rose-500' }}
        />
        <StatCard
          title="Follow Ups Completed"
          value={loading ? '-' : summary.followupLeadsToBeCalled}
          subtitle="+8% from yesterday"
          trend="up"
          icon={Calendar}
          color={{ bg: 'bg-slate-100', text: 'text-slate-600' }}
        />
        <StatCard
          title="Total Complaints"
          value={loading ? '-' : summary.totalComplaints}
          subtitle="+1.2% from yesterday"
          trend="down"
          icon={AlertCircle}
          color={{ bg: 'bg-rose-100/80', text: 'text-rose-500' }}
          cardBg="bg-rose-50/50"
        />
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mt-4">
        <div className="p-7 pb-5">
          <h2 className="text-[22px] font-bold text-slate-900 tracking-tight">Telecaller Leaderboard</h2>
        </div>
        
        <div className="overflow-x-auto px-7 pb-4">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-[11px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200/60">
                <th className="py-4 px-2 w-1/4">Employee</th>
                <th className="py-4 px-2 text-center">Total Calls</th>
                <th className="py-4 px-2 text-center">Feedback Calls</th>
                <th className="py-4 px-2 text-center">Booking Confirmation Calls</th>
                <th className="py-4 px-2 text-center">Follow-ups Done</th>
                <th className="py-4 px-2 text-center">Loss of Sale</th>
                <th className="py-4 px-2 text-center">Performance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="7" className="text-center py-8 text-slate-400">Loading...</td></tr>
              ) : filteredLeaderboard.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-8 text-slate-400">No telecallers active in selected range.</td></tr>
              ) : filteredLeaderboard.map((row) => (
                <tr 
                  key={row.employeeId} 
                  className="hover:bg-slate-50/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/telecallers/${row.employeeId}`)}
                >
                  <td className="py-4 px-2">
                    <div className="font-semibold text-slate-800">{row.name}</div>
                    <div className="text-[11px] font-bold tracking-wide text-slate-500 mt-1">{row.employeeId}</div>
                  </td>
                  <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.totalCalls}</td>
                  <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.feedbackCalls}</td>
                  <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.bookingConfirmationCalls}</td>
                  <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.followupsDone}</td>
                  <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.lossOfSale}</td>
                  <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.performance}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
