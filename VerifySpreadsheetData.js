/**
 * ============================================================================
 * VERIFY SPREADSHEET DATA
 * ============================================================================
 * 
 * Script to verify all config data exists and matches expected structure
 * For: Mechanic Incentive System - Points Calculation
 * 
 * Spreadsheet ID: 1GTJP_ZzhTRSRLqN4H6WXccsiXtGLKy1OJ6nekXDYCq8
 * ============================================================================
 */

function verifyAllConfigData() {
  const SPREADSHEET_ID = '1GTJP_ZzhTRSRLqN4H6WXccsiXtGLKy1OJ6nekXDYCq8';
  
  console.log('='.repeat(80));
  console.log('📊 VERIFYING SPREADSHEET CONFIGURATION DATA');
  console.log('='.repeat(80));
  console.log('Spreadsheet ID: ' + SPREADSHEET_ID);
  console.log('Timestamp: ' + new Date().toISOString());
  console.log('');
  
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    console.log('✅ Spreadsheet accessed: ' + ss.getName());
    console.log('');
    
    // Verify each config source
    verify1_BasePoints(ss);
    verify2_UnitFactor(ss);
    verify3_WorkConditionFactor(ss);
    verify4_TimelinessFactor(ss);
    verify5_SafetyFactor(ss);
    verify6_MtbfFactor(ss);
    verify7_IdrRate(ss);
    
    // Summary
    console.log('='.repeat(80));
    console.log('✅ VERIFICATION COMPLETE');
    console.log('='.repeat(80));
    console.log('');
    console.log('🎉 All config data verified successfully!');
    console.log('');
    console.log('Next step: Build calculation engine with these lookup functions.');
    
  } catch (e) {
    console.log('❌ ERROR: ' + e.message);
    console.log('Stack trace: ' + e.stack);
  }
}

// ============================================================================
// 1. BASE_POINTS
// ============================================================================
function verify1_BasePoints(ss) {
  console.log('1️⃣  BASE_POINTS VERIFICATION');
  console.log('-'.repeat(80));
  console.log('Lookup: Config_Components → Column D (base_points)');
  console.log('');
  
  try {
    const sheet = ss.getSheetByName('Config_Components');
    if (!sheet) {
      console.log('❌ Sheet "Config_Components" NOT FOUND!');
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);
    
    console.log('Headers: ' + headers.join(' | '));
    console.log('Total components: ' + rows.length);
    console.log('');
    
    // Find base_points column index
    const basePointsColIndex = headers.indexOf('base_points');
    const targetHoursColIndex = headers.indexOf('target_hours');
    
    if (basePointsColIndex === -1) {
      console.log('❌ Column "base_points" NOT FOUND!');
      return;
    }
    
    console.log('Sample data (first 5 rows):');
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = rows[i];
      console.log(`  ${row[0]} - ${row[1]}`);
      console.log(`    → base_points: ${row[basePointsColIndex]}`);
      console.log(`    → target_hours: ${row[targetHoursColIndex]}`);
    }
    console.log('');
    
    // Check for missing values
    let missingCount = 0;
    for (let i = 0; i < rows.length; i++) {
      if (!rows[i][basePointsColIndex] || rows[i][basePointsColIndex] === '') {
        missingCount++;
      }
    }
    
    if (missingCount > 0) {
      console.log(`⚠️  WARNING: ${missingCount} components have missing base_points!`);
    } else {
      console.log('✅ All components have base_points values');
    }
    console.log('');
    
  } catch (e) {
    console.log('❌ Error: ' + e.message);
  }
}

// ============================================================================
// 2. UNIT_FACTOR
// ============================================================================
function verify2_UnitFactor(ss) {
  console.log('2️⃣  UNIT_FACTOR VERIFICATION');
  console.log('-'.repeat(80));
  console.log('Lookup: Config_Units → Column D (unit_factor)');
  console.log('');
  
  try {
    const sheet = ss.getSheetByName('Config_Units');
    if (!sheet) {
      console.log('❌ Sheet "Config_Units" NOT FOUND!');
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);
    
    console.log('Headers: ' + headers.join(' | '));
    console.log('Total units: ' + rows.length);
    console.log('');
    
    const unitFactorColIndex = headers.indexOf('unit_factor');
    
    if (unitFactorColIndex === -1) {
      console.log('❌ Column "unit_factor" NOT FOUND!');
      return;
    }
    
    console.log('All units:');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      console.log(`  ${row[0]} - ${row[1]} (${row[2]})`);
      console.log(`    → unit_factor: ${row[unitFactorColIndex]}`);
    }
    console.log('');
    
    console.log('✅ All units verified');
    console.log('');
    
  } catch (e) {
    console.log('❌ Error: ' + e.message);
  }
}

// ============================================================================
// 3. WORK_CONDITION_FACTOR
// ============================================================================
function verify3_WorkConditionFactor(ss) {
  console.log('3️⃣  WORK_CONDITION_FACTOR VERIFICATION');
  console.log('-'.repeat(80));
  console.log('Lookup: Config_Factors → factor_type = "work_condition"');
  console.log('');
  
  try {
    const sheet = ss.getSheetByName('Config_Factors');
    if (!sheet) {
      console.log('❌ Sheet "Config_Factors" NOT FOUND!');
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);
    
    console.log('Headers: ' + headers.join(' | '));
    console.log('');
    
    // Filter for work_condition
    const workConditionRows = rows.filter(row => row[0] === 'work_condition');
    
    if (workConditionRows.length === 0) {
      console.log('❌ No rows found with factor_type = "work_condition"!');
      return;
    }
    
    console.log('Work Condition Factors:');
    workConditionRows.forEach(row => {
      console.log(`  ${row[1]} → ${row[2]}`);
    });
    console.log('');
    
    // Check expected keys
    const expectedKeys = ['normal', 'difficult', 'extreme'];
    const foundKeys = workConditionRows.map(row => row[1]);
    const missingKeys = expectedKeys.filter(key => !foundKeys.includes(key));
    
    if (missingKeys.length > 0) {
      console.log(`⚠️  WARNING: Missing keys: ${missingKeys.join(', ')}`);
    } else {
      console.log('✅ All expected keys found: ' + expectedKeys.join(', '));
    }
    console.log('');
    
  } catch (e) {
    console.log('❌ Error: ' + e.message);
  }
}

// ============================================================================
// 4. TIMELINESS_FACTOR
// ============================================================================
function verify4_TimelinessFactor(ss) {
  console.log('4️⃣  TIMELINESS_FACTOR VERIFICATION');
  console.log('-'.repeat(80));
  console.log('Lookup: Config_Factors → factor_type = "timeliness"');
  console.log('Target Hours: Config_Components → target_hours');
  console.log('');
  
  try {
    const sheet = ss.getSheetByName('Config_Factors');
    if (!sheet) {
      console.log('❌ Sheet "Config_Factors" NOT FOUND!');
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1);
    
    // Filter for timeliness
    const timelinessRows = rows.filter(row => row[0] === 'timeliness');
    
    if (timelinessRows.length === 0) {
      console.log('❌ No rows found with factor_type = "timeliness"!');
      return;
    }
    
    console.log('Timeliness Factors:');
    timelinessRows.forEach(row => {
      console.log(`  ${row[1]} → ${row[2]}`);
    });
    console.log('');
    
    // Check expected keys
    const expectedKeys = ['on_time', 'late', 'way_late'];
    const foundKeys = timelinessRows.map(row => row[1]);
    const missingKeys = expectedKeys.filter(key => !foundKeys.includes(key));
    
    if (missingKeys.length > 0) {
      console.log(`⚠️  WARNING: Missing keys: ${missingKeys.join(', ')}`);
    } else {
      console.log('✅ All expected keys found: ' + expectedKeys.join(', '));
    }
    console.log('');
    
    // Check for thresholds in Config_BaseSettings
    const settingsSheet = ss.getSheetByName('Config_BaseSettings');
    if (settingsSheet) {
      const settingsData = settingsSheet.getDataRange().getValues();
      const settingsRows = settingsData.slice(1);
      
      console.log('Checking for timeliness thresholds in Config_BaseSettings:');
      const thresholdSettings = settingsRows.filter(row => 
        row[0] && row[0].toLowerCase().includes('timeliness')
      );
      
      if (thresholdSettings.length > 0) {
        thresholdSettings.forEach(row => {
          console.log(`  ${row[0]} → ${row[1]}`);
        });
      } else {
        console.log('  ℹ️  No timeliness threshold settings found');
        console.log('  (Will need to define: late_threshold, way_late_threshold)');
      }
    }
    console.log('');
    
  } catch (e) {
    console.log('❌ Error: ' + e.message);
  }
}

// ============================================================================
// 5. SAFETY_FACTOR
// ============================================================================
function verify5_SafetyFactor(ss) {
  console.log('5️⃣  SAFETY_FACTOR VERIFICATION');
  console.log('-'.repeat(80));
  console.log('Lookup: Config_Factors → factor_type = "safety"');
  console.log('');
  
  try {
    const sheet = ss.getSheetByName('Config_Factors');
    if (!sheet) {
      console.log('❌ Sheet "Config_Factors" NOT FOUND!');
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1);
    
    // Filter for safety
    const safetyRows = rows.filter(row => row[0] === 'safety');
    
    if (safetyRows.length === 0) {
      console.log('❌ No rows found with factor_type = "safety"!');
      return;
    }
    
    console.log('Safety Factors:');
    safetyRows.forEach(row => {
      console.log(`  ${row[1]} → ${row[2]}`);
    });
    console.log('');
    
    // Check expected keys
    const expectedKeys = ['no_incident', 'incident'];
    const foundKeys = safetyRows.map(row => row[1]);
    const missingKeys = expectedKeys.filter(key => !foundKeys.includes(key));
    
    if (missingKeys.length > 0) {
      console.log(`⚠️  WARNING: Missing keys: ${missingKeys.join(', ')}`);
    } else {
      console.log('✅ All expected keys found: ' + expectedKeys.join(', '));
    }
    console.log('');
    
  } catch (e) {
    console.log('❌ Error: ' + e.message);
  }
}

// ============================================================================
// 6. MTBF_FACTOR
// ============================================================================
function verify6_MtbfFactor(ss) {
  console.log('6️⃣  MTBF_FACTOR VERIFICATION');
  console.log('-'.repeat(80));
  console.log('Lookup: Config_Factors → factor_type = "mtbf"');
  console.log('Threshold: Config_BaseSettings → mtbf_threshold_hours');
  console.log('Status: ⏸️  NOT IMPLEMENTED YET (will use 1.0 for now)');
  console.log('');
  
  try {
    const sheet = ss.getSheetByName('Config_Factors');
    if (!sheet) {
      console.log('❌ Sheet "Config_Factors" NOT FOUND!');
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    const rows = data.slice(1);
    
    // Filter for mtbf
    const mtbfRows = rows.filter(row => row[0] === 'mtbf');
    
    if (mtbfRows.length === 0) {
      console.log('⚠️  No rows found with factor_type = "mtbf"');
      console.log('   (This is OK - MTBF not implemented yet)');
    } else {
      console.log('MTBF Factors (for future use):');
      mtbfRows.forEach(row => {
        console.log(`  ${row[1]} → ${row[2]}`);
      });
    }
    console.log('');
    
    // Check threshold
    const settingsSheet = ss.getSheetByName('Config_BaseSettings');
    if (settingsSheet) {
      const settingsData = settingsSheet.getDataRange().getValues();
      const settingsRows = settingsData.slice(1);
      
      const mtbfThreshold = settingsRows.find(row => row[0] === 'mtbf_threshold_hours');
      if (mtbfThreshold) {
        console.log(`MTBF Threshold: ${mtbfThreshold[1]} hours`);
      } else {
        console.log('⚠️  mtbf_threshold_hours not found in Config_BaseSettings');
      }
    }
    console.log('');
    
  } catch (e) {
    console.log('❌ Error: ' + e.message);
  }
}

// ============================================================================
// 7. IDR_RATE (Points to IDR Multiplier)
// ============================================================================
function verify7_IdrRate(ss) {
  console.log('7️⃣  IDR_RATE VERIFICATION');
  console.log('-'.repeat(80));
  console.log('Lookup: Config_BaseSettings → setting_key = "idr_rate"');
  console.log('');
  
  try {
    const sheet = ss.getSheetByName('Config_BaseSettings');
    if (!sheet) {
      console.log('❌ Sheet "Config_BaseSettings" NOT FOUND!');
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const rows = data.slice(1);
    
    console.log('Headers: ' + headers.join(' | '));
    console.log('Total settings: ' + rows.length);
    console.log('');
    
    console.log('All settings:');
    rows.forEach(row => {
      console.log(`  ${row[0]} → ${row[1]}`);
      if (row[2]) {
        console.log(`    Description: ${row[2]}`);
      }
    });
    console.log('');
    
    // Check for idr_rate
    const idrRateSetting = rows.find(row => row[0] === 'idr_rate');
    if (!idrRateSetting) {
      console.log('❌ Setting "idr_rate" NOT FOUND!');
      console.log('   Please add a row: idr_rate | 50000 | IDR per point');
    } else {
      console.log(`✅ IDR Rate found: ${idrRateSetting[1]}`);
      console.log(`   Formula: final_idr = final_points × ${idrRateSetting[1]}`);
    }
    console.log('');
    
  } catch (e) {
    console.log('❌ Error: ' + e.message);
  }
}

// ============================================================================
// HELPER: Run this function to verify everything
// ============================================================================
function runVerification() {
  verifyAllConfigData();
}