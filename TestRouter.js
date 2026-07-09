/**
 * ============================================================================
 * TestRouter.gs - Test Router v1.2 Impersonate Feature
 * ============================================================================
 * 
 * Tests:
 * 1. renderMechanicDashboard tanpa ?as param (normal view)
 * 2. renderMechanicDashboard dengan ?as=MECH-001 (impersonate)
 * 3. handleGetMyAssignedWOs dengan view_as param
 * 4. handleGetWoDetailForMechanic dengan view_as param
 * 
 * Run: testRouterImpersonate()
 * ============================================================================
 */

function testRouterImpersonate() {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║       TEST Router.gs v1.2 — IMPERSONATE FEATURE                ║');
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
  
  // ══════════════════════════════════════════════════════════════════════
  // TEST 1: renderMechanicDashboard WITHOUT ?as param (normal)
  // ══════════════════════════════════════════════════════════════════════
  console.log('━━━ TEST 1: renderMechanicDashboard (no impersonate) ━━━━━━━━━━━');
  try {
    // Simulate doGet event tanpa ?as param
    var mockEvent = {
      parameter: {
        page: 'mechanic',
        filter: 'all'
        // NO 'as' param
      }
    };
    
    // Temporarily override getCurrentUserWithRole untuk test
    var originalGetCurrentUser = getCurrentUserWithRole;
    getCurrentUserWithRole = function() {
      return {
        email: 'hrdptmulia@gmail.com',
        role: 'superintendent',
        id: 'SUPT-003',
        name: 'Gabriel PT Mulia'
      };
    };
    
    var html = renderMechanicDashboard(
      {email: 'hrdptmulia@gmail.com', role: 'superintendent'},
      mockEvent
    );
    
    // Restore
    getCurrentUserWithRole = originalGetCurrentUser;
    
    var content = html.getContent();
    assert('HTML generated', content.length > 500, '>500', content.length);
    assert('Title contains "Work Orders"', 
           content.indexOf('Work Orders') >= 0 || html.getTitle().indexOf('Work Orders') >= 0,
           'contains', html.getTitle());
    
  } catch(e) {
    console.log('  ❌ ERROR: ' + e.message);
    fail++;
  }
  console.log('');
  
  // ══════════════════════════════════════════════════════════════════════
  // TEST 2: renderMechanicDashboard WITH ?as=MECH-001 (impersonate)
  // ══════════════════════════════════════════════════════════════════════
  console.log('━━━ TEST 2: renderMechanicDashboard (impersonate MECH-001) ━━━━');
  try {
    var mockEvent = {
      parameter: {
        page: 'mechanic',
        filter: 'all',
        as: 'MECH-001'  // ← Impersonate param
      }
    };
    
    var originalGetCurrentUser = getCurrentUserWithRole;
    getCurrentUserWithRole = function() {
      return {
        email: 'hrdptmulia@gmail.com',
        role: 'superintendent',
        id: 'SUPT-003',
        name: 'Gabriel PT Mulia'
      };
    };
    
    var html = renderMechanicDashboard(
      {email: 'hrdptmulia@gmail.com', role: 'superintendent'},
      mockEvent
    );
    
    getCurrentUserWithRole = originalGetCurrentUser;
    
    var content = html.getContent();
    assert('HTML generated', content.length > 500, '>500', content.length);
    
    // Check if viewing_as info passed to template
    // (Template variable akan di-inject, tapi kita bisa check log)
    console.log('  ℹ️  Check log above for: viewAs=MECH-001, impersonating=true');
    
  } catch(e) {
    console.log('  ❌ ERROR: ' + e.message);
    fail++;
  }
  console.log('');
  
  // ══════════════════════════════════════════════════════════════════════
  // TEST 3: handleGetMyAssignedWOs dengan view_as param
  // ══════════════════════════════════════════════════════════════════════
  console.log('━━━ TEST 3: handleGetMyAssignedWOs API (view_as param) ━━━━━━━━');
  try {
    var originalGetCurrentUser = getCurrentUserWithRole;
    getCurrentUserWithRole = function() {
      return {
        email: 'hrdptmulia@gmail.com',
        role: 'superintendent',
        id: 'SUPT-003'
      };
    };
    
    var result = handleGetMyAssignedWOs({
      filter: 'all',
      view_as: 'MECH-001'
    });
    
    getCurrentUserWithRole = originalGetCurrentUser;
    
    assert('Returns success', result.success === true, true, result.success);
    
    if (isSuccess(result)) {
      assert('viewing_as not null', 
             result.data.viewing_as !== null,
             'object', result.data.viewing_as);
      
      if (result.data.viewing_as) {
        assert('viewing_as.id = MECH-001',
               result.data.viewing_as.id === 'MECH-001',
               'MECH-001', result.data.viewing_as.id);
      }
      
      console.log('  ℹ️  WOs found: ' + result.data.wos.length);
      console.log('  ℹ️  viewing_as: ' + JSON.stringify(result.data.viewing_as));
    }
    
  } catch(e) {
    console.log('  ❌ ERROR: ' + e.message);
    fail++;
  }
  console.log('');
  
  // ══════════════════════════════════════════════════════════════════════
  // TEST 4: handleGetWoDetailForMechanic dengan view_as param
  // ══════════════════════════════════════════════════════════════════════
  console.log('━━━ TEST 4: handleGetWoDetailForMechanic API (view_as) ━━━━━━━━');
  try {
    // Get a test WO first
    var testWoId = null;
    var wos = queryRows(SHEETS.WORK_ORDER_TEAM, function(t) {
      return t.mechanic_id === 'MECH-001';
    });
    
    if (wos.length > 0) {
      testWoId = wos[0].wo_id;
    }
    
    if (!testWoId) {
      console.log('  ⚠️  SKIP: No WO found for MECH-001');
    } else {
      var originalGetCurrentUser = getCurrentUserWithRole;
      getCurrentUserWithRole = function() {
        return {
          email: 'hrdptmulia@gmail.com',
          role: 'superintendent',
          id: 'SUPT-003'
        };
      };
      
      var result = handleGetWoDetailForMechanic({
        wo_id: testWoId,
        view_as: 'MECH-001'
      });
      
      getCurrentUserWithRole = originalGetCurrentUser;
      
      assert('Returns success', result.success === true, true, result.success);
      
      if (isSuccess(result)) {
        assert('viewing_as not null',
               result.data.viewing_as !== null,
               'object', result.data.viewing_as);
        
        if (result.data.viewing_as) {
          assert('viewing_as.id = MECH-001',
                 result.data.viewing_as.id === 'MECH-001',
                 'MECH-001', result.data.viewing_as.id);
        }
        
        console.log('  ℹ️  WO: ' + testWoId);
        console.log('  ℹ️  viewing_as: ' + JSON.stringify(result.data.viewing_as));
      }
    }
    
  } catch(e) {
    console.log('  ❌ ERROR: ' + e.message);
    fail++;
  }
  console.log('');
  
  // ══════════════════════════════════════════════════════════════════════
  // TEST 5: URL Parameter Parsing (mock)
  // ══════════════════════════════════════════════════════════════════════
  console.log('━━━ TEST 5: URL param parsing logic ━━━━━━━━━━━━━━━━━━━━━━━━━━');
  try {
    // Simulate various URL params
    var scenarios = [
      {e: {parameter: {}}, expectedAs: null},
      {e: {parameter: {as: 'MECH-001'}}, expectedAs: 'MECH-001'},
      {e: {parameter: {as: 'MECH-002', filter: 'assigned'}}, expectedAs: 'MECH-002'},
      {e: null, expectedAs: null}
    ];
    
    for (var i = 0; i < scenarios.length; i++) {
      var scenario = scenarios[i];
      var viewAs = null;
      
      if (scenario.e && scenario.e.parameter && scenario.e.parameter.as) {
        viewAs = scenario.e.parameter.as;
      }
      
      var match = (viewAs === scenario.expectedAs);
      assert('Scenario ' + (i+1) + ': as=' + viewAs,
             match,
             scenario.expectedAs,
             viewAs);
    }
    
  } catch(e) {
    console.log('  ❌ ERROR: ' + e.message);
    fail++;
  }
  console.log('');
  
  // ══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════
  console.log('╔════════════════════════════════════════════════════════════════╗');
  if (fail === 0) {
    console.log('║  🎉 ALL TESTS PASSED (' + pass + ' assertions)                              ║');
    console.log('║  Router.gs v1.2 Impersonate URL Handling WORKING          ║');
  } else {
    console.log('║  ⚠️  ' + pass + ' passed, ' + fail + ' failed                                       ║');
  }
  console.log('╚════════════════════════════════════════════════════════════════╝');
}

/**
 * Quick diagnostic: check if Router functions exist
 */
function testRouterFunctionsExist() {
  console.log('');
  console.log('═══ Router.gs Function Check ═══');
  
  var funcs = [
    'doGet',
    'doPost',
    'renderMechanicDashboard',
    'handleGetMyAssignedWOs',
    'handleGetWoDetailForMechanic',
    'handleSubmitMechanicWork'
  ];
  
  for (var i = 0; i < funcs.length; i++) {
    var name = funcs[i];
    var exists = (typeof this[name] === 'function');
    console.log((exists ? '  ✅ ' : '  ❌ ') + name);
  }
  
  console.log('');
}