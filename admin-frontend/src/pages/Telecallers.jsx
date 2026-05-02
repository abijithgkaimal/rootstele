import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Search, Calendar, ChevronDown, Download } from 'lucide-react';

const Telecallers = () => {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [selectedTelecaller, setSelectedTelecaller] = useState('All Telecallers');
  const [isTelecallerOpen, setIsTelecallerOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        let query = '';
        if (dateFilter) {
          query = `?fromDate=${dateFilter}&toDate=${dateFilter}`;
        }
        const res = await axios.get(`/api/admin/telecaller-leaderboard${query}`);
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
  }, [dateFilter]);

  // Handle click outside for dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsTelecallerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const telecallerNames = ['All Telecallers', ...Array.from(new Set(leaderboard.map(t => t.name)))];

  const filteredLeaderboard = leaderboard.filter(row => {
    if (selectedTelecaller !== 'All Telecallers' && row.name !== selectedTelecaller) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      if (!row.name.toLowerCase().includes(term) && !row.employeeId.toLowerCase().includes(term)) return false;
    }
    return true;
  });

  const handleExportCSV = () => {
    let query = '';
    if (dateFilter) {
      query = `?fromDate=${dateFilter}&toDate=${dateFilter}`;
    }
    window.open(`/api/admin/reports/completed-leads/export${query}`, '_blank');
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-[28px] font-bold text-slate-900 tracking-tight">Call Category Report</h1>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Telecaller Dropdown */}
          <div className="relative" ref={dropdownRef}>
            <button 
              onClick={() => setIsTelecallerOpen(!isTelecallerOpen)}
              className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center shadow-sm hover:bg-slate-50 transition-colors w-44 justify-between"
            >
              <span className="truncate">{selectedTelecaller}</span>
              <ChevronDown className="w-4 h-4 ml-2 text-slate-400 shrink-0" />
            </button>
            
            {isTelecallerOpen && (
              <div className="absolute z-10 top-full left-0 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1">
                {telecallerNames.map(name => (
                  <button
                    key={name}
                    onClick={() => {
                      setSelectedTelecaller(name);
                      setIsTelecallerOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 transition-colors ${selectedTelecaller === name ? 'text-slate-900 font-semibold bg-slate-50' : 'text-slate-600'}`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={handleExportCSV} className="bg-[#1e293b] hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center shadow-sm transition-colors">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Leaderboard Table Container */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden mt-4">
        <div className="p-7 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-[22px] font-bold text-slate-900 tracking-tight">Telecaller Leaderboard</h2>
          
          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
              <input
                type="text"
                placeholder="Search Telecaller"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2.5 rounded-full border border-slate-200 text-sm focus:ring-4 focus:ring-slate-100 outline-none w-64 transition-all"
              />
            </div>
            <div className="relative">
              <button className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 rounded-full text-sm text-slate-600 font-semibold bg-white hover:bg-slate-50 transition-colors overflow-hidden relative">
                <Calendar className="w-4 h-4 text-slate-400" />
                {dateFilter ? new Date(dateFilter).toLocaleDateString('en-GB') : 'Date Range'}
                {/* Invisible date input strictly for opening native calendar picker */}
                <input 
                  type="date" 
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                />
              </button>
            </div>
          </div>
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

export default Telecallers;
