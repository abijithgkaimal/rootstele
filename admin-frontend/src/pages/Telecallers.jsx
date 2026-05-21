import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Search, Calendar, ChevronDown, Download, X } from 'lucide-react';

const Telecallers = () => {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Date range state
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [tempFromDate, setTempFromDate] = useState('');
  const [tempToDate, setTempToDate] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerRef = useRef(null);

  const [selectedTelecaller, setSelectedTelecaller] = useState('All Telecallers');
  const [isTelecallerOpen, setIsTelecallerOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      try {
        let query = '';
        if (fromDate && toDate) {
          query = `?fromDate=${fromDate}&toDate=${toDate}`;
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
    const intervalId = setInterval(fetchLeaderboard, 5 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, [fromDate, toDate]);

  // Handle click outside for dropdowns
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
    if (fromDate && toDate) {
      query = `?fromDate=${fromDate}&toDate=${toDate}`;
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
      const format = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      return `${format(fromDate)} - ${format(toDate)}`;
    }
    return 'Date Range';
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
              <div className="absolute z-10 top-full right-0 mt-1 w-44 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto py-1">
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
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-visible mt-4">
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

            {/* Custom Date Range Picker */}
            <div className="relative" ref={datePickerRef}>
              <button
                onClick={() => {
                  setTempFromDate(fromDate);
                  setTempToDate(toDate);
                  setIsDatePickerOpen(!isDatePickerOpen);
                }}
                className={`flex items-center gap-2 px-5 py-2.5 border rounded-full text-sm font-semibold transition-colors ${fromDate ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
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
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">To Date</label>
                      <input
                        type="date"
                        value={tempToDate}
                        onChange={(e) => setTempToDate(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2 mt-6">
                    <button
                      onClick={clearDateRange}
                      className="flex-1 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
                    >
                      Clear
                    </button>
                    <button
                      onClick={applyDateRange}
                      disabled={!tempFromDate || !tempToDate || tempFromDate > tempToDate}
                      className="flex-1 px-3 py-2 bg-slate-800 text-white rounded-lg text-sm font-semibold hover:bg-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan="10" className="text-center py-8 text-slate-400">Loading...</td></tr>
              ) : filteredLeaderboard.length === 0 ? (
                <tr><td colSpan="10" className="text-center py-8 text-slate-400">No telecallers active in selected range.</td></tr>
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
                  <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.justDial}</td>
                  <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.enquiryCalls}</td>
                  <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.booked}</td>
                  <td className="py-4 px-2 text-center font-semibold text-slate-700">{row.followup ?? row.followupsDone}</td>
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
