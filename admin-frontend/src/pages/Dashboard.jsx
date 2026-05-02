import React, { useState, useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import axios from 'axios';
import { Download, PhoneCall, Headphones, TrendingDown, Calendar, AlertCircle, Search } from 'lucide-react';

const StatCard = ({ title, value, subtitle, icon: Icon, color, trend }) => (
  <div className="bg-white rounded-xl border border-slate-100 p-5 shadow-sm flex flex-col relative overflow-hidden">
    <div className="flex justify-between items-start mb-4">
      <h3 className="text-slate-600 font-medium text-sm w-32 leading-tight">{title}</h3>
      <div className={`p-2 rounded-lg ${color.bg} ${color.text}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
    <div className="mt-auto">
      <span className="text-3xl font-bold text-slate-800">{value}</span>
      <p className={`text-xs mt-2 font-medium ${trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-rose-500' : 'text-slate-500'}`}>
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
  const [dateFilter, setDateFilter] = useState('ALL');

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
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Overview of all telecalling activities</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex bg-slate-200/50 p-1 rounded-lg overflow-x-auto w-full sm:w-auto">
            {['ALL', 'YESTERDAY', 'TODAY', 'THIS MONTH'].map((filter) => (
              <button
                key={filter}
                onClick={() => setDateFilter(filter)}
                className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  filter === dateFilter 
                    ? 'bg-white text-slate-900 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
          <button onClick={handleExportCSV} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center transition-colors shadow-sm w-full sm:w-auto justify-center">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Total Leads"
          value={loading ? '-' : summary.totalLeads}
          subtitle=""
          trend="up"
          icon={PhoneCall}
          color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }}
        />
        <StatCard
          title="Completed Leads"
          value={loading ? '-' : summary.completedLeads}
          subtitle=""
          trend="up"
          icon={Headphones}
          color={{ bg: 'bg-orange-100', text: 'text-orange-600' }}
        />
        <StatCard
          title="Total Loss of Sale Leads"
          value={loading ? '-' : summary.totalLossOfSaleLeads}
          subtitle=""
          trend="down"
          icon={TrendingDown}
          color={{ bg: 'bg-rose-100', text: 'text-rose-600' }}
        />
        <StatCard
          title="Follow Ups Completed"
          value={loading ? '-' : summary.followupLeadsToBeCalled}
          subtitle=""
          trend="up"
          icon={Calendar}
          color={{ bg: 'bg-slate-100', text: 'text-slate-600' }}
        />
        <StatCard
          title="Total Complaints"
          value={loading ? '-' : summary.totalComplaints}
          subtitle=""
          trend="down"
          icon={AlertCircle}
          color={{ bg: 'bg-rose-100', text: 'text-rose-600' }}
        />
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">Telecaller Leaderboard</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="text-xs text-slate-500 font-bold uppercase bg-slate-50/50">
              <tr>
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4 text-center">Total Calls</th>
                <th className="px-6 py-4 text-center">Connected</th>
                <th className="px-6 py-4 text-center">Not Connected</th>
                <th className="px-6 py-4 text-center">Follow-ups Done</th>
                <th className="px-6 py-4 text-center">Loss of Sale</th>
                <th className="px-6 py-4 text-center">Performance</th>
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
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/admin/telecallers/${row.employeeId}`)}
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{row.name}</div>
                    <div className="text-xs text-slate-500 uppercase">{row.employeeId}</div>
                  </td>
                  <td className="px-6 py-4 text-center font-medium">{row.totalCalls}</td>
                  <td className="px-6 py-4 text-center font-medium">{row.connectedCalls}</td>
                  <td className="px-6 py-4 text-center font-medium">{row.notConnectedCalls}</td>
                  <td className="px-6 py-4 text-center font-medium">{row.followupsDone}</td>
                  <td className="px-6 py-4 text-center font-medium">{row.lossOfSale}</td>
                  <td className="px-6 py-4 text-center font-medium">{row.performance}%</td>
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
