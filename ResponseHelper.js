/**
 * ============================================================================
 * ResponseHelper.gs - Standardized API Response Format
 * ============================================================================
 * 
 * Provides consistent response format untuk semua public functions.
 * All services return objects dengan struktur:
 *   - Success: {success: true, data: <result>, error: null}
 *   - Error: {success: false, data: null, error: {code, message, details}}
 * 
 * Dependencies: Constants.gs (ERROR_CODES, ERROR_MESSAGES), Logger.gs
 * ============================================================================
 */

// ============================================================================
// RESPONSE BUILDERS
// ============================================================================

/**
 * Create success response
 * @param {*} data - Response data
 * @param {Object} meta - Optional metadata
 * @return {Object}
 */
function successResponse(data, meta) {
  var response = {
    success: true,
    data: data !== undefined ? data : null,
    error: null
  };
  
  if (meta) {
    response.meta = meta;
  }
  
  return response;
}

/**
 * Create error response
 * @param {string} code - Error code dari ERROR_CODES
 * @param {string} message - Optional custom message (defaults to message dari ERROR_MESSAGES)
 * @param {Object} details - Optional error details
 * @return {Object}
 */
function errorResponse(code, message, details) {
  var errorMessage = message || getErrorMessage(code) || 'Unknown error';
  
  return {
    success: false,
    data: null,
    error: {
      code: code,
      message: errorMessage,
      details: details || null,
      timestamp: new Date().toISOString()
    }
  };
}

/**
 * Create validation error response
 * @param {string} field - Field name yang invalid
 * @param {string} reason - Reason validation failed
 * @return {Object}
 */
function validationErrorResponse(field, reason) {
  return errorResponse(
    ERROR_CODES.VALIDATION_INVALID_FORMAT,
    'Validation failed: ' + reason,
    {field: field, reason: reason}
  );
}

/**
 * Create "not found" error response
 * @param {string} resource - Resource type (e.g., 'WorkOrder', 'Component')
 * @param {string} identifier - ID atau identifier yang dicari
 * @return {Object}
 */
function notFoundResponse(resource, identifier) {
  return errorResponse(
    ERROR_CODES.DATA_NOT_FOUND,
    resource + ' not found',
    {resource: resource, identifier: identifier}
  );
}

/**
 * Create permission denied response
 * @param {string} requiredRole - Required role
 * @param {string} currentRole - User's current role
 * @return {Object}
 */
function permissionDeniedResponse(requiredRole, currentRole) {
  return errorResponse(
    ERROR_CODES.AUTH_PERMISSION_DENIED,
    'Permission denied. Required: ' + requiredRole,
    {required_role: requiredRole, current_role: currentRole}
  );
}

// ============================================================================
// SAFE EXECUTION WRAPPER
// ============================================================================

/**
 * Execute function dengan automatic error handling
 * Wraps function dalam try-catch dan returns standardized response
 * 
 * @param {string} source - Source name untuk logging
 * @param {function} fn - Function to execute
 * @param {Array} args - Arguments untuk function (optional)
 * @return {Object} Standardized response
 */
function safeExecute(source, fn, args) {
  var timer = Log.startTimer(source);
  
  try {
    args = args || [];
    var result = fn.apply(null, args);
    
    timer.end('Success');
    
    // Jika function sudah return standardized response, pass through
    if (result && typeof result === 'object' && result.hasOwnProperty('success')) {
      return result;
    }
    
    // Wrap raw result in success response
    return successResponse(result);
    
  } catch (e) {
    Log.exception(source, e);
    timer.end('Failed', {error: e.message});
    
    return errorResponse(
      ERROR_CODES.SYSTEM_INTERNAL_ERROR,
      e.message,
      {stack: e.stack}
    );
  }
}

// ============================================================================
// VALIDATION HELPERS (Return errors directly)
// ============================================================================

/**
 * Require field, return error if missing
 * @param {*} value
 * @param {string} fieldName
 * @return {Object|null} Error response atau null jika valid
 */
function requireField(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return errorResponse(
      ERROR_CODES.VALIDATION_REQUIRED,
      fieldName + ' is required',
      {field: fieldName}
    );
  }
  return null;
}

/**
 * Require field to be specific type
 * @param {*} value
 * @param {string} fieldName
 * @param {string} expectedType - 'string', 'number', 'boolean', 'object', 'array'
 * @return {Object|null} Error atau null
 */
function requireType(value, fieldName, expectedType) {
  if (value === undefined || value === null) {
    return errorResponse(
      ERROR_CODES.VALIDATION_REQUIRED,
      fieldName + ' is required',
      {field: fieldName}
    );
  }
  
  var actualType;
  if (Array.isArray(value)) {
    actualType = 'array';
  } else {
    actualType = typeof value;
  }
  
  if (actualType !== expectedType) {
    return errorResponse(
      ERROR_CODES.VALIDATION_INVALID_TYPE,
      fieldName + ' must be ' + expectedType + ' (got ' + actualType + ')',
      {field: fieldName, expected: expectedType, actual: actualType}
    );
  }
  
  return null;
}

/**
 * Require number within range
 * @param {number} value
 * @param {string} fieldName
 * @param {number} min
 * @param {number} max
 * @return {Object|null} Error atau null
 */
function requireRange(value, fieldName, min, max) {
  var typeError = requireType(value, fieldName, 'number');
  if (typeError) return typeError;
  
  if (isNaN(value)) {
    return errorResponse(
      ERROR_CODES.VALIDATION_INVALID_TYPE,
      fieldName + ' must be valid number',
      {field: fieldName}
    );
  }
  
  if (min !== undefined && value < min) {
    return errorResponse(
      ERROR_CODES.VALIDATION_OUT_OF_RANGE,
      fieldName + ' must be >= ' + min,
      {field: fieldName, value: value, min: min}
    );
  }
  
  if (max !== undefined && value > max) {
    return errorResponse(
      ERROR_CODES.VALIDATION_OUT_OF_RANGE,
      fieldName + ' must be <= ' + max,
      {field: fieldName, value: value, max: max}
    );
  }
  
  return null;
}

/**
 * Require value to be in allowed list
 * @param {*} value
 * @param {string} fieldName
 * @param {Array} allowedValues
 * @return {Object|null} Error atau null
 */
function requireOneOf(value, fieldName, allowedValues) {
  if (!allowedValues || allowedValues.length === 0) {
    return null;
  }
  
  if (allowedValues.indexOf(value) === -1) {
    return errorResponse(
      ERROR_CODES.VALIDATION_INVALID_FORMAT,
      fieldName + ' must be one of: ' + allowedValues.join(', '),
      {field: fieldName, value: value, allowed: allowedValues}
    );
  }
  
  return null;
}

/**
 * Validate multiple fields at once
 * @param {Object} data - Data object
 * @param {Object} schema - Schema definition {fieldName: {required, type, min, max, oneOf}}
 * @return {Object|null} Error response atau null jika all valid
 */
function validateSchema(data, schema) {
  if (!data || typeof data !== 'object') {
    return errorResponse(
      ERROR_CODES.VALIDATION_INVALID_TYPE,
      'Data must be an object'
    );
  }
  
  for (var fieldName in schema) {
    if (!schema.hasOwnProperty(fieldName)) continue;
    
    var rules = schema[fieldName];
    var value = data[fieldName];
    
    // Check required
    if (rules.required) {
      var requiredError = requireField(value, fieldName);
      if (requiredError) return requiredError;
    }
    
    // Skip other checks if value is undefined/null and not required
    if (value === undefined || value === null) continue;
    
    // Check type
    if (rules.type) {
      var typeError = requireType(value, fieldName, rules.type);
      if (typeError) return typeError;
    }
    
    // Check range
    if (rules.min !== undefined || rules.max !== undefined) {
      var rangeError = requireRange(value, fieldName, rules.min, rules.max);
      if (rangeError) return rangeError;
    }
    
    // Check oneOf
    if (rules.oneOf && rules.oneOf.length > 0) {
      var oneOfError = requireOneOf(value, fieldName, rules.oneOf);
      if (oneOfError) return oneOfError;
    }
    
    // Check custom validator
    if (rules.validator && typeof rules.validator === 'function') {
      var customError = rules.validator(value, fieldName);
      if (customError) return customError;
    }
  }
  
  return null;
}

// ============================================================================
// RESPONSE INSPECTION
// ============================================================================

/**
 * Check if response is success
 * @param {Object} response
 * @return {boolean}
 */
function isSuccess(response) {
  return response && response.success === true;
}

/**
 * Check if response is error
 * @param {Object} response
 * @return {boolean}
 */
function isError(response) {
  return response && response.success === false;
}

/**
 * Get error code from response
 * @param {Object} response
 * @return {string|null}
 */
function getErrorCode(response) {
  if (!isError(response)) return null;
  return response.error && response.error.code;
}

/**
 * Get error message from response
 * @param {Object} response
 * @return {string|null}
 */
function getErrorMessageFromResponse(response) {
  if (!isError(response)) return null;
  return response.error && response.error.message;
}

/**
 * Extract data from response (throws if error)
 * @param {Object} response
 * @return {*} Data
 * @throws {Error} If response is error
 */
function unwrapResponse(response) {
  if (isSuccess(response)) {
    return response.data;
  }
  
  var errorMsg = getErrorMessageFromResponse(response) || 'Unknown error';
  throw new Error(errorMsg);
}

// ============================================================================
// TESTING
// ============================================================================

/**
 * Test ResponseHelper functions
 */
function testResponseHelper() {
  Log.separator('Testing ResponseHelper.gs');
  
  var passed = 0;
  var failed = 0;
  
  // Test successResponse
  try {
    var success = successResponse({id: 1, name: 'Test'});
    if (success.success === true && success.data.id === 1 && success.error === null) {
      Log.info('test', '✅ successResponse: PASS');
      passed++;
    } else {
      Log.error('test', '❌ successResponse: FAIL');
      failed++;
    }
  } catch (e) {
    Log.error('test', '❌ successResponse: ERROR - ' + e.message);
    failed++;
  }
  
  // Test errorResponse
  try {
    var err = errorResponse(ERROR_CODES.DATA_NOT_FOUND, 'Custom message');
    if (err.success === false && err.error.code === 'DATA_001' && err.error.message === 'Custom message') {
      Log.info('test', '✅ errorResponse: PASS');
      passed++;
    } else {
      Log.error('test', '❌ errorResponse: FAIL');
      failed++;
    }
  } catch (e) {
    Log.error('test', '❌ errorResponse: ERROR - ' + e.message);
    failed++;
  }
  
  // Test isSuccess / isError
  try {
    var s = successResponse('data');
    var e = errorResponse('TEST');
    
    if (isSuccess(s) && !isError(s) && !isSuccess(e) && isError(e)) {
      Log.info('test', '✅ isSuccess/isError: PASS');
      passed++;
    } else {
      Log.error('test', '❌ isSuccess/isError: FAIL');
      failed++;
    }
  } catch (e) {
    Log.error('test', '❌ isSuccess/isError: ERROR - ' + e.message);
    failed++;
  }
  
  // Test requireField
  try {
    var err1 = requireField(null, 'name');
    var err2 = requireField('value', 'name');
    
    if (isError(err1) && err2 === null) {
      Log.info('test', '✅ requireField: PASS');
      passed++;
    } else {
      Log.error('test', '❌ requireField: FAIL');
      failed++;
    }
  } catch (e) {
    Log.error('test', '❌ requireField: ERROR - ' + e.message);
    failed++;
  }
  
  // Test requireRange
  try {
    var err1 = requireRange(50, 'percentage', 0, 100); // Valid
    var err2 = requireRange(150, 'percentage', 0, 100); // Invalid (too high)
    var err3 = requireRange(-10, 'percentage', 0, 100); // Invalid (too low)
    
    if (err1 === null && isError(err2) && isError(err3)) {
      Log.info('test', '✅ requireRange: PASS');
      passed++;
    } else {
      Log.error('test', '❌ requireRange: FAIL');
      failed++;
    }
  } catch (e) {
    Log.error('test', '❌ requireRange: ERROR - ' + e.message);
    failed++;
  }
  
  // Test validateSchema
  try {
    var schema = {
      name: {required: true, type: 'string'},
      age: {required: true, type: 'number', min: 0, max: 150},
      status: {required: false, oneOf: ['active', 'inactive']}
    };
    
    var validData = {name: 'John', age: 30, status: 'active'};
    var invalidData = {name: 'John', age: 200}; // Age out of range
    
    var err1 = validateSchema(validData, schema);
    var err2 = validateSchema(invalidData, schema);
    
    if (err1 === null && isError(err2)) {
      Log.info('test', '✅ validateSchema: PASS');
      passed++;
    } else {
      Log.error('test', '❌ validateSchema: FAIL');
      failed++;
    }
  } catch (e) {
    Log.error('test', '❌ validateSchema: ERROR - ' + e.message);
    failed++;
  }
  
  // Test safeExecute
  try {
    var goodFn = function() { return 'success'; };
    var badFn = function() { throw new Error('test error'); };
    
    var result1 = safeExecute('testFn', goodFn);
    var result2 = safeExecute('testFn', badFn);
    
    if (isSuccess(result1) && result1.data === 'success' && isError(result2)) {
      Log.info('test', '✅ safeExecute: PASS');
      passed++;
    } else {
      Log.error('test', '❌ safeExecute: FAIL');
      failed++;
    }
  } catch (e) {
    Log.error('test', '❌ safeExecute: ERROR - ' + e.message);
    failed++;
  }
  
  // Summary
  Log.separator('Test Results');
  Log.info('test', '✅ Passed: ' + passed);
  Log.info('test', '❌ Failed: ' + failed);
  Log.info('test', 'Total: ' + (passed + failed));
}



function testFullApprovalFlow() {
  Logger.log('=== FULL APPROVAL FLOW TEST ===');
  
  // Get user
  var user = getCurrentUserWithRole();
  Logger.log('User: ' + JSON.stringify(user));
  
  // Call getPendingApprovals
  var result = getPendingApprovals(user.email);
  Logger.log('Result success: ' + result.success);
  Logger.log('Result count: ' + (result.data ? result.data.length : 0));
  
  if (result.success && result.data) {
    Logger.log('First WO: ' + JSON.stringify(result.data[0]));
  } else {
    Logger.log('Error: ' + JSON.stringify(result.error));
  }
  
  return result;
}