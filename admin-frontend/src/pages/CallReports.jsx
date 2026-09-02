import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Search, Calendar, ChevronDown, Download, X } from 'lucide-react';

const CallReports = () => {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const todayStr = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  // Date range state (default to today)
  const [fromDate, setFromDate] = useState(todayStr());
  const [toDate, setToDate] = useState(todayStr());
  const [tempFromDate, setTempFromDate] = useState(todayStr());
  const [tempToDate, setTempToDate] = useState(todayStr());
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerRef = useRef(null);

  // Telecaller dropdown state
  const [selectedTelecaller, setSelectedTelecaller] = useState('All Telecallers');
  const [isTelecallerOpen, setIsTelecallerOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        let query = '';
        if (fromDate && toDate) {
          query += `?fromDate=${fromDate}&toDate=${toDate}`;
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
  }, [fromDate, toDate]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsTelecallerOpen(false);
      }
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setIsDatePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const telecallerNames = ['All Telecallers', ...new Set(leaderboard.map(item => item.name).filter(Boolean))];

  const filteredLeaderboard = leaderboard.filter(item => {
    const matchesTelecaller = selectedTelecaller === 'All Telecallers' || item.name === selectedTelecaller;
    const matchesSearch = !searchTerm ||
      (item.name && item.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.employeeId && item.employeeId.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesTelecaller && matchesSearch;
  });

  const handleExportCSV = () => {
    let query = '';
    if (fromDate && toDate) {
      query += `?fromDate=${fromDate}&toDate=${toDate}`;
    }
    window.open(`/api/admin/reports/completed-leads/export${query}`, '_blank');
  };

  const applyDateRange = () => {
    setFromDate(tempFromDate);
    setToDate(tempToDate);
    setIsDatePickerOpen(false);
  };

  const clearDateRange = () => {
    setFromDate('');
    setToDate('');
    setTempFromDate('');
    setTempToDate('');
    setIsDatePickerOpen(false);
  };

  const getDateRangeDisplay = () => {
    if (fromDate && toDate) {
      const formatDate = (dateStr) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        if (!y || !m || !d) return dateStr;
        return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      };
      if (fromDate === toDate) {
        return formatDate(fromDate);
      }
      return `${formatDate(fromDate)} - ${formatDate(toDate)}`;
    }
    return 'All Time';
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Call Reports</h1>
          <p className="text-slate-500 text-xs sm:text-[15px] mt-1 font-medium">Telecaller performance reports, call categories breakdown & exports</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Telecaller Dropdown */}
          <div className="relative w-full sm:w-auto flex-1 sm:flex-none" ref={dropdownRef}>
            <button
              onClick={() => setIsTelecallerOpen(!isTelecallerOpen)}
              className="bg-white border border-slate-200 text-slate-600 px-4 py-2.5 rounded-xl text-sm font-medium flex items-center shadow-sm hover:bg-slate-50 transition-colors w-full sm:w-44 justify-between"
            >
              <span className="truncate">{selectedTelecaller}</span>
              <ChevronDown className="w-4 h-4 ml-2 text-slate-400 shrink-0" />
            </button>

            {isTelecallerOpen && (
              <div className="absolute z-10 top-full left-0 sm:left-auto sm:right-0 mt-1 w-full sm:w-44 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1">
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

          <button onClick={handleExportCSV} className="w-full sm:w-auto justify-center bg-[#1e293b] hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold flex items-center shadow-sm transition-colors">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Leaderboard Table Container */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-visible mt-4">
        <div className="p-4 sm:p-7 pb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-lg sm:text-[22px] font-bold text-slate-900 tracking-tight">Call Performance Leaderboard</h2>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
            <div className="relative group w-full sm:w-auto">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 group-focus-within:text-slate-600 transition-colors" />
              <input
                type="text"
                placeholder="Search Telecaller"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2.5 rounded-full border border-slate-200 text-sm focus:ring-4 focus:ring-slate-100 outline-none w-full sm:w-64 transition-all"
              />
            </div>

            {/* Custom Date Range Picker */}
            <div className="relative w-full sm:w-auto" ref={datePickerRef}>
              <button
                onClick={() => {
                  setTempFromDate(fromDate);
                  setTempToDate(toDate);
                  setIsDatePickerOpen(!isDatePickerOpen);
                }}
                className={`w-full sm:w-auto justify-center flex items-center gap-2 px-5 py-2.5 border rounded-full text-sm font-semibold transition-colors ${fromDate ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <Calendar className="w-4 h-4 text-slate-400" />
                {getDateRangeDisplay()}
              </button>

              {isDatePickerOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-xl border border-slate-100 p-5 z-20">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-slate-800">Select Date Range</h3>
                    <button onClick={() => setIsDatePickerOpen(false)} className="text-slate-400 hover:text-slate-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">From Date</label>
                      <input
                        type="date"
                        value={tempFromDate}
                        onChange={(e) => setTempFromDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-100 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">To Date</label>
                      <input
                        type="date"
                        value={tempToDate}
                        onChange={(e) => setTempToDate(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-slate-100 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={clearDateRange}
                      className="flex-1 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      disabled={!tempFromDate || !tempToDate || tempFromDate > tempToDate}
                      onClick={applyDateRange}
                      className="flex-1 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto px-7 pb-4">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="text-[11px] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200/60">
                <th className="py-4 px-2 w-1/4">Employee</th>
                <th className="py-4 px-2 text-center">Total Calls</th>
                <th className="py-4 px-2 text-center">Feedback </th>
                <th className="py-4 px-2 text-center">Booking Confirmation </th>
                <th className="py-4 px-2 text-center">Just Dial</th>
                <th className="py-4 px-2 text-center">Enquiry</th>
                <th className="py-4 px-2 text-center">Booked</th>
                <th className="py-4 px-2 text-center">Follow-up</th>
                <th className="py-4 px-2 text-center">Loss of Sale</th>
                <th className="py-4 px-2 text-center">Performance</th>
                <th className="py-4 px-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="11" className="text-center py-8 text-slate-400">Loading...</td></tr>
              ) : filteredLeaderboard.length === 0 ? (
                <tr><td colSpan="11" className="text-center py-8 text-slate-400">No telecallers found.</td></tr>
              ) : filteredLeaderboard.map((row) => {
                const isOnline = Boolean(row.lastLoginAt && new Date(row.lastLoginAt) > new Date(Date.now() - 12 * 60 * 60 * 1000));
                return (
                  <tr
                    key={row.employeeId}
                    className="hover:bg-slate-50/50 cursor-pointer transition-colors group"
                    onClick={() => navigate(`/admin/telecallers/${row.employeeId}`)}
                  >
                    <td className="py-4 px-2">
                      <div className="font-semibold text-slate-800">{row.name}</div>
                      <div className="text-[11px] font-bold tracking-wide text-slate-500 mt-0.5">{row.employeeId}</div>
                    </td>
                    <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.totalCalls}</td>
                    <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.feedbackCalls}</td>
                    <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.bookingConfirmationCalls}</td>
                    <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.justDial}</td>
                    <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.enquiryCalls}</td>
                    <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.booked}</td>
                    <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.followup ?? row.followupsDone}</td>
                    <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.lossOfSale}</td>
                    <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.performance}%</td>
                    <td className="py-4 px-2 text-right" onClick={(e) => e.stopPropagation()}>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          isOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                          }`}
                        ></span>
                        {isOnline ? 'Online' : 'Offline'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CallReports;
