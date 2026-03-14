(function () {
  const contentEl = document.getElementById('admin-content');
  const titleEl = document.getElementById('admin-page-title');

  function setActiveNav() {
    const path = window.location.pathname;
    const links = document.querySelectorAll('.admin-nav-link');
    links.forEach((link) => {
      const page = link.getAttribute('data-nav');
      const href = '/admin/' + page;
      if (path === href || (page === 'dashboard' && path === '/admin')) {
        link.classList.add('admin-nav-link--active');
      } else {
        link.classList.remove('admin-nav-link--active');
      }
    });
  }

  function formatDurationSeconds(seconds) {
    if (!seconds || isNaN(seconds)) return '0s';
    const s = Math.floor(seconds);
    const m = Math.floor(s / 60);
    const r = s % 60;
    if (m === 0) return `${r}s`;
    return `${m}m ${r}s`;
  }

  function buildQuery(params) {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') usp.set(k, v);
    });
    const s = usp.toString();
    return s ? `?${s}` : '';
  }

  async function fetchJson(url) {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    return res.json();
  }

  function renderDashboard() {
    titleEl.textContent = 'Dashboard Overview';
    contentEl.innerHTML = `
      <div id="admin-dashboard-error" class="admin-error-banner" hidden></div>
      <div class="admin-filters-row" id="admin-dashboard-filters">
        <button type="button" class="admin-filter-pill" data-range="today">Today</button>
        <button type="button" class="admin-filter-pill" data-range="week">Weekly</button>
        <button type="button" class="admin-filter-pill" data-range="month">Monthly</button>
        <input type="date" class="admin-filter-input" id="dash-date-from" />
        <input type="date" class="admin-filter-input" id="dash-date-to" />
        <input type="text" class="admin-filter-input" id="dash-store" placeholder="Store (optional)" />
        <button type="button" class="admin-filter-apply" id="dash-apply">Apply</button>
      </div>
      <div class="admin-cards">
        <div class="admin-card">
          <div class="admin-card-label">Total Calls</div>
          <div class="admin-card-value" id="dash-total-calls">-</div>
        </div>
        <div class="admin-card">
          <div class="admin-card-label">Total Duration</div>
          <div class="admin-card-value" id="dash-total-duration">-</div>
        </div>
        <div class="admin-card">
          <div class="admin-card-label">Avg Duration</div>
          <div class="admin-card-value" id="dash-avg-duration">-</div>
        </div>
        <div class="admin-card">
          <div class="admin-card-label">Complaints</div>
          <div class="admin-card-value" id="dash-total-complaints">-</div>
        </div>
      </div>
      <h2 class="section-title">Telecaller Performance</h2>
      <div id="dash-table-wrapper" class="admin-table-container">
        <div class="admin-loading" id="dash-loading">Loading performance data...</div>
      </div>
    `;


    const filtersEl = document.getElementById('admin-dashboard-filters');
    const errorEl = document.getElementById('admin-dashboard-error');

    function computeRange(rangeKey) {
      const now = new Date();
      const end = now.toISOString().slice(0, 10);
      const startDate = new Date(now);
      if (rangeKey === 'today') {
        // same day
      } else if (rangeKey === 'week') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (rangeKey === 'month') {
        startDate.setDate(startDate.getDate() - 30);
      }
      const start = startDate.toISOString().slice(0, 10);
      return { dateFrom: start, dateTo: end };
    }

    async function load(rangeOverrides) {
      errorEl.hidden = true;
      document.getElementById('dash-loading').textContent = 'Loading...';

      const dateFromInput = document.getElementById('dash-date-from');
      const dateToInput = document.getElementById('dash-date-to');
      const storeInput = document.getElementById('dash-store');

      const params = {
        dateFrom: rangeOverrides?.dateFrom || dateFromInput.value || undefined,
        dateTo: rangeOverrides?.dateTo || dateToInput.value || undefined,
        store: storeInput.value || undefined,
      };

      try {
        const dashData = await fetchJson('/api/admin/dashboard' + buildQuery(params));
        const perfData = await fetchJson('/api/admin/telecaller-summary' + buildQuery(params));

        const m = dashData || {};
        document.getElementById('dash-total-calls').textContent = m.totalCalls ?? 0;
        document.getElementById('dash-total-duration').textContent = formatDurationSeconds(m.totalDuration || 0);
        document.getElementById('dash-avg-duration').textContent = formatDurationSeconds(m.avgCallDuration || 0);
        document.getElementById('dash-total-complaints').textContent = m.totalComplaints ?? 0;

        const wrapper = document.getElementById('dash-table-wrapper');
        const rows = (perfData && perfData.data) || [];
        if (!rows.length) {
          wrapper.innerHTML = '<div class="admin-empty">No performance data for selected filters.</div>';
        } else {
          let html = '<table class="admin-table"><thead><tr>' +
            '<th>Telecaller</th><th>Employee ID</th><th>Calls</th><th>Duration</th><th>Complaints</th>' +
            '</tr></thead><tbody>';
          rows.forEach((row) => {
            const t = row.telecaller || {};
            html += `<tr>
              <td>${t.name || '-'}</td>
              <td>${t.employeeId || '-'}</td>
              <td>${row.totalCalls || 0}</td>
              <td>${formatDurationSeconds(row.totalCallDuration || 0)}</td>
              <td>${row.totalComplaints || 0}</td>
            </tr>`;
          });
          html += '</tbody></table>';
          wrapper.innerHTML = html;
        }
      } catch (err) {
        console.error(err);
        errorEl.textContent = 'Failed to load dashboard data.';
        errorEl.hidden = false;
      } finally {
        const loadingEl = document.getElementById('dash-loading');
        if (loadingEl) loadingEl.textContent = '';
      }
    }

    filtersEl.addEventListener('click', (e) => {
      const pill = e.target.closest('.admin-filter-pill');
      if (!pill) return;
      const key = pill.getAttribute('data-range');
      document.querySelectorAll('.admin-filter-pill').forEach((el) => el.classList.remove('admin-filter-pill--active'));
      pill.classList.add('admin-filter-pill--active');
      const range = computeRange(key);
      document.getElementById('dash-date-from').value = range.dateFrom;
      document.getElementById('dash-date-to').value = range.dateTo;
      load(range);
    });

    document.getElementById('dash-apply').addEventListener('click', () => load());

    // Default: Monthly
    const monthlyPill = document.querySelector('.admin-filter-pill[data-range="month"]');
    if (monthlyPill) monthlyPill.click();
  }

  function renderReports() {
    titleEl.textContent = 'Calls Report';
    contentEl.innerHTML = `
      <div id="admin-reports-error" class="admin-error-banner" hidden></div>
      <div class="admin-filters-row">
        <input type="date" class="admin-filter-input" id="rep-date-from" />
        <input type="date" class="admin-filter-input" id="rep-date-to" />
        <input type="text" class="admin-filter-input" id="rep-store" placeholder="Store" />
        <input type="text" class="admin-filter-input" id="rep-lead-type" placeholder="Lead Type" />
        <input type="text" class="admin-filter-input" id="rep-telecaller" placeholder="Telecaller ID" />
        <button type="button" class="admin-filter-apply" id="rep-apply">Apply Filters</button>
        <button type="button" class="admin-filter-apply" id="rep-export" style="background:#10b981">Export CSV</button>
      </div>
      <div id="rep-table-wrapper" class="admin-table-container">
        <div class="admin-loading" id="rep-loading">Fetching reports...</div>
      </div>
    `;


    const errorEl = document.getElementById('admin-reports-error');

    async function load() {
      errorEl.hidden = true;
      document.getElementById('rep-loading').textContent = 'Loading...';
      const params = {
        dateFrom: document.getElementById('rep-date-from').value || undefined,
        dateTo: document.getElementById('rep-date-to').value || undefined,
        store: document.getElementById('rep-store').value || undefined,
        leadType: document.getElementById('rep-lead-type').value || undefined,
        telecallerId: document.getElementById('rep-telecaller').value || undefined,
      };

      try {
        const res = await fetchJson('/api/admin/reports' + buildQuery(params));
        const list = (res && res.data) || res.leads || [];
        const wrapper = document.getElementById('rep-table-wrapper');
        if (!list.length) {
          wrapper.innerHTML = '<div class="admin-empty">No reports for selected filters.</div>';
        } else {
          let html = '<table class="admin-table"><thead><tr>' +
            '<th>Created Date</th><th>Store</th><th>Lead Name</th><th>Phone</th><th>Created By</th><th>Duration</th><th>Lead Type</th><th>Refund Status</th>' +
            '</tr></thead><tbody>';
          list.forEach((item) => {
            html += `<tr>
              <td>${item.createdAt || '-'}</td>
              <td>${item.store || '-'}</td>
              <td>${item.name || '-'}</td>
              <td>${item.phone || '-'}</td>
              <td>${item.createdBy || '-'}</td>
              <td>${formatDurationSeconds(item.callDuration || 0)}</td>
              <td>${item.leadtype || '-'}</td>
              <td>${item.refundStatus || '-'}</td>
            </tr>`;
          });
          html += '</tbody></table>';
          wrapper.innerHTML = html;
        }
      } catch (err) {
        console.error(err);
        errorEl.textContent = 'Failed to load reports.';
        errorEl.hidden = false;
      } finally {
        document.getElementById('rep-loading').textContent = '';
      }
    }

    document.getElementById('rep-apply').addEventListener('click', load);

    document.getElementById('rep-export').addEventListener('click', async () => {
      try {
        const params = {
          dateFrom: document.getElementById('rep-date-from').value || undefined,
          dateTo: document.getElementById('rep-date-to').value || undefined,
          store: document.getElementById('rep-store').value || undefined,
          leadType: document.getElementById('rep-lead-type').value || undefined,
          telecallerId: document.getElementById('rep-telecaller').value || undefined,
        };
        const res = await fetch('/api/admin/reports' + buildQuery(params), {
          headers: { Accept: 'text/csv,application/json' },
        });
        // If backend supports CSV, trigger download; otherwise fallback to JSON
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'calls-report.csv';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error(err);
        errorEl.textContent = 'Failed to export CSV.';
        errorEl.hidden = false;
      }
    });

    load();
  }

  function renderComplaints() {
    titleEl.textContent = 'Complaints Pivot';
    contentEl.innerHTML = `
      <div id="admin-complaints-error" class="admin-error-banner" hidden></div>
      <div class="admin-filters-row">
        <input type="date" class="admin-filter-input" id="cmp-date-from" />
        <input type="date" class="admin-filter-input" id="cmp-date-to" />
        <input type="text" class="admin-filter-input" id="cmp-store" placeholder="Store" />
        <button type="button" class="admin-filter-apply" id="cmp-apply">Generate Pivot</button>
      </div>
      <div id="cmp-pivot-wrapper" class="admin-table-container">
        <div class="admin-loading" id="cmp-loading">Calculating pivot data...</div>
      </div>
    `;


    const errorEl = document.getElementById('admin-complaints-error');

    async function load() {
      errorEl.hidden = true;
      document.getElementById('cmp-loading').textContent = 'Loading...';
      const params = {
        dateFrom: document.getElementById('cmp-date-from').value || undefined,
        dateTo: document.getElementById('cmp-date-to').value || undefined,
        store: document.getElementById('cmp-store').value || undefined,
      };

      try {
        const pivot = await fetchJson('/api/admin/complaints/pivot' + buildQuery(params));
        const wrapper = document.getElementById('cmp-pivot-wrapper');
        const data = pivot || {};
        const stores = Object.keys(data);
        if (!stores.length) {
          wrapper.innerHTML = '<div class="admin-empty">No complaints for selected filters.</div>';
        } else {
          let html = '<table class="admin-table"><thead><tr><th>Store</th><th>Category</th><th>Total</th></tr></thead><tbody>';
          stores.forEach((storeName) => {
            const cat = data[storeName] || {};
            Object.keys(cat).forEach((category) => {
              html += `<tr><td>${storeName}</td><td>${category}</td><td>${cat[category]}</td></tr>`;
            });
          });
          html += '</tbody></table>';
          wrapper.innerHTML = html;
        }
      } catch (err) {
        console.error(err);
        errorEl.textContent = 'Failed to load complaints pivot.';
        errorEl.hidden = false;
      } finally {
        document.getElementById('cmp-loading').textContent = '';
      }
    }

    document.getElementById('cmp-apply').addEventListener('click', load);
    load();
  }

  function renderPerformance() {
    titleEl.textContent = 'Telecaller Performance';
    contentEl.innerHTML = `
      <div id="admin-perf-error" class="admin-error-banner" hidden></div>
      <div class="admin-filters-row" id="perf-filters">
        <button type="button" class="admin-filter-pill" data-range="today">Today</button>
        <button type="button" class="admin-filter-pill" data-range="week">Weekly</button>
        <button type="button" class="admin-filter-pill" data-range="month">Monthly</button>
        <input type="date" class="admin-filter-input" id="perf-date-from" />
        <input type="date" class="admin-filter-input" id="perf-date-to" />
        <input type="text" class="admin-filter-input" id="perf-store" placeholder="Store (optional)" />
        <button type="button" class="admin-filter-apply" id="perf-apply">Refresh</button>
      </div>
      <div id="perf-chart">Summary will appear here based on selected filters.</div>
      <h2 class="section-title">Leaderboard</h2>
      <div id="perf-table-wrapper" class="admin-table-container">
        <div class="admin-loading" id="perf-loading">Compiling leaderboard...</div>
      </div>
    `;


    const errorEl = document.getElementById('admin-perf-error');

    function computeRange(rangeKey) {
      const now = new Date();
      const end = now.toISOString().slice(0, 10);
      const startDate = new Date(now);
      if (rangeKey === 'today') {
      } else if (rangeKey === 'week') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (rangeKey === 'month') {
        startDate.setDate(startDate.getDate() - 30);
      }
      const start = startDate.toISOString().slice(0, 10);
      return { dateFrom: start, dateTo: end };
    }

    async function load(rangeOverrides) {
      errorEl.hidden = true;
      document.getElementById('perf-loading').textContent = 'Loading...';
      const params = {
        dateFrom: rangeOverrides?.dateFrom || document.getElementById('perf-date-from').value || undefined,
        dateTo: rangeOverrides?.dateTo || document.getElementById('perf-date-to').value || undefined,
        store: document.getElementById('perf-store').value || undefined,
      };

      try {
        const res = await fetchJson('/api/admin/telecaller-summary' + buildQuery(params));
        const rows = (res && res.data) || [];
        const wrapper = document.getElementById('perf-table-wrapper');
        if (!rows.length) {
          wrapper.innerHTML = '<div class="admin-empty">No performance data.</div>';
          document.getElementById('perf-chart').textContent = 'No data for selected filters.';
        } else {
          // Simple chart description
          const maxCalls = Math.max(...rows.map((r) => r.totalCalls || 0));
          document.getElementById('perf-chart').textContent = `Top telecaller: ${rows[0].telecaller?.name || '-'} with ${rows[0].totalCalls || 0} calls (max ${maxCalls}).`;

          let html = '<table class="admin-table"><thead><tr>' +
            '<th>Rank</th><th>Name</th><th>Employee ID</th><th>Calls</th><th>Duration</th><th>Complaints</th>' +
            '</tr></thead><tbody>';
          rows.forEach((row, idx) => {
            const t = row.telecaller || {};
            const rankClass = idx === 0 ? 'rank-1' : (idx === 1 ? 'rank-2' : (idx === 2 ? 'rank-3' : ''));
            html += `<tr>
              <td><span class="rank-badge ${rankClass}">${idx + 1}</span></td>
              <td><strong>${t.name || '-'}</strong></td>
              <td><code style="background:#f1f5f9;padding:2px 6px;border-radius:4px">${t.employeeId || '-'}</code></td>
              <td>${row.totalCalls || 0}</td>
              <td>${formatDurationSeconds(row.totalCallDuration || 0)}</td>
              <td><span class="admin-badge" style="background:#fee2e2;color:#ef4444">${row.totalComplaints || 0}</span></td>
            </tr>`;

          });
          html += '</tbody></table>';
          wrapper.innerHTML = html;
        }
      } catch (err) {
        console.error(err);
        errorEl.textContent = 'Failed to load performance data.';
        errorEl.hidden = false;
      } finally {
        document.getElementById('perf-loading').textContent = '';
      }
    }

    const filtersEl = document.getElementById('perf-filters');
    filtersEl.addEventListener('click', (e) => {
      const pill = e.target.closest('.admin-filter-pill');
      if (!pill) return;
      const key = pill.getAttribute('data-range');
      document.querySelectorAll('#perf-filters .admin-filter-pill').forEach((el) => el.classList.remove('admin-filter-pill--active'));
      pill.classList.add('admin-filter-pill--active');
      const range = computeRange(key);
      document.getElementById('perf-date-from').value = range.dateFrom;
      document.getElementById('perf-date-to').value = range.dateTo;
      load(range);
    });

    document.getElementById('perf-apply').addEventListener('click', () => load());

    const monthlyPill = document.querySelector('#perf-filters .admin-filter-pill[data-range="month"]');
    if (monthlyPill) monthlyPill.click();
  }

  function route() {
    setActiveNav();
    const path = window.location.pathname;
    if (path.startsWith('/admin/reports')) return renderReports();
    if (path.startsWith('/admin/complaints')) return renderComplaints();
    if (path.startsWith('/admin/performance')) return renderPerformance();
    return renderDashboard();
  }

  // Logout form submits normally; nothing extra required

  route();
})();
