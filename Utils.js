/**
 * ============================================================================
 * Utils.gs - Production-Grade Utility Functions
 * ============================================================================
 * 
 * Comprehensive utility functions dengan defensive programming.
 * ALL functions handle null/undefined gracefully dan return sensible defaults.
 * 
 * Dependencies: Constants.gs, Logger.gs
 * ============================================================================
 */

// ============================================================================
// DATE HELPERS
// ============================================================================

function formatDate(dateInput, format) {
  var date = parseDate(dateInput);
  if (!date) return '';
  
  format = format || DATE_FORMATS.DATE_TIME;
  
  try {
    var year = date.getFullYear();
    var month = padZero(date.getMonth() + 1);
    var day = padZero(date.getDate());
    var hours = padZero(date.getHours());
    var minutes = padZero(date.getMinutes());
    var seconds = padZero(date.getSeconds());
    
    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day)
      .replace('HH', hours)
      .replace('mm', minutes)
      .replace('ss', seconds);
  } catch (e) {
    Log.exception('formatDate', e);
    return '';
  }
}

function parseDate(dateInput) {
  if (dateInput === null || dateInput === undefined || dateInput === '') return null;
  
  try {
    if (dateInput instanceof Date) {
      return isNaN(dateInput.getTime()) ? null : dateInput;
    }
    
    if (typeof dateInput === 'number') {
      var d = new Date(dateInput);
      return isNaN(d.getTime()) ? null : d;
    }
    
    if (typeof dateInput === 'string') {
      var d = new Date(dateInput);
      return isNaN(d.getTime()) ? null : d;
    }
    
    return null;
  } catch (e) {
    Log.exception('parseDate', e);
    return null;
  }
}

function addHours(date, hours) {
  var parsed = parseDate(date);
  if (!parsed) return null;
  if (typeof hours !== 'number' || isNaN(hours)) return null;
  
  try {
    var newDate = new Date(parsed.getTime());
    newDate.setHours(newDate.getHours() + hours);
    return newDate;
  } catch (e) {
    return null;
  }
}

function addDays(date, days) {
  var parsed = parseDate(date);
  if (!parsed) return null;
  if (typeof days !== 'number' || isNaN(days)) return null;
  
  try {
    var newDate = new Date(parsed.getTime());
    newDate.setDate(newDate.getDate() + days);
    return newDate;
  } catch (e) {
    return null;
  }
}

function hoursBetween(startDate, endDate) {
  var start = parseDate(startDate);
  var end = parseDate(endDate);
  if (!start || !end) return 0;
  
  try {
    var diffMs = end.getTime() - start.getTime();
    return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
  } catch (e) {
    return 0;
  }
}

function getWeekNumber(date) {
  var parsed = parseDate(date);
  if (!parsed) return 1;
  
  try {
    var d = new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
    var dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  } catch (e) {
    return 1;
  }
}

function getMonth(date) {
  var parsed = parseDate(date);
  return parsed ? parsed.getMonth() + 1 : 1;
}

function getYear(date) {
  var parsed = parseDate(date);
  return parsed ? parsed.getFullYear() : new Date().getFullYear();
}

function padZero(num) {
  if (num === null || num === undefined || isNaN(num)) return '00';
  return num < 10 ? '0' + num : '' + num;
}

function padZero3(num) {
  if (num === null || num === undefined || isNaN(num)) return '000';
  if (num < 10) return '00' + num;
  if (num < 100) return '0' + num;
  return '' + num;
}

function nowISO() {
  return new Date().toISOString();
}

function nowFormatted() {
  return formatDate(new Date(), DATE_FORMATS.DATE_TIME);
}

// ============================================================================
// ID GENERATION
// ============================================================================

function generateId(prefix) {
  prefix = prefix || 'ID';
  var timestamp = new Date().getTime();
  var random = Math.floor(Math.random() * 1000);
  return prefix + '-' + timestamp + '-' + padZero3(random);
}

function generateWoNumber() {
  var now = new Date();
  var dateStr = formatDate(now, DATE_FORMATS.WO_NUMBER);
  var timeStr = padZero3(now.getTime() % 1000);
  return ID_PREFIXES.WORK_ORDER + '-' + dateStr + '-' + timeStr;
}

// ============================================================================
// VALIDATION
// ============================================================================

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return VALIDATION.EMAIL_REGEX.test(email.trim());
}

function isValidNumber(value, min, max) {
  if (typeof value !== 'number' || isNaN(value)) return false;
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}

function isValidPercentage(value) {
  return isValidNumber(value, VALIDATION.MIN_PERCENTAGE, VALIDATION.MAX_PERCENTAGE);
}

function validateTeamDistribution(distribution) {
  if (!distribution || typeof distribution !== 'object') {
    return {valid: false, error: 'Invalid distribution object', sum: 0};
  }
  
  var mechanicIds = Object.keys(distribution);
  
  if (mechanicIds.length === 0) {
    return {valid: false, error: 'No mechanics in distribution', sum: 0};
  }
  
  // FULL-POINT MODEL: setiap mekanik menerima poin PENUH (percentage = 100).
  // Tidak ada lagi pembagian porsi. Nilai selain 100 DITOLAK KERAS supaya
  // payload lama (mis. 33.3) gagal berisik, bukan diam-diam membayar kurang.
  var sum = 0;
  for (var i = 0; i < mechanicIds.length; i++) {
    var percentage = distribution[mechanicIds[i]];
    
    if (!isValidPercentage(percentage)) {
      return {
        valid: false,
        error: 'Invalid percentage for ' + mechanicIds[i] + ': ' + percentage,
        sum: sum
      };
    }
    
    if (Math.abs(percentage - 100) > 0.01) {
      return {
        valid: false,
        error: 'Full-point model: setiap mekanik harus 100 (dapat ' + percentage + ' untuk ' + mechanicIds[i] + ')',
        sum: sum
      };
    }
    sum += percentage;
  }
  
  return {valid: true, sum: sum};
}

function sanitizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
}

function isNonEmpty(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

// ============================================================================
// STATUS & WORK ORDER HELPERS
// ============================================================================

function isWaitingMtbf(wo) {
  if (!wo || wo.status !== WO_STATUS.WAIT_MTBF) return false;
  if (!wo.mtbf_expiry_date) return false;
  
  var expiryDate = parseDate(wo.mtbf_expiry_date);
  if (!expiryDate) return false;
  
  return new Date() < expiryDate;
}

function getMtbfTimeRemaining(mtbfExpiryDate) {
  var defaultResult = {
    days: 0, hours: 0, minutes: 0, seconds: 0,
    expired: true, totalSeconds: 0
  };
  
  var expiryDate = parseDate(mtbfExpiryDate);
  if (!expiryDate) return defaultResult;
  
  var diffMs = expiryDate.getTime() - new Date().getTime();
  if (diffMs <= 0) return defaultResult;
  
  var totalSeconds = Math.floor(diffMs / 1000);
  
  return {
    days: Math.floor(totalSeconds / (24 * 3600)),
    hours: Math.floor((totalSeconds % (24 * 3600)) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: false,
    totalSeconds: totalSeconds
  };
}

function formatMtbfCountdown(mtbfExpiryDate) {
  var remaining = getMtbfTimeRemaining(mtbfExpiryDate);
  if (remaining.expired) return 'EXPIRED';
  
  var parts = [];
  if (remaining.days > 0) parts.push(remaining.days + 'd');
  if (remaining.hours > 0) parts.push(remaining.hours + 'h');
  if (remaining.minutes > 0 || parts.length === 0) parts.push(remaining.minutes + 'm');
  
  return parts.join(' ');
}

function canTransition(currentStatus, newStatus) {
  return isValidStatusTransition(currentStatus, newStatus);
}

function getAllowedNextStatuses(currentStatus) {
  return STATUS_TRANSITIONS[currentStatus] || [];
}

function getStatusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function isTerminalStatus(status) {
  var nextStatuses = STATUS_TRANSITIONS[status];
  return !nextStatuses || nextStatuses.length === 0;
}

// ============================================================================
// ARRAY & OBJECT HELPERS
// ============================================================================

function arrayToObjects(data, headers) {
  if (!data || !Array.isArray(data) || data.length === 0) return [];
  if (!headers || !Array.isArray(headers) || headers.length === 0) return [];
  
  var objects = [];
  
  for (var i = 0; i < data.length; i++) {
    var row = data[i];
    if (!Array.isArray(row)) continue;
    
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var value = row[j];
      if (value === undefined || value === '') value = null;
      obj[headers[j]] = value;
    }
    objects.push(obj);
  }
  
  return objects;
}

function objectToArray(obj, headers) {
  if (!obj || typeof obj !== 'object') return [];
  if (!headers || !Array.isArray(headers)) return [];
  
  var row = [];
  for (var i = 0; i < headers.length; i++) {
    var value = obj[headers[i]];
    if (value === null || value === undefined) value = '';
    row.push(value);
  }
  return row;
}

function cloneObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch (e) {
    return null;
  }
}

function mergeObjects() {
  var result = {};
  for (var i = 0; i < arguments.length; i++) {
    var obj = arguments[i];
    if (obj && typeof obj === 'object') {
      for (var key in obj) {
        if (obj.hasOwnProperty(key)) result[key] = obj[key];
      }
    }
  }
  return result;
}

function pickKeys(obj, keys) {
  if (!obj || !keys) return {};
  
  var result = {};
  for (var i = 0; i < keys.length; i++) {
    if (obj.hasOwnProperty(keys[i])) {
      result[keys[i]] = obj[keys[i]];
    }
  }
  return result;
}

function groupBy(array, key) {
  if (!array || !Array.isArray(array) || !key) return {};
  
  var groups = {};
  for (var i = 0; i < array.length; i++) {
    var item = array[i];
    if (!item || typeof item !== 'object') continue;
    
    var groupKey = item[key];
    if (groupKey === undefined || groupKey === null) groupKey = 'null';
    
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(item);
  }
  return groups;
}

function sumArray(numbers) {
  if (!numbers || !Array.isArray(numbers)) return 0;
  
  var sum = 0;
  for (var i = 0; i < numbers.length; i++) {
    if (typeof numbers[i] === 'number' && !isNaN(numbers[i])) {
      sum += numbers[i];
    }
  }
  return sum;
}

function averageArray(numbers) {
  if (!numbers || !Array.isArray(numbers) || numbers.length === 0) return 0;
  return sumArray(numbers) / numbers.length;
}

// ============================================================================
// MATH HELPERS
// ============================================================================

function roundTo(num, decimals) {
  if (typeof num !== 'number' || isNaN(num)) return 0;
  decimals = decimals || 2;
  var multiplier = Math.pow(10, decimals);
  return Math.round(num * multiplier) / multiplier;
}

function pointsToIdr(points, multiplier) {
  if (typeof points !== 'number' || isNaN(points)) return 0;
  multiplier = multiplier || DEFAULTS.POINTS_TO_IDR_MULTIPLIER;
  return roundTo(points * multiplier, 0);
}

function formatIdr(amount) {
  if (typeof amount !== 'number' || isNaN(amount)) return 'Rp 0';
  return 'Rp ' + amount.toLocaleString('id-ID');
}

function formatNumber(num) {
  if (typeof num !== 'number' || isNaN(num)) return '0';
  return num.toLocaleString('id-ID');
}

// ============================================================================
// STRING HELPERS
// ============================================================================

function truncate(str, maxLength) {
  if (!str || typeof str !== 'string') return '';
  maxLength = maxLength || 100;
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

function toTitleCase(str) {
  if (!str || typeof str !== 'string') return '';
  return str.toLowerCase().replace(/(?:^|\s)\w/g, function(m) { return m.toUpperCase(); });
}

function isEmpty(str) {
  return !str || (typeof str === 'string' && str.trim().length === 0);
}

// ============================================================================
// TESTING
// ============================================================================

function testUtils() {
  Log.separator('Testing Utils.gs');
  
  var passed = 0;
  var failed = 0;
  
  function assert(condition, name) {
    if (condition) { Log.info('test', '✅ ' + name); passed++; }
    else { Log.error('test', '❌ ' + name); failed++; }
  }
  
  function tryTest(name, fn) {
    try { fn(); } 
    catch (e) { Log.error('test', '❌ ' + name + ' ERROR: ' + e.message); failed++; }
  }
  
  // Date tests
  Log.section('Date Helpers');
  tryTest('formatDate', function() {
    var date = new Date(2026, 4, 20, 14, 30, 45);
    assert(formatDate(date, 'YYYY-MM-DD HH:mm:ss') === '2026-05-20 14:30:45', 'formatDate basic');
    assert(formatDate(null) === '', 'formatDate null');
  });
  
  tryTest('parseDate', function() {
    assert(parseDate('2026-05-20') instanceof Date, 'parseDate string');
    assert(parseDate(null) === null, 'parseDate null');
  });
  
  tryTest('hoursBetween', function() {
    var start = new Date(2026, 4, 20, 10, 0);
    var end = new Date(2026, 4, 20, 12, 30);
    assert(hoursBetween(start, end) === 2.5, 'hoursBetween');
  });
  
  // ID tests
  Log.section('ID Generation');
  tryTest('generateId', function() {
    var id = generateId('WO');
    assert(id.indexOf('WO-') === 0, 'generateId prefix');
  });
  
  // Validation tests
  Log.section('Validation');
  tryTest('isValidEmail', function() {
    assert(isValidEmail('test@company.com') === true, 'valid email');
    assert(isValidEmail('notanemail') === false, 'invalid email');
  });
  
  tryTest('validateTeamDistribution', function() {
    assert(validateTeamDistribution({'M001': 100}).valid === true, 'valid solo full-point');
    assert(validateTeamDistribution({'M001': 100, 'M002': 100}).valid === true, 'valid team full-point');
    assert(validateTeamDistribution({'M001': 50, 'M002': 50}).valid === false, 'porsi lama ditolak');
    assert(validateTeamDistribution({'M001': 60, 'M002': 50}).valid === false, 'invalid dist');
  });
  
  // Status tests
  Log.section('Status Helpers');
  tryTest('canTransition', function() {
    assert(canTransition('created', 'in_progress') === true, 'valid transition');
    assert(canTransition('created', 'approved') === false, 'invalid transition');
  });
  
  // Array tests
  Log.section('Array Helpers');
  tryTest('arrayToObjects', function() {
    var objs = arrayToObjects([['1', 'A'], ['2', 'B']], ['id', 'name']);
    assert(objs.length === 2 && objs[0].name === 'A', 'arrayToObjects');
  });
  
  tryTest('groupBy', function() {
    var arr = [{r: 'a', x: 1}, {r: 'b', x: 2}, {r: 'a', x: 3}];
    var g = groupBy(arr, 'r');
    assert(g.a.length === 2, 'groupBy');
  });
  
  // Math tests
  Log.section('Math Helpers');
  tryTest('roundTo', function() {
    assert(roundTo(3.14159, 2) === 3.14, 'roundTo 2');
    assert(roundTo(null, 2) === 0, 'roundTo null');
  });
  
  tryTest('pointsToIdr', function() {
    assert(pointsToIdr(10, 50000) === 500000, 'pointsToIdr');
  });
  
  // Summary
  Log.separator('Results');
  Log.info('test', '✅ Passed: ' + passed + ' | ❌ Failed: ' + failed);
  if (failed === 0) Log.info('test', '🎉 All tests passed!');
}