import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Calendar, Download, PhoneCall, Headphones, TrendingDown, CheckSquare, MessageSquare, Briefcase, PhoneMissed, X } from 'lucide-react';

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

const CategoryCard = ({ title, value, subtitle, icon: Icon, color, trend }) => (
  <div className="bg-slate-50 rounded-xl border border-slate-100 p-5 flex flex-col">
    <div className="flex justify-between items-start mb-4">
      <h3 className="text-slate-600 font-medium text-sm w-24 leading-tight">{title}</h3>
      <div className={`p-2 rounded-lg ${color.bg} ${color.text}`}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
    <div className="mt-auto">
      <span className="text-2xl font-bold text-slate-800">{value}</span>
      <p className={`text-[10px] mt-1 font-medium ${trend === 'up' ? 'text-emerald-500' : trend === 'down' ? 'text-rose-500' : 'text-slate-500'}`}>
        {subtitle}
      </p>
    </div>
  </div>
);

const TelecallerDetails = () => {
  const { employeeId } = useParams();
  const [summary, setSummary] = useState(null);
  const [category, setCategory] = useState(null);
  const [recentCalls, setRecentCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  // Date range state
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [tempFromDate, setTempFromDate] = useState('');
  const [tempToDate, setTempToDate] = useState('');
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const datePickerRef = useRef(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        let query = '';
        if (fromDate && toDate) {
          query = `?fromDate=${fromDate}&toDate=${toDate}`;
        }
        const [sumRes, catRes, recentRes] = await Promise.all([
          axios.get(`/api/admin/telecallers/${employeeId}/summary${query}`),
          axios.get(`/api/admin/telecallers/${employeeId}/category-performance${query}`),
          axios.get(`/api/admin/telecallers/${employeeId}/recent-calls`)
        ]);

        if (sumRes.data.success) setSummary(sumRes.data.data);
        if (catRes.data.success) setCategory(catRes.data.data);
        if (recentRes.data.success) setRecentCalls(recentRes.data.data.calls);
      } catch (error) {
        console.error('Error fetching telecaller details:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [employeeId, fromDate, toDate]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setIsDatePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const handleExportCSV = () => {
    let query = `?telecallerId=${employeeId}`;
    if (fromDate && toDate) {
      query += `&fromDate=${fromDate}&toDate=${toDate}`;
    }
    window.open(`/api/admin/reports/completed-leads/export${query}`, '_blank');
  };

  if (loading || !summary || !category) {
    return <div className="p-8 text-center text-slate-500">Loading details...</div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-white shadow-sm">
            <img src="https://i.pravatar.cc/150?img=47" alt={summary.name} className="w-full h-full object-cover" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">{summary.name}</h1>
            <p className="text-slate-500 text-sm">Role : {summary.role}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Custom Date Range Picker */}
          <div className="relative" ref={datePickerRef}>
            <button
              onClick={() => {
                setTempFromDate(fromDate);
                setTempToDate(toDate);
                setIsDatePickerOpen(!isDatePickerOpen);
              }}
              className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm font-medium shadow-sm transition-colors ${fromDate ? 'bg-slate-50 border-slate-300 text-slate-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
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

          <button onClick={handleExportCSV} className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center shadow-sm transition-colors">
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Top Stats */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCard
            title="Total Calls"
            value={summary.totalCalls}
            subtitle="+5% from yesterday"
            trend="up"
            icon={PhoneCall}
            color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }}
          />
          <StatCard
            title="Connected Calls"
            value={summary.connectedCalls}
            subtitle="+8% from yesterday"
            trend="up"
            icon={Headphones}
            color={{ bg: 'bg-orange-100', text: 'text-orange-600' }}
          />
          <StatCard
            title="Total Loss of Sale"
            value={summary.totalLossOfSale}
            subtitle="+6% from yesterday"
            trend="down"
            icon={TrendingDown}
            color={{ bg: 'bg-rose-100', text: 'text-rose-600' }}
          />
          <StatCard
            title="Overall Conversion %"
            value={`${summary.overallConversionPercentage}%`}
            subtitle="-1.2% from yesterday"
            trend="down"
            icon={CheckSquare}
            color={{ bg: 'bg-yellow-100', text: 'text-yellow-600' }}
          />
        </div>
      </div>

      {/* Category Performance */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-900 mb-6">Call Categories Performance</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <CategoryCard
            title="Booking Calls"
            value={category.bookingCalls}
            subtitle="+8% from yesterday"
            trend="up"
            icon={Briefcase}
            color={{ bg: 'bg-emerald-100', text: 'text-emerald-600' }}
          />
          <CategoryCard
            title="Loss of Sale Calls"
            value={category.lossOfSaleCalls}
            subtitle="+6% from yesterday"
            trend="down"
            icon={TrendingDown}
            color={{ bg: 'bg-rose-100', text: 'text-rose-600' }}
          />
          <CategoryCard
            title="Customer Feedback Calls"
            value={category.customerFeedbackCalls}
            subtitle="+8% from yesterday"
            trend="up"
            icon={MessageSquare}
            color={{ bg: 'bg-yellow-100', text: 'text-yellow-600' }}
          />
          <CategoryCard
            title="Follow Up Calls"
            value={category.followupCalls}
            subtitle="+6% from yesterday"
            trend="up"
            icon={PhoneMissed}
            color={{ bg: 'bg-slate-200', text: 'text-slate-600' }}
          />
          <CategoryCard
            title="Enquiry Calls"
            value={category.enquiryCalls}
            subtitle="-1.2% from yesterday"
            trend="down"
            icon={Headphones}
            color={{ bg: 'bg-purple-100', text: 'text-purple-600' }}
          />
        </div>
      </div>

      {/* Recent Calls */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-900">Recent Calls</h2>
          <button className="px-4 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50">
            View All Calls
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs text-slate-500 font-bold uppercase bg-slate-50/50">
              <tr>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Lead Type</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Duration</th>
                <th className="px-6 py-4">Notes</th>
                <th className="px-6 py-4">Date & Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentCalls.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-8 text-slate-400">No recent calls found.</td></tr>
              ) : recentCalls.map((call) => (
                <tr key={call.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{call.customerName}</div>
                    <div className="text-xs text-slate-500">{call.phone}</div>
                  </td>
                  <td className="px-6 py-4 capitalize">{call.leadtype}</td>
                  <td className="px-6 py-4">
                    <span className={`font-medium ${call.callStatus === 'connected' ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {call.callStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{call.callDuration || '0:00'}</td>
                  <td className="px-6 py-4 text-slate-600 truncate max-w-xs">{call.remarks || '-'}</td>
                  <td className="px-6 py-4 text-slate-600">
                    {new Date(call.updatedAt).toLocaleString('en-US', {
                      day: '2-digit', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TelecallerDetails;
