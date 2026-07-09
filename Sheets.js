/**
 * ============================================================================
 * Sheets.gs - Advanced Spreadsheet CRUD Operations
 * ============================================================================
 * 
 * Production-grade CRUD dengan:
 * - Per-execution read cache (NEW - eliminates N+1 reads)
 * - Real-time reads on first access, cached thereafter within same request
 * - LockService dengan retry logic + exponential backoff
 * - Transaction-like batch operations
 * - Schema validation
 * - Comprehensive error handling
 * - Performance monitoring
 * 
 * Dependencies: Constants.gs, Logger.gs, ResponseHelper.gs, Utils.gs
 * ============================================================================
 */

// Cached spreadsheet object (per execution only)
var _cachedSpreadsheet = null;

// ← PERF FIX: Per-execution read cache
// GAS creates fresh globals per doGet/doPost, so these auto-clear between requests.
// Within one request, each sheet is read from Sheets API at most ONCE.
var _headerCache = {};
var _dataCache = {};

/**
 * Invalidate read cache for a sheet (call after any write operation)
 * @param {string} [sheetName] - Specific sheet to invalidate, or omit for all
 */
function _invalidateSheetCache(sheetName) {
  if (sheetName) {
    delete _headerCache[sheetName];
    delete _dataCache[sheetName];
  } else {
    _headerCache = {};
    _dataCache = {};
  }
}

// ============================================================================
// SPREADSHEET ACCESS
// ============================================================================

function getSpreadsheet() {
  if (!_cachedSpreadsheet) {
    try {
      _cachedSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {
      Log.exception('getSpreadsheet', e);
      return null;
    }
  }
  return _cachedSpreadsheet;
}

function getSheet(sheetName) {
  if (!sheetName) {
    Log.warn('getSheet', 'Empty sheet name');
    return null;
  }
  
  try {
    var ss = getSpreadsheet();
    if (!ss) return null;
    
    var sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      Log.warn('getSheet', 'Sheet not found', {sheetName: sheetName});
      return null;
    }
    
    return sheet;
  } catch (e) {
    Log.exception('getSheet', e, {sheetName: sheetName});
    return null;
  }
}

function sheetExists(sheetName) {
  return getSheet(sheetName) !== null;
}

// ============================================================================
// READ OPERATIONS (Cached per execution)
// ============================================================================

function readSheet(sheetName) {
  // ← PERF FIX: Return cached data if available (same execution)
  if (_dataCache.hasOwnProperty(sheetName)) {
    return _dataCache[sheetName];
  }

  var timer = Log.startTimer('readSheet');
  
  try {
    var sheet = getSheet(sheetName);
    if (!sheet) return [];
    
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    
    if (lastRow <= 1 || lastCol === 0) return [];
    
    var range = sheet.getRange(2, 1, lastRow - 1, lastCol);
    var data = range.getValues();
    
    // ← PERF FIX: Store in cache
    _dataCache[sheetName] = data;
    
    timer.end('Read complete', {sheetName: sheetName, rows: data.length});
    return data;
    
  } catch (e) {
    Log.exception('readSheet', e, {sheetName: sheetName});
    timer.end('Read failed');
    return [];
  }
}

function getSheetHeaders(sheetName) {
  // ← PERF FIX: Return cached headers if available
  if (_headerCache.hasOwnProperty(sheetName)) {
    return _headerCache[sheetName];
  }

  try {
    var sheet = getSheet(sheetName);
    if (!sheet) return [];
    
    var lastCol = sheet.getLastColumn();
    if (lastCol === 0) return [];
    
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    
    // ← PERF FIX: Store in cache
    _headerCache[sheetName] = headers;
    
    return headers;
  } catch (e) {
    Log.exception('getSheetHeaders', e, {sheetName: sheetName});
    return [];
  }
}

function readSheetAsObjects(sheetName) {
  try {
    var headers = getSheetHeaders(sheetName);
    var data = readSheet(sheetName);
    
    if (headers.length === 0 || data.length === 0) return [];
    
    return arrayToObjects(data, headers);
  } catch (e) {
    Log.exception('readSheetAsObjects', e, {sheetName: sheetName});
    return [];
  }
}

function findRowById(sheetName, id, idColumn) {
  if (!id) return null;
  idColumn = idColumn || 'id';
  
  try {
    var headers = getSheetHeaders(sheetName);
    var idColIndex = headers.indexOf(idColumn);
    
    if (idColIndex === -1) {
      Log.warn('findRowById', 'Column not found', {sheetName: sheetName, column: idColumn});
      return null;
    }
    
    var data = readSheet(sheetName);
    
    for (var i = 0; i < data.length; i++) {
      if (data[i][idColIndex] === id) {
        return i + 2; // +1 for header, +1 for 0-indexed
      }
    }
    
    return null;
  } catch (e) {
    Log.exception('findRowById', e, {sheetName: sheetName, id: id});
    return null;
  }
}

function getRowById(sheetName, id, idColumn) {
  if (!id) return null;
  idColumn = idColumn || 'id';
  
  try {
    var headers = getSheetHeaders(sheetName);
    var idColIndex = headers.indexOf(idColumn);
    
    if (idColIndex === -1) return null;
    
    var data = readSheet(sheetName);
    
    for (var i = 0; i < data.length; i++) {
      if (data[i][idColIndex] === id) {
        var obj = {};
        for (var j = 0; j < headers.length; j++) {
          var value = data[i][j];
          if (value === undefined || value === '') value = null;
          obj[headers[j]] = value;
        }
        return obj;
      }
    }
    
    return null;
  } catch (e) {
    Log.exception('getRowById', e, {sheetName: sheetName, id: id});
    return null;
  }
}

function queryRows(sheetName, filterFn) {
  try {
    var objects = readSheetAsObjects(sheetName);
    
    if (!filterFn || typeof filterFn !== 'function') return objects;
    
    var results = [];
    for (var i = 0; i < objects.length; i++) {
      try {
        if (filterFn(objects[i])) results.push(objects[i]);
      } catch (e) {
        Log.warn('queryRows', 'Filter function threw', {index: i, error: e.message});
      }
    }
    
    return results;
  } catch (e) {
    Log.exception('queryRows', e, {sheetName: sheetName});
    return [];
  }
}

function getRowCount(sheetName) {
  try {
    var sheet = getSheet(sheetName);
    if (!sheet) return 0;
    return Math.max(0, sheet.getLastRow() - 1);
  } catch (e) {
    return 0;
  }
}

// ============================================================================
// WRITE OPERATIONS (With Lock Retry + Cache Invalidation)
// ============================================================================

function appendRow(sheetName, dataObject) {
  var timer = Log.startTimer('appendRow');
  
  if (!sheetName || !dataObject) {
    timer.end('Invalid input');
    return null;
  }
  
  var lock = acquireLockWithRetry('append_' + sheetName);
  if (!lock) {
    timer.end('Lock failed');
    return null;
  }
  
  try {
    // ← PERF FIX: Invalidate cache before write
    _invalidateSheetCache(sheetName);

    var sheet = getSheet(sheetName);
    if (!sheet) {
      Log.error('appendRow', 'Sheet not found', {sheetName: sheetName});
      return null;
    }
    
    var headers = getSheetHeaders(sheetName);
    if (headers.length === 0) {
      Log.error('appendRow', 'No headers found', {sheetName: sheetName});
      return null;
    }
    
    var row = objectToArray(dataObject, headers);
    sheet.appendRow(row);
    
    // ← PERF FIX: Invalidate again after write (data changed)
    _invalidateSheetCache(sheetName);

    var lastRow = sheet.getLastRow();
    timer.end('Appended', {sheetName: sheetName, row: lastRow});
    return lastRow;
    
  } catch (e) {
    Log.exception('appendRow', e, {sheetName: sheetName});
    timer.end('Failed');
    return null;
  } finally {
    releaseLock(lock);
  }
}

function updateRow(sheetName, id, dataObject, idColumn) {
  var timer = Log.startTimer('updateRow');
  
  if (!sheetName || !id || !dataObject) {
    timer.end('Invalid input');
    return false;
  }
  
  idColumn = idColumn || 'id';
  
  var lock = acquireLockWithRetry('update_' + sheetName);
  if (!lock) {
    timer.end('Lock failed');
    return false;
  }
  
  try {
    var headers = getSheetHeaders(sheetName);
    var cachedData = readSheet(sheetName);
    var idColIndex = headers.indexOf(idColumn);
    
    if (idColIndex === -1) {
      Log.warn('updateRow', 'ID column not found', {sheetName: sheetName, column: idColumn});
      return false;
    }
    
    // Find the row in cached data
    var rowIndex = -1;
    for (var i = 0; i < cachedData.length; i++) {
      if (cachedData[i][idColIndex] === id) {
        rowIndex = i;
        break;
      }
    }
    
    if (rowIndex === -1) {
      Log.warn('updateRow', 'Row not found', {sheetName: sheetName, id: id});
      return false;
    }
    
    var rowNum = rowIndex + 2; // +1 header, +1 zero-index
    
    // ← PERF FIX: Build merged row from cached data, then single setValues()
    // (was: individual setValue per column = N API calls; now: 1 API call)
    var currentValues = [];
    for (var k = 0; k < cachedData[rowIndex].length; k++) {
      currentValues.push(cachedData[rowIndex][k]);
    }
    
    var changeCount = 0;
    for (var j = 0; j < headers.length; j++) {
      var header = headers[j];
      if (dataObject.hasOwnProperty(header)) {
        var value = dataObject[header];
        if (value === null || value === undefined) value = '';
        currentValues[j] = value;
        changeCount++;
      }
    }
    
    if (changeCount === 0) {
      timer.end('No changes', {sheetName: sheetName, id: id});
      return true;
    }
    
    var sheet = getSheet(sheetName);
    sheet.getRange(rowNum, 1, 1, headers.length).setValues([currentValues]);
    
    // ← PERF FIX: Invalidate cache after write
    _invalidateSheetCache(sheetName);
    
    timer.end('Updated', {sheetName: sheetName, id: id, fields: changeCount});
    return true;
    
  } catch (e) {
    Log.exception('updateRow', e, {sheetName: sheetName, id: id});
    timer.end('Failed');
    return false;
  } finally {
    releaseLock(lock);
  }
}

function deleteRow(sheetName, id, idColumn) {
  if (!sheetName || !id) return false;
  idColumn = idColumn || 'id';
  
  var lock = acquireLockWithRetry('delete_' + sheetName);
  if (!lock) return false;
  
  try {
    var rowNum = findRowById(sheetName, id, idColumn);
    if (!rowNum) return false;
    
    var sheet = getSheet(sheetName);
    sheet.deleteRow(rowNum);
    
    // ← PERF FIX: Invalidate cache after delete
    _invalidateSheetCache(sheetName);
    
    Log.info('deleteRow', 'Deleted', {sheetName: sheetName, id: id});
    return true;
    
  } catch (e) {
    Log.exception('deleteRow', e, {sheetName: sheetName, id: id});
    return false;
  } finally {
    releaseLock(lock);
  }
}

function bulkAppendRows(sheetName, dataObjects) {
  var timer = Log.startTimer('bulkAppendRows');
  
  if (!dataObjects || !Array.isArray(dataObjects) || dataObjects.length === 0) {
    timer.end('Empty input');
    return true;
  }
  
  var lock = acquireLockWithRetry('bulk_' + sheetName);
  if (!lock) {
    timer.end('Lock failed');
    return false;
  }
  
  try {
    // ← PERF FIX: Invalidate before write
    _invalidateSheetCache(sheetName);

    var sheet = getSheet(sheetName);
    if (!sheet) return false;
    
    var headers = getSheetHeaders(sheetName);
    if (headers.length === 0) return false;
    
    var rows = [];
    for (var i = 0; i < dataObjects.length; i++) {
      rows.push(objectToArray(dataObjects[i], headers));
    }
    
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, rows.length, headers.length).setValues(rows);
    
    // ← PERF FIX: Invalidate after write
    _invalidateSheetCache(sheetName);
    
    timer.end('Bulk appended', {sheetName: sheetName, count: rows.length});
    return true;
    
  } catch (e) {
    Log.exception('bulkAppendRows', e, {sheetName: sheetName});
    timer.end('Failed');
    return false;
  } finally {
    releaseLock(lock);
  }
}

function clearSheetData(sheetName) {
  if (!sheetName) return false;
  
  var lock = acquireLockWithRetry('clear_' + sheetName);
  if (!lock) return false;
  
  try {
    var sheet = getSheet(sheetName);
    if (!sheet) return false;
    
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) return true;
    
    sheet.deleteRows(2, lastRow - 1);
    
    // ← PERF FIX: Invalidate after clear
    _invalidateSheetCache(sheetName);
    
    Log.info('clearSheetData', 'Cleared', {sheetName: sheetName});
    return true;
    
  } catch (e) {
    Log.exception('clearSheetData', e, {sheetName: sheetName});
    return false;
  } finally {
    releaseLock(lock);
  }
}

// ============================================================================
// LOCK SERVICE WITH RETRY LOGIC
// ============================================================================

function acquireLockWithRetry(lockName, maxRetries) {
  maxRetries = maxRetries || LOCK_CONFIG.MAX_RETRIES;
  
  for (var attempt = 1; attempt <= maxRetries; attempt++) {
    var lock = acquireLock(lockName);
    
    if (lock) {
      if (attempt > 1) {
        Log.info('acquireLockWithRetry', 'Lock acquired after retry', {
          lockName: lockName,
          attempts: attempt
        });
      }
      return lock;
    }
    
    if (attempt < maxRetries) {
      // Exponential backoff: 500ms, 1000ms, 2000ms
      var delay = LOCK_CONFIG.RETRY_DELAY_MS * Math.pow(2, attempt - 1);
      Log.warn('acquireLockWithRetry', 'Retry after delay', {
        lockName: lockName,
        attempt: attempt,
        delayMs: delay
      });
      Utilities.sleep(delay);
    }
  }
  
  Log.error('acquireLockWithRetry', 'Failed after all retries', {
    lockName: lockName,
    maxRetries: maxRetries
  });
  return null;
}

function acquireLock(lockName, timeoutMs) {
  timeoutMs = timeoutMs || LOCK_CONFIG.DEFAULT_TIMEOUT_MS;
  
  try {
    var lock = LockService.getScriptLock();
    var acquired = lock.tryLock(timeoutMs);
    
    if (!acquired) {
      Log.debug('acquireLock', 'Could not acquire', {lockName: lockName});
      return null;
    }
    
    return lock;
  } catch (e) {
    Log.exception('acquireLock', e, {lockName: lockName});
    return null;
  }
}

function releaseLock(lock) {
  if (!lock) return;
  
  try {
    lock.releaseLock();
  } catch (e) {
    Log.warn('releaseLock', 'Error releasing', {error: e.message});
  }
}

// ============================================================================
// SCHEMA VALIDATION
// ============================================================================

function validateSheetSchema(sheetName, expectedHeaders) {
  if (!sheetName || !expectedHeaders) {
    return {valid: false, error: 'Missing parameters'};
  }
  
  var actualHeaders = getSheetHeaders(sheetName);
  
  if (actualHeaders.length === 0) {
    return {valid: false, error: 'Sheet has no headers or does not exist'};
  }
  
  var missing = [];
  for (var i = 0; i < expectedHeaders.length; i++) {
    if (actualHeaders.indexOf(expectedHeaders[i]) === -1) {
      missing.push(expectedHeaders[i]);
    }
  }
  
  if (missing.length > 0) {
    return {
      valid: false,
      error: 'Missing columns: ' + missing.join(', '),
      missing: missing
    };
  }
  
  return {valid: true};
}

// ============================================================================
// TRANSACTION-LIKE OPERATIONS
// ============================================================================

/**
 * Execute multiple operations as transaction
 * If any operation fails, log error but does not rollback (Sheets doesn't support true transactions)
 * @param {Array<Function>} operations - Array of functions returning boolean
 * @return {Object} {success: boolean, completedSteps: number, failedAt: number}
 */
function executeTransaction(operations) {
  if (!operations || !Array.isArray(operations)) {
    return {success: false, completedSteps: 0, failedAt: -1};
  }
  
  var timer = Log.startTimer('executeTransaction');
  var completedSteps = 0;
  
  for (var i = 0; i < operations.length; i++) {
    try {
      var result = operations[i]();
      
      if (!result) {
        Log.error('executeTransaction', 'Operation failed', {step: i + 1});
        timer.end('Failed', {step: i + 1});
        return {
          success: false,
          completedSteps: completedSteps,
          failedAt: i + 1
        };
      }
      
      completedSteps++;
    } catch (e) {
      Log.exception('executeTransaction', e, {step: i + 1});
      timer.end('Failed with exception', {step: i + 1});
      return {
        success: false,
        completedSteps: completedSteps,
        failedAt: i + 1,
        error: e.message
      };
    }
  }
  
  timer.end('Transaction complete', {steps: operations.length});
  return {success: true, completedSteps: completedSteps, failedAt: -1};
}

// ============================================================================
// TESTING
// ============================================================================

function testSheets() {
  Log.separator('Testing Sheets.gs');
  
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
  
  // Test spreadsheet access
  Log.section('Spreadsheet Access');
  tryTest('getSpreadsheet', function() {
    var ss = getSpreadsheet();
    assert(ss !== null && ss.getName() !== null, 'getSpreadsheet returns valid spreadsheet');
  });
  
  tryTest('sheetExists', function() {
    assert(sheetExists(SHEETS.CONFIG_COMPONENTS) === true, 'Config_Components exists');
    assert(sheetExists('NonExistentSheet') === false, 'Non-existent returns false');
  });
  
  // Test read operations
  Log.section('Read Operations');
  tryTest('getSheetHeaders', function() {
    var headers = getSheetHeaders(SHEETS.CONFIG_COMPONENTS);
    assert(headers.length === 7 && headers.indexOf('component_no') !== -1, 'Headers loaded');
  });
  
  tryTest('readSheet', function() {
    var data = readSheet(SHEETS.CONFIG_COMPONENTS);
    assert(data.length === 94, 'Read 94 component rows');
  });
  
  tryTest('readSheetAsObjects', function() {
    var objs = readSheetAsObjects(SHEETS.CONFIG_UNITS);
    assert(objs.length === 4 && objs[0].unit_id === 'UNIT-001', 'Read units as objects');
  });
  
  tryTest('queryRows', function() {
    var supervisors = queryRows(SHEETS.CONFIG_MECHANICS, function(m) {
      return m.role === 'supervisor';
    });
    assert(supervisors.length === 3, 'Query 3 supervisors');
  });
  
  tryTest('getRowCount', function() {
    var count = getRowCount(SHEETS.CONFIG_COMPONENTS);
    assert(count === 94, 'Row count = 94');
  });

  // ← PERF FIX: Test cache behavior
  Log.section('Cache Tests');
  tryTest('readSheet cache hit', function() {
    _invalidateSheetCache(); // clear all
    var t1 = new Date().getTime();
    readSheet(SHEETS.CONFIG_COMPONENTS); // cold read
    var t2 = new Date().getTime();
    readSheet(SHEETS.CONFIG_COMPONENTS); // should be cached
    var t3 = new Date().getTime();
    var coldMs = t2 - t1;
    var hotMs = t3 - t2;
    Log.info('test', 'Cold read: ' + coldMs + 'ms, Cache hit: ' + hotMs + 'ms');
    assert(hotMs <= 5, 'Cache hit < 5ms (was ' + hotMs + 'ms)');
  });
  
  // Test CRUD operations (use WorkOrders sheet)
  Log.section('CRUD Operations');
  
  tryTest('CRUD full cycle', function() {
    var testId = 'TEST-' + new Date().getTime();
    var testWo = {
      id: testId,
      wo_number: 'WO-TEST-' + testId,
      component_id: 'COM-001',
      unit_id: 'UNIT-001',
      status: 'created',
      created_by: 'test@company.com',
      created_at: new Date()
    };
    
    // 1. Append
    var rowNum = appendRow(SHEETS.WORK_ORDERS, testWo);
    assert(rowNum !== null && rowNum > 1, 'CRUD: appendRow');
    
    // 2. Find
    var foundRow = findRowById(SHEETS.WORK_ORDERS, testId, 'id');
    assert(foundRow === rowNum, 'CRUD: findRowById');
    
    // 3. Get
    var rowObj = getRowById(SHEETS.WORK_ORDERS, testId, 'id');
    assert(rowObj !== null && rowObj.wo_number === testWo.wo_number, 'CRUD: getRowById');
    
    // 4. Update
    var updated = updateRow(SHEETS.WORK_ORDERS, testId, {status: 'in_progress'}, 'id');
    assert(updated === true, 'CRUD: updateRow');
    
    var afterUpdate = getRowById(SHEETS.WORK_ORDERS, testId, 'id');
    assert(afterUpdate.status === 'in_progress', 'CRUD: status updated');
    
    // 5. Delete
    var deleted = deleteRow(SHEETS.WORK_ORDERS, testId, 'id');
    assert(deleted === true, 'CRUD: deleteRow');
    
    var afterDelete = getRowById(SHEETS.WORK_ORDERS, testId, 'id');
    assert(afterDelete === null, 'CRUD: row gone after delete');
  });
  
  // Test schema validation
  Log.section('Schema Validation');
  tryTest('validateSheetSchema', function() {
    var result = validateSheetSchema(SHEETS.CONFIG_COMPONENTS, ['component_no', 'component_name', 'base_points']);
    assert(result.valid === true, 'Valid schema');
    
    var invalid = validateSheetSchema(SHEETS.CONFIG_COMPONENTS, ['nonexistent_column']);
    assert(invalid.valid === false, 'Invalid schema detected');
  });
  
  // Summary
  Log.separator('Test Results');
  Log.info('test', '✅ Passed: ' + passed + ' | ❌ Failed: ' + failed);
  if (failed === 0) Log.info('test', '🎉 All tests passed!');
}