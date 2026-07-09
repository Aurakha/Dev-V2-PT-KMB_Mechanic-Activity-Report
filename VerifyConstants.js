/**
 * ============================================================================
 * VerifyConstants.gs - Sanity check setelah update Constants.gs
 * ============================================================================
 * 
 * Run: verifyConstants()
 * Read-only, aman.
 * ============================================================================
 */

function verifyConstants() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  VERIFY CONSTANTS.GS — WORKFLOW B                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  
  var pass = 0;
  var fail = 0;
  
  function assert(label, condition, expected, actual) {
    if (condition) {
      console.log('  ✅ ' + label);
      pass++;
    } else {
      console.log('  ❌ ' + label);
      console.log('     Expected: ' + JSON.stringify(expected));
      console.log('     Actual:   ' + JSON.stringify(actual));
      fail++;
    }
  }
  
  // ─── STATUS CONSTANTS ────────────────────────────────────────────────────
  console.log('━━━ WO_STATUS values ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    assert(
      'WO_STATUS.PENDING_MECHANIC_WORK = "pending_mechanic_work"',
      WO_STATUS.PENDING_MECHANIC_WORK === 'pending_mechanic_work',
      'pending_mechanic_work',
      WO_STATUS.PENDING_MECHANIC_WORK
    );
    
    assert(
      'WO_STATUS.IN_PROGRESS = "in_progress"',
      WO_STATUS.IN_PROGRESS === 'in_progress',
      'in_progress',
      WO_STATUS.IN_PROGRESS
    );
    
    assert(
      'WO_STATUS.PENDING_SUPERVISOR = "pending_supervisor"',
      WO_STATUS.PENDING_SUPERVISOR === 'pending_supervisor',
      'pending_supervisor',
      WO_STATUS.PENDING_SUPERVISOR
    );
    
    assert(
      'WO_STATUS.APPROVED = "approved"',
      WO_STATUS.APPROVED === 'approved',
      'approved',
      WO_STATUS.APPROVED
    );
  } catch (e) {
    console.log('  ❌ ERROR reading WO_STATUS: ' + e.message);
    fail++;
  }
  
  console.log('');
  
  // ─── STATE MACHINE TRANSITIONS (Workflow B) ──────────────────────────────
  console.log('━━━ STATE MACHINE (Workflow B) ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    assert(
      'pending_mechanic_work → in_progress (valid)',
      isValidStatusTransition('pending_mechanic_work', 'in_progress') === true,
      true,
      isValidStatusTransition('pending_mechanic_work', 'in_progress')
    );
    
    assert(
      'in_progress → pending_supervisor (valid)',
      isValidStatusTransition('in_progress', 'pending_supervisor') === true,
      true,
      isValidStatusTransition('in_progress', 'pending_supervisor')
    );
    
    assert(
      'pending_supervisor → pending_superintendent (valid)',
      isValidStatusTransition('pending_supervisor', 'pending_superintendent') === true,
      true,
      isValidStatusTransition('pending_supervisor', 'pending_superintendent')
    );
    
    assert(
      'pending_superintendent → approved (valid)',
      isValidStatusTransition('pending_superintendent', 'approved') === true,
      true,
      isValidStatusTransition('pending_superintendent', 'approved')
    );
    
    assert(
      'pending_supervisor → rejected (valid)',
      isValidStatusTransition('pending_supervisor', 'rejected') === true,
      true,
      isValidStatusTransition('pending_supervisor', 'rejected')
    );
    
    assert(
      'pending_superintendent → rejected (valid)',
      isValidStatusTransition('pending_superintendent', 'rejected') === true,
      true,
      isValidStatusTransition('pending_superintendent', 'rejected')
    );
    
    assert(
      'approved → anything (INVALID — terminal)',
      isValidStatusTransition('approved', 'in_progress') === false,
      false,
      isValidStatusTransition('approved', 'in_progress')
    );
    
    assert(
      'pending_mechanic_work → approved (INVALID — must go through workflow)',
      isValidStatusTransition('pending_mechanic_work', 'approved') === false,
      false,
      isValidStatusTransition('pending_mechanic_work', 'approved')
    );
    
  } catch (e) {
    console.log('  ❌ ERROR testing transitions: ' + e.message);
    fail++;
  }
  
  console.log('');
  
  // ─── ROLE FUNCTIONS ──────────────────────────────────────────────────────
  console.log('━━━ ROLE FUNCTIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    assert(
      'isWoCreatorRole("supervisor") = true',
      typeof isWoCreatorRole === 'function' && isWoCreatorRole('supervisor') === true,
      true,
      typeof isWoCreatorRole === 'function' ? isWoCreatorRole('supervisor') : 'FN_MISSING'
    );
    
    assert(
      'isWoCreatorRole("superintendent") = true',
      typeof isWoCreatorRole === 'function' && isWoCreatorRole('superintendent') === true,
      true,
      typeof isWoCreatorRole === 'function' ? isWoCreatorRole('superintendent') : 'FN_MISSING'
    );
    
    assert(
      'isWoCreatorRole("mechanic") = false',
      typeof isWoCreatorRole === 'function' && isWoCreatorRole('mechanic') === false,
      false,
      typeof isWoCreatorRole === 'function' ? isWoCreatorRole('mechanic') : 'FN_MISSING'
    );
    
    assert(
      'isApproverRole("supervisor") = true (existing function still works)',
      isApproverRole('supervisor') === true,
      true,
      isApproverRole('supervisor')
    );
    
  } catch (e) {
    console.log('  ❌ ERROR testing role functions: ' + e.message);
    fail++;
  }
  
  console.log('');
  
  // ─── NEW HELPER FUNCTIONS ────────────────────────────────────────────────
  console.log('━━━ NEW HELPER FUNCTIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    assert(
      'isTerminalStatus("approved") = true',
      typeof isTerminalStatus === 'function' && isTerminalStatus('approved') === true,
      true,
      typeof isTerminalStatus === 'function' ? isTerminalStatus('approved') : 'FN_MISSING'
    );
    
    assert(
      'isTerminalStatus("pending_supervisor") = false',
      typeof isTerminalStatus === 'function' && isTerminalStatus('pending_supervisor') === false,
      false,
      typeof isTerminalStatus === 'function' ? isTerminalStatus('pending_supervisor') : 'FN_MISSING'
    );
    
    assert(
      'isActiveWoStatus("pending_mechanic_work") = true',
      typeof isActiveWoStatus === 'function' && isActiveWoStatus('pending_mechanic_work') === true,
      true,
      typeof isActiveWoStatus === 'function' ? isActiveWoStatus('pending_mechanic_work') : 'FN_MISSING'
    );
    
    assert(
      'getStatusLabel("pending_mechanic_work") = "Pending Mechanic Work"',
      typeof getStatusLabel === 'function' && getStatusLabel('pending_mechanic_work') === 'Pending Mechanic Work',
      'Pending Mechanic Work',
      typeof getStatusLabel === 'function' ? getStatusLabel('pending_mechanic_work') : 'FN_MISSING'
    );
    
  } catch (e) {
    console.log('  ❌ ERROR testing helpers: ' + e.message);
    fail++;
  }
  
  console.log('');
  
  // ─── ERROR CODES (new) ───────────────────────────────────────────────────
  console.log('━━━ NEW ERROR CODES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    assert(
      'ERROR_CODES.WO_INVALID_TIME_RANGE exists',
      ERROR_CODES.WO_INVALID_TIME_RANGE === 'WO_008',
      'WO_008',
      ERROR_CODES.WO_INVALID_TIME_RANGE
    );
    
    assert(
      'ERROR_CODES.VALIDATION_INVALID exists',
      ERROR_CODES.VALIDATION_INVALID === 'VAL_009',
      'VAL_009',
      ERROR_CODES.VALIDATION_INVALID
    );
  } catch (e) {
    console.log('  ❌ ERROR testing error codes: ' + e.message);
    fail++;
  }
  
  console.log('');
  
  // ─── AUDIT ACTIONS (new) ─────────────────────────────────────────────────
  console.log('━━━ NEW AUDIT ACTIONS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    assert(
      'AUDIT_ACTIONS.MECHANIC_SUBMIT_WORK exists',
      AUDIT_ACTIONS.MECHANIC_SUBMIT_WORK === 'mechanic_submit_work',
      'mechanic_submit_work',
      AUDIT_ACTIONS.MECHANIC_SUBMIT_WORK
    );
    
    assert(
      'AUDIT_ACTIONS.OVERRIDE_TIMELINESS exists',
      AUDIT_ACTIONS.OVERRIDE_TIMELINESS === 'override_timeliness',
      'override_timeliness',
      AUDIT_ACTIONS.OVERRIDE_TIMELINESS
    );
  } catch (e) {
    console.log('  ❌ ERROR testing audit actions: ' + e.message);
    fail++;
  }
  
  console.log('');
  
  // ─── BACKWARD COMPAT ─────────────────────────────────────────────────────
  console.log('━━━ BACKWARD COMPAT (legacy paths still work) ━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    assert(
      'Legacy: created → in_progress (still valid)',
      isValidStatusTransition('created', 'in_progress') === true,
      true,
      isValidStatusTransition('created', 'in_progress')
    );
    
    assert(
      'WO_STATUS.CREATED still defined (backward compat)',
      WO_STATUS.CREATED === 'created',
      'created',
      WO_STATUS.CREATED
    );
    
    assert(
      'WO_STATUS.WAIT_MTBF still defined (backward compat)',
      WO_STATUS.WAIT_MTBF === 'wait_mtbf',
      'wait_mtbf',
      WO_STATUS.WAIT_MTBF
    );
  } catch (e) {
    console.log('  ❌ ERROR testing backward compat: ' + e.message);
    fail++;
  }
  
  // ─── SUMMARY ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  
  if (fail === 0) {
    console.log('║  🎉 ALL TESTS PASSED (' + pass + ' assertions)                              ║');
    console.log('║  Constants.gs siap untuk Workflow B                            ║');
  } else {
    console.log('║  ⚠️  RESULTS: ' + pass + ' passed, ' + fail + ' failed                              ║');
    console.log('║  Periksa output di atas untuk detail                           ║');
  }
  
  console.log('╚════════════════════════════════════════════════════════════════╝');
}