/**
 * ============================================================================
 * TestRouterFase3.gs - Verify Router.gs setelah FASE 3 update
 * ============================================================================
 * 
 * Run: testRouterFase3()
 * 
 * Tests:
 *   1. Function existence: renderMechanicDashboard, 3 handlers, debug fn
 *   2. handleGetMyAssignedWOs works dengan filter
 *   3. handleGetWoDetailForMechanic works
 *   4. handleSubmitMechanicWork validation (missing fields)
 *   5. Existing functions still work (handleCreateWO, getWorkConditionOptionsForView)
 * 
 * READ-ONLY untuk Test 5 (validation). Test 2-3 cuma READ.
 * Tidak ada test yang menulis data baru.
 * ============================================================================
 */

function testRouterFase3() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TEST Router.gs — FASE 3 (Mechanic Dashboard)                  ║');
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
  
  // ─── TEST 1: Function existence ──────────────────────────────────────────
  console.log('━━━ TEST 1: NEW functions exist ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  assert('renderMechanicDashboard exists',
         typeof renderMechanicDashboard === 'function',
         'function', typeof renderMechanicDashboard);
  
  assert('handleGetMyAssignedWOs exists',
         typeof handleGetMyAssignedWOs === 'function',
         'function', typeof handleGetMyAssignedWOs);
  
  assert('handleGetWoDetailForMechanic exists',
         typeof handleGetWoDetailForMechanic === 'function',
         'function', typeof handleGetWoDetailForMechanic);
  
  assert('handleSubmitMechanicWork exists',
         typeof handleSubmitMechanicWork === 'function',
         'function', typeof handleSubmitMechanicWork);
  
  assert('debugMechanicDashboard exists',
         typeof debugMechanicDashboard === 'function',
         'function', typeof debugMechanicDashboard);
  
  console.log('');
  
  // ─── TEST 2: Existing functions still work ───────────────────────────────
  console.log('━━━ TEST 2: Existing functions intact ━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  
  assert('handleCreateWO exists',
         typeof handleCreateWO === 'function',
         'function', typeof handleCreateWO);
  
  assert('getWorkConditionOptionsForView exists',
         typeof getWorkConditionOptionsForView === 'function',
         'function', typeof getWorkConditionOptionsForView);
  
  assert('renderDashboard exists',
         typeof renderDashboard === 'function',
         'function', typeof renderDashboard);
  
  assert('renderCreateWO exists',
         typeof renderCreateWO === 'function',
         'function', typeof renderCreateWO);
  
  assert('doGet exists',
         typeof doGet === 'function',
         'function', typeof doGet);
  
  assert('doPost exists',
         typeof doPost === 'function',
         'function', typeof doPost);
  
  console.log('');
  
  // ─── TEST 3: handleGetMyAssignedWOs ──────────────────────────────────────
  console.log('━━━ TEST 3: handleGetMyAssignedWOs (READ-ONLY) ━━━━━━━━━━━━━━━━━');
  console.log('');
  
  try {
    var result = handleGetMyAssignedWOs({filter: 'all'});
    
    console.log('  Response success: ' + result.success);
    console.log('  WO count: ' + (result.data ? result.data.wos.length : 0));
    if (result.data && result.data.counts) {
      console.log('  Counts: ' + JSON.stringify(result.data.counts));
    }
    console.log('');
    
    assert('Returns success', result.success === true, true, result.success);
    assert('Has data.wos array', 
           result.data && Array.isArray(result.data.wos),
           'array', typeof (result.data && result.data.wos));
    assert('Has data.counts object',
           result.data && typeof result.data.counts === 'object',
           'object', typeof (result.data && result.data.counts));
  } catch (e) {
    console.log('  ❌ EXCEPTION: ' + e.message);
    fail++;
  }
  
  console.log('');
  
  // ─── TEST 4: handleGetMyAssignedWOs with filter ──────────────────────────
  console.log('━━━ TEST 4: handleGetMyAssignedWOs filter "assigned" ━━━━━━━━━━━');
  console.log('');
  
  try {
    var result = handleGetMyAssignedWOs({filter: 'assigned'});
    
    if (result.success && result.data) {
      console.log('  Found ' + result.data.wos.length + ' assigned WOs');
      console.log('  activeFilter: ' + result.data.activeFilter);
      
      assert('activeFilter = "assigned"',
             result.data.activeFilter === 'assigned',
             'assigned', result.data.activeFilter);
    } else {
      console.log('  Result: ' + JSON.stringify(result));
    }
    
    assert('Returns success', result.success === true, true, result.success);
  } catch (e) {
    console.log('  ❌ EXCEPTION: ' + e.message);
    fail++;
  }
  
  console.log('');
  
  // ─── TEST 5: handleSubmitMechanicWork validation ─────────────────────────
  console.log('━━━ TEST 5: handleSubmitMechanicWork validation (NO writes) ━━━━');
  console.log('');
  
  try {
    // Missing wo_id
    var result = handleSubmitMechanicWork({
      start_time: new Date(),
      end_time: new Date()
      // wo_id MISSING
    });
    
    assert('Missing wo_id returns error',
           result.success === false,
           false, result.success);
    
    if (result.error) {
      assert('Error mentions wo_id',
             result.error.message.toLowerCase().indexOf('wo_id') >= 0,
             'mentions wo_id', result.error.message);
    }
  } catch (e) {
    console.log('  ❌ EXCEPTION (should return error obj, not throw): ' + e.message);
    fail++;
  }
  
  try {
    // Missing start_time
    var result = handleSubmitMechanicWork({
      wo_id: 'WO-TEST-FAKE',
      end_time: new Date()
      // start_time MISSING
    });
    
    assert('Missing start_time returns error',
           result.success === false,
           false, result.success);
    
    if (result.error) {
      assert('Error mentions start_time',
             result.error.message.toLowerCase().indexOf('start') >= 0,
             'mentions start_time', result.error.message);
    }
  } catch (e) {
    console.log('  ❌ EXCEPTION: ' + e.message);
    fail++;
  }
  
  console.log('');
  
  // ─── TEST 6: handleGetWoDetailForMechanic ────────────────────────────────
  console.log('━━━ TEST 6: handleGetWoDetailForMechanic (READ-ONLY) ━━━━━━━━━━━');
  console.log('');
  
  try {
    // Test dengan missing wo_id
    var result = handleGetWoDetailForMechanic({});
    assert('Missing wo_id returns error',
           result.success === false,
           false, result.success);
  } catch (e) {
    console.log('  ❌ EXCEPTION: ' + e.message);
    fail++;
  }
  
  try {
    // Find any WO in sheet to test detail
    var anyWos = queryRows(SHEETS.WORK_ORDERS, function() { return true; });
    if (anyWos.length > 0) {
      var testWoId = anyWos[0].id;
      console.log('  Using test WO: ' + testWoId);
      
      var result = handleGetWoDetailForMechanic({wo_id: testWoId});
      
      assert('Returns success', result.success === true, true, result.success);
      
      if (result.success && result.data) {
        assert('Has wo object', !!result.data.wo, 'object', typeof result.data.wo);
        assert('Has team array', Array.isArray(result.data.team), 'array', typeof result.data.team);
      }
    } else {
      console.log('  ⚠️  No WOs in sheet, skipping detail test');
    }
  } catch (e) {
    console.log('  ❌ EXCEPTION: ' + e.message);
    fail++;
  }
  
  console.log('');
  
  // ─── TEST 7: getWorkConditionOptionsForView still works ──────────────────
  console.log('━━━ TEST 7: getWorkConditionOptionsForView (existing) ━━━━━━━━━━');
  console.log('');
  
  try {
    var options = getWorkConditionOptionsForView();
    assert('Returns array of 3', 
           Array.isArray(options) && options.length === 3,
           '3 options', options ? options.length : 'not array');
  } catch (e) {
    console.log('  ❌ EXCEPTION: ' + e.message);
    fail++;
  }
  
  console.log('');
  
  // ─── SUMMARY ─────────────────────────────────────────────────────────────
  console.log('╔════════════════════════════════════════════════════════════════╗');
  
  if (fail === 0) {
    console.log('║  🎉 ALL TESTS PASSED (' + pass + ' assertions)                              ║');
    console.log('║  Router.gs FASE 3 ready for frontend                           ║');
  } else {
    console.log('║  ⚠️  ' + pass + ' passed, ' + fail + ' failed                                       ║');
  }
  
  console.log('╚════════════════════════════════════════════════════════════════╝');
}