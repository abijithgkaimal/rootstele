import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Search, Calendar, ChevronDown, Download } from 'lucide-react';

const Telecallers = () => {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const res = await axios.get('/api/admin/telecaller-leaderboard');
        if (res.data.success) {
          setLeaderboard(res.data.data.telecallers);
        }
      } catch (error) {
        console.error('Error fetching leaderboard:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchLeaderboard();
  }, []);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-slate-900">Call Category Report</h1>
        
        <div className="flex flex-wrap items-center gap-3">
          <button className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium flex items-center shadow-sm">
            Telecaller
            <ChevronDown className="w-4 h-4 ml-2 text-slate-400" />
          </button>
          <button className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium flex items-center shadow-sm">
            Call Type
            <ChevronDown className="w-4 h-4 ml-2 text-slate-400" />
          </button>
          <button className="bg-white border border-slate-200 text-slate-600 px-4 py-2 rounded-lg text-sm font-medium flex items-center shadow-sm">
            Date Range
            <ChevronDown className="w-4 h-4 ml-2 text-slate-400" />
          </button>
          <button className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center shadow-sm transition-colors">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Leaderboard Table Container */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-lg font-bold text-slate-900">Telecaller Leaderboard</h2>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search Telecaller"
                className="pl-9 pr-4 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-slate-200 outline-none w-64"
              />
            </div>
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 font-medium bg-white hover:bg-slate-50 transition-colors">
              <Calendar className="w-4 h-4 text-slate-400" />
              02-12-2025
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
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
              ) : leaderboard.length === 0 ? (
                <tr><td colSpan="7" className="text-center py-8 text-slate-400">No telecallers active.</td></tr>
              ) : leaderboard.map((row) => (
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

export default Telecallers;
