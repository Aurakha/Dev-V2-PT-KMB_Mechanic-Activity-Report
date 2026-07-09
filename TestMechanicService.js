/**
 * TestMechanicService.gs - Verify MechanicService v1.2 (impersonate)
 * Run: testMechanicService()
 */

function testMechanicService() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TEST MechanicService v1.2 — IMPERSONATE FEATURE               ║');
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
  
  // SETUP
  console.log('━━━ SETUP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  var testWoId = null;
  try {
    var pendingWos = queryRows(SHEETS.WORK_ORDERS, function(wo) {
      return wo.status === 'pending_mechanic_work';
    });
    if (pendingWos.length > 0) {
      testWoId = pendingWos[0].id;
      console.log('  Test WO: ' + testWoId);
    } else {
      console.log('  ⚠️  No pending_mechanic_work WOs — Test 7 di-skip');
    }
  } catch(e) { console.log('  Setup error: ' + e.message); }
  console.log('');
  
  // TEST 1: Superintendent self (no WOs)
  console.log('━━━ TEST 1: Superintendent self (no WOs) ━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    var r = getMyAssignedWOs('hrdptmulia@gmail.com', 'all');
    assert('Returns success', r.success === true, true, r.success);
    if (isSuccess(r)) {
      assert('wos = []', r.data.wos.length === 0, 0, r.data.wos.length);
      assert('activeFilter = all', r.data.activeFilter === 'all', 'all', r.data.activeFilter);
      assert('viewing_as = null', r.data.viewing_as === null, null, r.data.viewing_as);
    }
  } catch(e) { console.log('  ❌ ERROR: ' + e.message); fail++; }
  console.log('');
  
  // TEST 2: Impersonate MECH-001
  console.log('━━━ TEST 2: Impersonate MECH-001 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    var r = getMyAssignedWOs('hrdptmulia@gmail.com', 'all', 'MECH-001');
    console.log('  WOs found: ' + (isSuccess(r) ? r.data.wos.length : 'error'));
    console.log('  viewing_as: ' + JSON.stringify(isSuccess(r) ? r.data.viewing_as : null));
    assert('Returns success', r.success === true, true, r.success);
    if (isSuccess(r)) {
      assert('viewing_as not null', r.data.viewing_as !== null, 'object', r.data.viewing_as);
      assert('viewing_as.id = MECH-001',
             r.data.viewing_as && r.data.viewing_as.id === 'MECH-001',
             'MECH-001', r.data.viewing_as ? r.data.viewing_as.id : null);
      assert('mechanic.id = MECH-001',
             r.data.mechanic && r.data.mechanic.id === 'MECH-001',
             'MECH-001', r.data.mechanic ? r.data.mechanic.id : null);
    }
  } catch(e) { console.log('  ❌ ERROR: ' + e.message); fail++; }
  console.log('');
  
  // TEST 3: Impersonate invalid ID
  console.log('━━━ TEST 3: Impersonate invalid ID ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    var r = getMyAssignedWOs('hrdptmulia@gmail.com', 'all', 'MECH-999');
    assert('Returns error', r.success === false, false, r.success);
    if (!r.success) {
      console.log('  Error: ' + r.error.message);
      assert('Error mentions not found',
             r.error.message.toLowerCase().indexOf('not found') >= 0,
             'mentions not found', r.error.message);
    }
  } catch(e) { console.log('  ❌ ERROR: ' + e.message); fail++; }
  console.log('');
  
  // TEST 4: Filter "assigned" dengan impersonate
  console.log('━━━ TEST 4: Filter assigned + impersonate ━━━━━━━━━━━━━━━━━━━━━━');
  try {
    var r = getMyAssignedWOs('hrdptmulia@gmail.com', 'assigned', 'MECH-001');
    assert('Returns success', r.success === true, true, r.success);
    if (isSuccess(r)) {
      assert('activeFilter = assigned', r.data.activeFilter === 'assigned', 'assigned', r.data.activeFilter);
      assert('viewing_as ada', r.data.viewing_as !== null, 'object', r.data.viewing_as);
      var allOk = true;
      for (var i = 0; i < r.data.wos.length; i++) {
        if (r.data.wos[i].status_group !== 'assigned') { allOk = false; break; }
      }
      assert('Semua WO = assigned group', allOk, true, allOk);
    }
  } catch(e) { console.log('  ❌ ERROR: ' + e.message); fail++; }
  console.log('');
  
  // TEST 5: Mechanic biasa tidak boleh impersonate
  console.log('━━━ TEST 5: Mechanic biasa dilarang impersonate ━━━━━━━━━━━━━━━━');
  try {
    var r = getMyAssignedWOs('ahmad.fauzi@company.com', 'all', 'MECH-002');
    assert('Returns error (permission denied)', r.success === false, false, r.success);
    if (!r.success) {
      console.log('  Error: ' + r.error.message);
      assert('Error mentions supervisor/only',
             r.error.message.toLowerCase().indexOf('supervisor') >= 0 ||
             r.error.message.toLowerCase().indexOf('only') >= 0,
             'mentions supervisor', r.error.message);
    }
  } catch(e) { console.log('  ❌ ERROR: ' + e.message); fail++; }
  console.log('');
  
  // TEST 6: getWoDetailForMechanic + impersonate
  if (testWoId) {
    console.log('━━━ TEST 6: getWoDetailForMechanic + impersonate ━━━━━━━━━━━━━━');
    try {
      var team = queryRows(SHEETS.WORK_ORDER_TEAM, function(t) { return t.wo_id === testWoId; });
      if (team.length > 0) {
        var firstMechId = team[0].mechanic_id;
        var r = getWoDetailForMechanic(testWoId, 'hrdptmulia@gmail.com', firstMechId);
        assert('Returns success', r.success === true, true, r.success);
        if (isSuccess(r)) {
          assert('viewing_as ada', r.data.viewing_as !== null, 'object', r.data.viewing_as);
          assert('viewing_as.id correct',
                 r.data.viewing_as && r.data.viewing_as.id === firstMechId,
                 firstMechId, r.data.viewing_as ? r.data.viewing_as.id : null);
          var meFound = false;
          for (var j = 0; j < r.data.team.length; j++) { if (r.data.team[j].is_me) meFound = true; }
          assert('is_me flag benar untuk target', meFound, true, meFound);
        }
      } else {
        console.log('  ⚠️  No team for test WO, skip');
      }
    } catch(e) { console.log('  ❌ ERROR: ' + e.message); fail++; }
    console.log('');
  }
  
  // TEST 7: submitMechanicWork — superintendent on-behalf
  if (testWoId) {
    console.log('━━━ TEST 7: submitMechanicWork (superintendent on-behalf) ━━━━━');
    try {
      var startTime = new Date('2026-05-25T06:00:00Z');
      var endTime   = new Date('2026-05-25T10:00:00Z'); // 4 hours
      var r = submitMechanicWork(testWoId, startTime, endTime, 'hrdptmulia@gmail.com');
      console.log('  success: ' + r.success);
      if (r.data) {
        console.log('  actual_hours: ' + r.data.actual_hours);
        console.log('  new_status: ' + r.data.new_status);
        console.log('  timeliness: ' + (r.data.timeliness ? r.data.timeliness.status : 'N/A'));
      }
      if (!r.success && r.error) console.log('  Error: ' + r.error.message);
      assert('Returns success', r.success === true, true, r.success);
      if (isSuccess(r)) {
        assert('actual_hours = 4', r.data.actual_hours === 4, 4, r.data.actual_hours);
        assert('new_status = pending_supervisor',
               r.data.new_status === 'pending_supervisor', 'pending_supervisor', r.data.new_status);
      }
    } catch(e) { console.log('  ❌ ERROR: ' + e.message); fail++; }
    console.log('');
  } else {
    console.log('━━━ TEST 7: SKIPPED (no pending WO) ━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
  }
  
  // TEST 8: viewing_as = null kalau tidak impersonate
  console.log('━━━ TEST 8: viewing_as=null tanpa impersonate ━━━━━━━━━━━━━━━━━━');
  try {
    var r = getMyAssignedWOs('ahmad.fauzi@company.com', 'all');
    assert('Returns success', r.success === true, true, r.success);
    if (isSuccess(r)) {
      assert('viewing_as = null', r.data.viewing_as === null, null, r.data.viewing_as);
    }
  } catch(e) { console.log('  ❌ ERROR: ' + e.message); fail++; }
  console.log('');
  
  // SUMMARY
  console.log('╔════════════════════════════════════════════════════════════════╗');
  if (fail === 0) {
    console.log('║  🎉 ALL TESTS PASSED (' + pass + ' assertions)                              ║');
    console.log('║  MechanicService v1.2 Impersonate Feature WORKING              ║');
  } else {
    console.log('║  ⚠️  ' + pass + ' passed, ' + fail + ' failed                                       ║');
  }
  console.log('╚════════════════════════════════════════════════════════════════╝');
}