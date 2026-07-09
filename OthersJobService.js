/**
 * ============================================================================
 * OthersJobService.gs - Others Job Request Handling
 * ============================================================================
 * 
 * Simplified service untuk pekerjaan "Others" (di luar komponen normal):
 * 
 * FLOW:
 * 1. Mechanic submit job description (free text)
 * 2. Supervisor review → approve atau reject
 * 3. If approved → bisa di-convert ke WO normal (dengan component assignment)
 * 
 * Simplified vs normal WO:
 * - Only 1 approval layer (Supervisor only, no Superintendent)
 * - No MTBF tracking
 * - Job description free-form (not tied to component initially)
 * - Can be converted to normal WO after approval
 * 
 * Dependencies: Constants, Logger, ResponseHelper, Sheets, Auth, AuditService, WorkOrderService
 * ============================================================================
 */

// ============================================================================
// OTHERS JOB CREATION
// ============================================================================

/**
 * Create others job request
 * 
 * @param {string} jobDescription - Free-form job description
 * @param {string} requestedBy - Mechanic email
 * @param {Object} additionalData - Optional {estimated_hours, attachments}
 * @return {Object} Response {success, data: {othersJobId}}
 */
function createOthersJobRequest(jobDescription, requestedBy, additionalData) {
  var timer = Log.startTimer('createOthersJobRequest');
  
  try {
    // Validation
    var validationError = requireField(jobDescription, 'jobDescription');
    if (validationError) return validationError;
    
    requestedBy = requestedBy || getCurrentUser();
    
    if (!requestedBy) {
      return errorResponse(ERROR_CODES.AUTH_USER_NOT_FOUND, 'User not found');
    }
    
    // Validate request data
    var validation = validateOthersJobRequest({
      job_description: jobDescription,
      requested_by: requestedBy
    });
    
    if (isError(validation)) return validation;
    
    // Generate ID
    var othersJobId = generateId(ID_PREFIXES.OTHERS_JOB);
    
    // Build request
    var othersJob = {
      id: othersJobId,
      job_description: jobDescription,
      requested_by: requestedBy,
      status: 'pending',
      created_at: new Date()
    };
    
    // Insert
    var rowNum = appendRow(SHEETS.OTHERS_JOB_REQUESTS, othersJob);
    
    if (!rowNum) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to create others job request');
    }
    
    // Audit log
    logOthersJobSubmit(othersJobId, requestedBy, jobDescription);
    
    timer.end('Others job created', {othersJobId: othersJobId});
    
    return successResponse({
      othersJobId: othersJobId,
      status: 'pending'
    });
    
  } catch (e) {
    Log.exception('createOthersJobRequest', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Validate others job request data
 */
function validateOthersJobRequest(requestData) {
  if (!requestData) {
    return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'Request data required');
  }
  
  var validationError = requireField(requestData.job_description, 'job_description');
  if (validationError) return validationError;
  
  validationError = requireField(requestData.requested_by, 'requested_by');
  if (validationError) return validationError;
  
  // Job description min length
  if (requestData.job_description.length < 10) {
    return errorResponse(
      ERROR_CODES.VALIDATION_INVALID,
      'Job description must be at least 10 characters'
    );
  }
  
  return successResponse({valid: true});
}

// ============================================================================
// SUPERVISOR APPROVAL/REJECTION
// ============================================================================

/**
 * Supervisor approve others job request
 * 
 * @param {string} requestId
 * @param {string} approverEmail
 * @param {string} notes - Optional approval notes
 * @return {Object} Response
 */
function supervisorApproveOthersJob(requestId, approverEmail, notes) {
  var timer = Log.startTimer('supervisorApproveOthersJob');
  
  try {
    // Authorization
    var authCheck = checkAuthorization([ROLES.SUPERVISOR, ROLES.SUPERINTENDENT]);
    if (isError(authCheck)) return authCheck;
    
    approverEmail = approverEmail || getCurrentUser();
    
    // Get request
    var request = getRowById(SHEETS.OTHERS_JOB_REQUESTS, requestId, 'id');
    
    if (!request) {
      return notFoundResponse('OthersJobRequest', requestId);
    }
    
    // Must be pending
    if (request.status !== 'pending') {
      return errorResponse(
        ERROR_CODES.DATA_INVALID_STATE,
        'Request must be pending. Current status: ' + request.status
      );
    }
    
    // Update status
    var updated = updateRow(SHEETS.OTHERS_JOB_REQUESTS, requestId, {
      status: 'approved'
    }, 'id');
    
    if (!updated) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to approve request');
    }
    
    // Audit log
    logOthersJobApprove(requestId, approverEmail);
    
    timer.end('Others job approved', {requestId: requestId});
    
    return successResponse({
      othersJobId: requestId,
      status: 'approved',
      approvedBy: approverEmail,
      notes: notes || null
    });
    
  } catch (e) {
    Log.exception('supervisorApproveOthersJob', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Supervisor reject others job request
 */
function supervisorRejectOthersJob(requestId, approverEmail, rejectionReason) {
  var timer = Log.startTimer('supervisorRejectOthersJob');
  
  try {
    // Authorization
    var authCheck = checkAuthorization([ROLES.SUPERVISOR, ROLES.SUPERINTENDENT]);
    if (isError(authCheck)) return authCheck;
    
    approverEmail = approverEmail || getCurrentUser();
    
    var validationError = requireField(rejectionReason, 'rejectionReason');
    if (validationError) return validationError;
    
    // Get request
    var request = getRowById(SHEETS.OTHERS_JOB_REQUESTS, requestId, 'id');
    
    if (!request) {
      return notFoundResponse('OthersJobRequest', requestId);
    }
    
    if (request.status !== 'pending') {
      return errorResponse(
        ERROR_CODES.DATA_INVALID_STATE,
        'Request must be pending. Current status: ' + request.status
      );
    }
    
    // Update status
    var updated = updateRow(SHEETS.OTHERS_JOB_REQUESTS, requestId, {
      status: 'rejected'
    }, 'id');
    
    if (!updated) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to reject request');
    }
    
    // Audit log
    logOthersJobReject(requestId, approverEmail, rejectionReason);
    
    timer.end('Others job rejected', {requestId: requestId});
    
    return successResponse({
      othersJobId: requestId,
      status: 'rejected',
      rejectedBy: approverEmail,
      reason: rejectionReason
    });
    
  } catch (e) {
    Log.exception('supervisorRejectOthersJob', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// CONVERSION TO WORK ORDER
// ============================================================================

/**
 * Convert approved others job to normal WO
 * Assigns component and creates proper WO
 * 
 * @param {string} requestId
 * @param {string} componentId - Component to assign
 * @param {string} unitId - Unit to assign
 * @param {string} convertedBy
 * @return {Object} Response {success, data: {woId, wo_number}}
 */
function convertToWorkOrder(requestId, componentId, unitId, convertedBy) {
  var timer = Log.startTimer('convertToWorkOrder');
  
  try {
    convertedBy = convertedBy || getCurrentUser();
    
    // Validation
    var validationError = requireField(componentId, 'componentId');
    if (validationError) return validationError;
    
    validationError = requireField(unitId, 'unitId');
    if (validationError) return validationError;
    
    // Get request
    var request = getRowById(SHEETS.OTHERS_JOB_REQUESTS, requestId, 'id');
    
    if (!request) {
      return notFoundResponse('OthersJobRequest', requestId);
    }
    
    // Must be approved
    if (request.status !== 'approved') {
      return errorResponse(
        ERROR_CODES.DATA_INVALID_STATE,
        'Request must be approved before conversion'
      );
    }
    
    // Create WO
    var woData = {
      component_id: componentId,
      unit_id: unitId,
      created_by: request.requested_by
    };
    
    var woResult = createWorkOrder(woData);
    
    if (isError(woResult)) return woResult;
    
    // Update others job status
    updateRow(SHEETS.OTHERS_JOB_REQUESTS, requestId, {
      status: 'converted'
    }, 'id');
    
    timer.end('Converted to WO', {requestId: requestId, woId: woResult.data.woId});
    
    return successResponse({
      othersJobId: requestId,
      woId: woResult.data.woId,
      wo_number: woResult.data.wo_number,
      status: 'converted'
    });
    
  } catch (e) {
    Log.exception('convertToWorkOrder', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// QUERIES
// ============================================================================

/**
 * Get others jobs by status
 */
function getOthersJobsByStatus(status, limit) {
  var timer = Log.startTimer('getOthersJobsByStatus');
  
  try {
    limit = limit || 100;
    
    var jobs = queryRows(SHEETS.OTHERS_JOB_REQUESTS, function(job) {
      return job.status === status;
    });
    
    if (jobs.length > limit) {
      jobs = jobs.slice(0, limit);
    }
    
    timer.end('Query complete', {status: status, found: jobs.length});
    
    return successResponse(jobs, {count: jobs.length});
    
  } catch (e) {
    Log.exception('getOthersJobsByStatus', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Get others jobs by mechanic
 */
function getOthersJobsByMechanic(mechanicEmail, status) {
  var timer = Log.startTimer('getOthersJobsByMechanic');
  
  try {
    if (!mechanicEmail) {
      return errorResponse(ERROR_CODES.VALIDATION_REQUIRED, 'mechanicEmail required');
    }
    
    var jobs = queryRows(SHEETS.OTHERS_JOB_REQUESTS, function(job) {
      var matchEmail = job.requested_by && 
                       job.requested_by.toLowerCase() === mechanicEmail.toLowerCase();
      
      if (status) {
        return matchEmail && job.status === status;
      } else {
        return matchEmail;
      }
    });
    
    timer.end('Query complete', {mechanicEmail: mechanicEmail, found: jobs.length});
    
    return successResponse(jobs, {count: jobs.length});
    
  } catch (e) {
    Log.exception('getOthersJobsByMechanic', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

/**
 * Get pending others jobs for supervisor
 */
function getPendingOthersJobsForSupervisor() {
  return getOthersJobsByStatus('pending', 100);
}

// ============================================================================
// STATUS UPDATES
// ============================================================================

/**
 * Update others job status
 * Generic status update function
 */
function updateOthersJobStatus(requestId, newStatus, updatedBy) {
  var timer = Log.startTimer('updateOthersJobStatus');
  
  try {
    updatedBy = updatedBy || getCurrentUser();
    
    var validStatuses = ['pending', 'approved', 'rejected', 'converted'];
    
    var validationError = requireOneOf(newStatus, 'status', validStatuses);
    if (validationError) return validationError;
    
    // Update
    var updated = updateRow(SHEETS.OTHERS_JOB_REQUESTS, requestId, {
      status: newStatus
    }, 'id');
    
    if (!updated) {
      return errorResponse(ERROR_CODES.SYSTEM_SHEET_WRITE_FAILED, 'Failed to update status');
    }
    
    timer.end('Status updated', {requestId: requestId, newStatus: newStatus});
    
    return successResponse({
      othersJobId: requestId,
      status: newStatus
    });
    
  } catch (e) {
    Log.exception('updateOthersJobStatus', e);
    timer.end('Failed');
    return errorResponse(ERROR_CODES.SYSTEM_INTERNAL_ERROR, e.message);
  }
}

// ============================================================================
// TESTING
// ============================================================================

/**
 * Test OthersJobService functions
 */
function testOthersJobService() {
  Log.separator('Testing OthersJobService.gs');
  
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
  
  var testRequestId;
  
  // Test creation
  Log.section('Others Job Creation');
  
  tryTest('createOthersJobRequest', function() {
    var result = createOthersJobRequest(
      'Need to repair custom hydraulic fitting on Unit ABC',
      'ahmad.fauzi@company.com'
    );
    
    assert(isSuccess(result) && result.data.othersJobId, 'Others job created');
    testRequestId = result.data.othersJobId;
  });
  
  tryTest('validateOthersJobRequest', function() {
    var valid = validateOthersJobRequest({
      job_description: 'Valid job description here',
      requested_by: 'test@company.com'
    });
    
    var invalid = validateOthersJobRequest({
      job_description: 'Short',
      requested_by: 'test@company.com'
    });
    
    assert(isSuccess(valid) && isError(invalid), 'Validation works (min 10 chars)');
  });
  
  // Test queries
  Log.section('Queries');
  
  tryTest('getOthersJobsByStatus', function() {
    var result = getOthersJobsByStatus('pending', 10);
    assert(isSuccess(result), 'Get by status works');
  });
  
  tryTest('getOthersJobsByMechanic', function() {
    var result = getOthersJobsByMechanic('ahmad.fauzi@company.com');
    assert(isSuccess(result) && result.data.length >= 1, 'Get by mechanic works');
  });
  
  tryTest('getPendingOthersJobsForSupervisor', function() {
    var result = getPendingOthersJobsForSupervisor();
    assert(isSuccess(result), 'Get pending for supervisor works');
  });
  
  // Test status updates
  Log.section('Status Updates');
  
  tryTest('updateOthersJobStatus', function() {
    var result = updateOthersJobStatus(testRequestId, 'approved', 'system');
    assert(isSuccess(result) && result.data.status === 'approved', 'Status updated');
  });
  
  // Cleanup
  Log.section('Cleanup');
  tryTest('cleanup', function() {
    var deleted = deleteRow(SHEETS.OTHERS_JOB_REQUESTS, testRequestId, 'id');
    assert(deleted === true, 'Test others job deleted');
  });
  
  // Summary
  Log.separator('Test Results');
  Log.info('test', '✅ Passed: ' + passed + ' | ❌ Failed: ' + failed);
  if (failed === 0) Log.info('test', '🎉 All tests passed!');
}