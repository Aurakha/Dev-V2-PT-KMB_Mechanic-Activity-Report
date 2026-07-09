/**
 * ============================================================================
 * UIHelpers.gs - UI Component Builders & Formatters
 * ============================================================================
 * 
 * Production-grade UI helpers:
 * - HTML component builders (cards, tables, forms, buttons)
 * - Data formatters (dates, numbers, currency, status badges)
 * - Navigation builders
 * - Utility functions for templates
 * 
 * Used by HTML templates to generate consistent, beautiful UI
 * 
 * Dependencies: All foundation files
 * ============================================================================
 */

// ============================================================================
// DATE & TIME FORMATTERS
// ============================================================================

/**
 * Format date for display (human-readable)
 */
function formatDateDisplay(date) {
  if (!date) return '-';
  
  var d = parseDate(date);
  if (!d) return '-';
  
  // Format: "21 May 2026, 10:30"
  var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  var day = d.getDate();
  var month = months[d.getMonth()];
  var year = d.getFullYear();
  var hours = String(d.getHours()).padStart(2, '0');
  var minutes = String(d.getMinutes()).padStart(2, '0');
  
  return day + ' ' + month + ' ' + year + ', ' + hours + ':' + minutes;
}

/**
 * Format date as relative time (e.g., "2 hours ago")
 */
function formatRelativeTime(date) {
  if (!date) return '-';
  
  var d = parseDate(date);
  if (!d) return '-';
  
  var now = new Date();
  var diffMs = now.getTime() - d.getTime();
  var diffSec = Math.floor(diffMs / 1000);
  var diffMin = Math.floor(diffSec / 60);
  var diffHour = Math.floor(diffMin / 60);
  var diffDay = Math.floor(diffHour / 24);
  
  if (diffSec < 60) return 'Just now';
  if (diffMin < 60) return diffMin + ' min ago';
  if (diffHour < 24) return diffHour + ' hour' + (diffHour > 1 ? 's' : '') + ' ago';
  if (diffDay < 7) return diffDay + ' day' + (diffDay > 1 ? 's' : '') + ' ago';
  
  return formatDateDisplay(date);
}

// ============================================================================
// NUMBER & CURRENCY FORMATTERS
// ============================================================================

/**
 * Format number with thousand separators
 */
function formatNumber(num) {
  if (num === null || num === undefined) return '-';
  
  var n = parseFloat(num);
  if (isNaN(n)) return '-';
  
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Format IDR currency
 */
function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '-';
  
  var amt = parseFloat(amount);
  if (isNaN(amt)) return '-';
  
  return 'Rp ' + Math.round(amt).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Format points display
 */
function formatPoints(points) {
  if (points === null || points === undefined) return '-';
  
  var p = parseFloat(points);
  if (isNaN(p)) return '-';
  
  return p.toFixed(2) + ' pts';
}

// ============================================================================
// STATUS BADGES
// ============================================================================

/**
 * Get status badge HTML
 */
function getStatusBadge(status) {
  if (!status) return '';
  
  var badges = {
    'created': '<span class="badge badge-gray">Created</span>',
    'in_progress': '<span class="badge badge-blue">In Progress</span>',
    'wait_mtbf': '<span class="badge badge-yellow">Wait MTBF</span>',
    'pending_supervisor': '<span class="badge badge-orange">Pending Supervisor</span>',
    'pending_superintendent': '<span class="badge badge-purple">Pending Superintendent</span>',
    'approved': '<span class="badge badge-green">Approved</span>',
    'rejected': '<span class="badge badge-red">Rejected</span>'
  };
  
  return badges[status] || '<span class="badge badge-gray">' + status + '</span>';
}

/**
 * Get MTBF status badge
 */
function getMtbfBadge(mtbfStatus) {
  if (!mtbfStatus) return '';
  
  if (mtbfStatus === MTBF_KEYS.REDO) {
    return '<span class="badge badge-red">REDO (0.8x)</span>';
  } else if (mtbfStatus === MTBF_KEYS.FIRST_TIME) {
    return '<span class="badge badge-green">First Time (1.2x)</span>';
  }
  
  return '<span class="badge badge-gray">Unknown</span>';
}

/**
 * Get role badge
 */
function getRoleBadge(role) {
  if (!role) return '';
  
  var badges = {
    'mechanic': '<span class="badge badge-blue">Mechanic</span>',
    'supervisor': '<span class="badge badge-orange">Supervisor</span>',
    'superintendent': '<span class="badge badge-purple">Superintendent</span>'
  };
  
  return badges[role] || '<span class="badge badge-gray">' + role + '</span>';
}

// ============================================================================
// CARD BUILDERS
// ============================================================================

/**
 * Build stat card HTML
 */
function buildStatCard(title, value, subtitle, icon) {
  icon = icon || '📊';
  subtitle = subtitle || '';
  
  return '<div class="stat-card">' +
    '<div class="stat-icon">' + icon + '</div>' +
    '<div class="stat-content">' +
    '<div class="stat-title">' + title + '</div>' +
    '<div class="stat-value">' + value + '</div>' +
    (subtitle ? '<div class="stat-subtitle">' + subtitle + '</div>' : '') +
    '</div>' +
    '</div>';
}

/**
 * Build activity item HTML
 */
function buildActivityItem(activity) {
  return '<div class="activity-item">' +
    '<div class="activity-icon">📝</div>' +
    '<div class="activity-content">' +
    '<div class="activity-description">' + activity.description + '</div>' +
    '<div class="activity-meta">' +
    '<span class="activity-user">' + activity.user_email + '</span>' +
    ' • ' +
    '<span class="activity-time">' + formatRelativeTime(activity.timestamp) + '</span>' +
    '</div>' +
    '</div>' +
    '</div>';
}

// ============================================================================
// TABLE BUILDERS
// ============================================================================

/**
 * Build WO table row HTML
 */
function buildWOTableRow(wo) {
  var component = getComponentById(wo.component_id);
  var componentName = component ? component.component_name : wo.component_id;
  
  var unit = getUnitById(wo.unit_id);
  var unitName = unit ? unit.unit_name : wo.unit_id;
  
  return '<tr data-wo-id="' + wo.id + '" class="wo-row clickable">' +
    '<td>' + wo.wo_number + '</td>' +
    '<td>' + componentName + '</td>' +
    '<td>' + unitName + '</td>' +
    '<td>' + getStatusBadge(wo.status) + '</td>' +
    '<td>' + formatDateDisplay(wo.created_at) + '</td>' +
    '<td class="actions">' +
    '<button class="btn btn-sm btn-primary" onclick="viewWO(\'' + wo.id + '\')">View</button>' +
    '</td>' +
    '</tr>';
}

/**
 * Build leaderboard row HTML
 */
function buildLeaderboardRow(entry) {
  var rankIcon = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank;
  
  return '<tr>' +
    '<td class="rank">' + rankIcon + '</td>' +
    '<td class="mechanic-name">' + entry.mechanic_name + '</td>' +
    '<td class="points">' + formatPoints(entry.total_points) + '</td>' +
    '<td class="currency">' + formatCurrency(entry.total_idr) + '</td>' +
    '<td class="wo-count">' + entry.wo_count + ' WOs</td>' +
    '</tr>';
}

// ============================================================================
// FORM BUILDERS
// ============================================================================

/**
 * Build select options HTML
 */
function buildSelectOptions(items, valueKey, labelKey, selectedValue) {
  var html = '<option value="">-- Select --</option>';
  
  for (var i = 0; i < items.length; i++) {
    var item = items[i];
    var value = item[valueKey];
    var label = item[labelKey];
    var selected = value === selectedValue ? ' selected' : '';
    
    html += '<option value="' + value + '"' + selected + '>' + label + '</option>';
  }
  
  return html;
}

/**
 * Build component select HTML
 */
function buildComponentSelect(selectedValue) {
  var components = loadComponents();
  return buildSelectOptions(components, 'component_no', 'component_name', selectedValue);
}

/**
 * Build unit select HTML
 */
function buildUnitSelect(selectedValue) {
  var units = loadUnits();
  return buildSelectOptions(units, 'unit_id', 'unit_name', selectedValue);
}

/**
 * Build mechanic select HTML (for team)
 */
function buildMechanicSelect(selectedValue) {
  var mechanics = getMechanicsByRole(ROLES.MECHANIC);
  return buildSelectOptions(mechanics, 'mechanic_id', 'mechanic_name', selectedValue);
}

// ============================================================================
// NAVIGATION BUILDERS
// ============================================================================

/**
 * Build navigation HTML
 */
function buildNavigation(currentPage, user) {
  var nav = '<nav class="navbar">' +
    '<div class="nav-brand">⚙️ Mechanic Incentive</div>' +
    '<div class="nav-menu">' +
    buildNavLink('Dashboard', 'dashboard', currentPage === 'dashboard') +
    buildNavLink('Create WO', 'create', currentPage === 'create');
  
  if (user.role === ROLES.SUPERVISOR || user.role === ROLES.SUPERINTENDENT) {
    nav += buildNavLink('Approvals', 'approvals', currentPage === 'approvals');
  }
  
  nav += buildNavLink('Reports', 'reports', currentPage === 'reports') +
    '</div>' +
    '<div class="nav-user">' +
    getRoleBadge(user.role) +
    ' <span class="user-email">' + user.email + '</span>' +
    '</div>' +
    '</nav>';
  
  return nav;
}

/**
 * Build single nav link
 */
function buildNavLink(label, page, active) {
  var activeClass = active ? ' active' : '';
  var url = getWebAppUrl(page);
  
  return '<a href="' + url + '" class="nav-link' + activeClass + '">' + label + '</a>';
}

// ============================================================================
// CHART DATA FORMATTERS
// ============================================================================

/**
 * Format chart data for Chart.js
 */
function formatChartData(data, labelKey, valueKey) {
  var labels = [];
  var values = [];
  
  for (var i = 0; i < data.length; i++) {
    labels.push(data[i][labelKey]);
    values.push(data[i][valueKey]);
  }
  
  return {
    labels: labels,
    values: values
  };
}

// ============================================================================
// ALERT/NOTIFICATION BUILDERS
// ============================================================================

/**
 * Build alert HTML
 */
function buildAlert(message, type) {
  type = type || 'info';
  
  var icons = {
    'success': '✅',
    'error': '❌',
    'warning': '⚠️',
    'info': 'ℹ️'
  };
  
  return '<div class="alert alert-' + type + '">' +
    '<span class="alert-icon">' + (icons[type] || icons['info']) + '</span>' +
    '<span class="alert-message">' + message + '</span>' +
    '</div>';
}

/**
 * Build empty state HTML
 */
function buildEmptyState(message, icon) {
  icon = icon || '📭';
  
  return '<div class="empty-state">' +
    '<div class="empty-icon">' + icon + '</div>' +
    '<div class="empty-message">' + message + '</div>' +
    '</div>';
}

// ============================================================================
// PROGRESS INDICATORS
// ============================================================================

/**
 * Build progress bar HTML
 */
function buildProgressBar(percentage, label) {
  percentage = Math.min(100, Math.max(0, percentage));
  
  return '<div class="progress-bar">' +
    (label ? '<div class="progress-label">' + label + '</div>' : '') +
    '<div class="progress-track">' +
    '<div class="progress-fill" style="width: ' + percentage + '%"></div>' +
    '</div>' +
    '<div class="progress-value">' + percentage + '%</div>' +
    '</div>';
}

/**
 * Build loading spinner HTML
 */
function buildLoadingSpinner(message) {
  message = message || 'Loading...';
  
  return '<div class="loading-spinner">' +
    '<div class="spinner"></div>' +
    '<div class="loading-message">' + message + '</div>' +
    '</div>';
}

// ============================================================================
// MODAL BUILDERS
// ============================================================================

/**
 * Build modal HTML
 */
function buildModal(id, title, content, footer) {
  footer = footer || '';
  
  return '<div id="' + id + '" class="modal">' +
    '<div class="modal-overlay" onclick="closeModal(\'' + id + '\')"></div>' +
    '<div class="modal-content">' +
    '<div class="modal-header">' +
    '<h3 class="modal-title">' + title + '</h3>' +
    '<button class="modal-close" onclick="closeModal(\'' + id + '\')">&times;</button>' +
    '</div>' +
    '<div class="modal-body">' + content + '</div>' +
    (footer ? '<div class="modal-footer">' + footer + '</div>' : '') +
    '</div>' +
    '</div>';
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Build validation error HTML
 */
function buildValidationError(field, message) {
  return '<div class="validation-error" data-field="' + field + '">' +
    '<span class="error-icon">⚠️</span>' +
    '<span class="error-message">' + message + '</span>' +
    '</div>';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  if (!text) return '';
  
  var map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return text.toString().replace(/[&<>"']/g, function(m) { return map[m]; });
}

/**
 * Truncate text with ellipsis
 */
function truncate(text, maxLength) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Get initials from name
 */
function getInitials(name) {
  if (!name) return '??';
  
  var parts = name.split(' ');
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Build avatar HTML
 */
function buildAvatar(name, size) {
  size = size || 'md';
  var initials = getInitials(name);
  
  return '<div class="avatar avatar-' + size + '">' + initials + '</div>';
}

// ============================================================================
// RESPONSIVE HELPERS
// ============================================================================

/**
 * Check if mobile view
 */
function isMobileView() {
  // This is server-side, can't detect client
  // Return false, let CSS handle responsiveness
  return false;
}

/**
 * Build responsive table wrapper
 */
function wrapResponsiveTable(tableHtml) {
  return '<div class="table-responsive">' + tableHtml + '</div>';
}







/**
 * Quick Frontend Test
 * Test all Session 3 components
 */
function quickFrontendTest() {
  Log.separator('🧪 FRONTEND SMOKE TEST');
  
  var passed = 0;
  var failed = 0;
  
  function assert(condition, name) {
    if (condition) { 
      Log.info('test', '✅ ' + name); 
      passed++; 
    } else { 
      Log.error('test', '❌ ' + name); 
      failed++; 
    }
  }
  
  function tryTest(name, fn) {
    try { 
      fn(); 
    } catch (e) { 
      Log.error('test', '❌ ' + name + ' ERROR: ' + e.message); 
      failed++; 
    }
  }
  
  // Test 1: UI Helpers
  Log.section('UI Helpers');
  
  tryTest('formatDateDisplay', function() {
    var dateStr = formatDateDisplay(new Date());
    assert(dateStr && dateStr.length > 0, 'formatDateDisplay works');
  });
  
  tryTest('formatCurrency', function() {
    var idr = formatCurrency(1000000);
    assert(idr.indexOf('Rp') === 0, 'formatCurrency works: ' + idr);
  });
  
  tryTest('getStatusBadge', function() {
    var badge = getStatusBadge('approved');
    assert(badge.indexOf('badge') > 0, 'getStatusBadge works');
  });
  
  tryTest('formatPoints', function() {
    var pts = formatPoints(10.5);
    assert(pts.indexOf('pts') > 0, 'formatPoints works: ' + pts);
  });
  
  // Test 2: Dashboard Service
  Log.section('Dashboard Service');
  
  tryTest('getCurrentUser', function() {
    var user = getCurrentUserWithRole();
    assert(user && user.email, 'Current user: ' + user.email + ' (' + user.role + ')');
  });
  
  tryTest('getQuickStats', function() {
    var user = getCurrentUserWithRole();
    var stats = getQuickStats(user);
    assert(stats !== null && stats !== undefined, 'getQuickStats: ' + JSON.stringify(stats));
  });
  
  tryTest('getLeaderboard', function() {
    var leaderboard = getLeaderboard(5);
    assert(Array.isArray(leaderboard), 'Leaderboard: ' + leaderboard.length + ' entries');
  });
  
  tryTest('getRecentActivity', function() {
    var user = getCurrentUserWithRole();
    var activity = getRecentActivity(user, 5);
    assert(Array.isArray(activity), 'Recent activity: ' + activity.length + ' items');
  });
  
  tryTest('getDashboardData', function() {
    var user = getCurrentUserWithRole();
    var data = getDashboardData(user);
    assert(data && data.user && data.stats, 'Dashboard data loaded successfully');
  });
  
  // Test 3: Router (basic checks)
  Log.section('Router');
  
  tryTest('getWebAppUrl', function() {
    var url = getWebAppUrl('dashboard');
    assert(url && url.length > 0, 'getWebAppUrl works');
  });
  
  // Summary
  Log.separator('Test Results');
  Log.info('test', '✅ Passed: ' + passed + ' | ❌ Failed: ' + failed);
  
  if (failed === 0) {
    Log.info('test', '🎉 All frontend tests PASS! Ready to deploy.');
  } else {
    Log.error('test', '⚠️ Some tests failed. Review errors above.');
  }
  
  return {
    passed: passed,
    failed: failed,
    success: failed === 0
  };
}