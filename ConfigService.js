/**
 * ============================================================================
 * ConfigService.gs - Configuration Data Service
 * ============================================================================
 * 
 * Production-grade config loader dengan:
 * - Real-time reads (no cache per requirement)
 * - Type coercion (string → number untuk factors/settings)
 * - Default fallback values
 * - Comprehensive validation
 * - Schema verification
 * 
 * Dependencies: Constants.gs, Logger.gs, Sheets.gs, Utils.gs
 * ============================================================================
 */

// ============================================================================
// MAIN CONFIG LOADER
// ============================================================================

/**
 * Get all config data sebagai structured object
 * @return {Object} Complete config
 */
function getConfig() {
  var timer = Log.startTimer('getConfig');
  
  try {
    var config = {
      components: loadComponents(),
      units: loadUnits(),
      mechanics: loadMechanics(),
      factors: loadFactors(),
      settings: loadSettings()
    };
    
    timer.end('Config loaded', {
      components: config.components.length,
      units: config.units.length,
      mechanics: config.mechanics.length
    });
    
    return config;
  } catch (e) {
    Log.exception('getConfig', e);
    return {
      components: [],
      units: [],
      mechanics: [],
      factors: getDefaultFactors(),
      settings: getDefaultSettings()
    };
  }
}

// ============================================================================
// COMPONENTS
// ============================================================================

function loadComponents() {
  try {
    var components = readSheetAsObjects(SHEETS.CONFIG_COMPONENTS);
    
    // Normalize: convert numeric strings to numbers
    for (var i = 0; i < components.length; i++) {
      var comp = components[i];
      if (comp.base_points !== null) comp.base_points = parseFloat(comp.base_points) || 0;
      if (comp.target_hours !== null) comp.target_hours = parseFloat(comp.target_hours) || 0;
      if (comp.default_team_size !== null) comp.default_team_size = parseInt(comp.default_team_size) || 1;
    }
    
    return components;
  } catch (e) {
    Log.exception('loadComponents', e);
    return [];
  }
}

function getComponentById(componentId) {
  if (!componentId) return null;
  
  try {
    var comp = getRowById(SHEETS.CONFIG_COMPONENTS, componentId, 'component_no');
    
    if (!comp) return null;
    
    // Type coercion
    if (comp.base_points !== null) comp.base_points = parseFloat(comp.base_points) || 0;
    if (comp.target_hours !== null) comp.target_hours = parseFloat(comp.target_hours) || 0;
    if (comp.default_team_size !== null) comp.default_team_size = parseInt(comp.default_team_size) || 1;
    
    return comp;
  } catch (e) {
    Log.exception('getComponentById', e, {componentId: componentId});
    return null;
  }
}

function searchComponents(searchTerm) {
  if (!searchTerm || typeof searchTerm !== 'string') return [];
  
  try {
    var term = searchTerm.toLowerCase().trim();
    if (term.length === 0) return [];
    
    return queryRows(SHEETS.CONFIG_COMPONENTS, function(comp) {
      var name = (comp.component_name || '').toString().toLowerCase();
      return name.indexOf(term) !== -1;
    });
  } catch (e) {
    Log.exception('searchComponents', e);
    return [];
  }
}

function getActiveComponents() {
  try {
    return queryRows(SHEETS.CONFIG_COMPONENTS, function(comp) {
      return comp.notes === 'Active' || comp.is_active === true;
    });
  } catch (e) {
    Log.exception('getActiveComponents', e);
    return [];
  }
}

function componentExists(componentId) {
  return getComponentById(componentId) !== null;
}

// ============================================================================
// UNITS
// ============================================================================

function loadUnits() {
  try {
    var units = readSheetAsObjects(SHEETS.CONFIG_UNITS);
    
    // Type coercion for unit_factor
    for (var i = 0; i < units.length; i++) {
      if (units[i].unit_factor !== null) {
        units[i].unit_factor = parseFloat(units[i].unit_factor) || DEFAULTS.UNIT_FACTOR;
      }
    }
    
    return units;
  } catch (e) {
    Log.exception('loadUnits', e);
    return [];
  }
}

function getUnitById(unitId) {
  if (!unitId) return null;
  
  try {
    var unit = getRowById(SHEETS.CONFIG_UNITS, unitId, 'unit_id');
    
    if (!unit) return null;
    
    if (unit.unit_factor !== null) {
      unit.unit_factor = parseFloat(unit.unit_factor) || DEFAULTS.UNIT_FACTOR;
    }
    
    return unit;
  } catch (e) {
    Log.exception('getUnitById', e, {unitId: unitId});
    return null;
  }
}

function getUnitFactor(unitId) {
  var unit = getUnitById(unitId);
  
  if (!unit || typeof unit.unit_factor !== 'number') {
    Log.warn('getUnitFactor', 'Using default', {unitId: unitId});
    return DEFAULTS.UNIT_FACTOR;
  }
  
  return unit.unit_factor;
}

function unitExists(unitId) {
  return getUnitById(unitId) !== null;
}

// ============================================================================
// MECHANICS
// ============================================================================

function loadMechanics() {
  try {
    return readSheetAsObjects(SHEETS.CONFIG_MECHANICS);
  } catch (e) {
    Log.exception('loadMechanics', e);
    return [];
  }
}

function getMechanicById(mechanicId) {
  if (!mechanicId) return null;
  
  try {
    return getRowById(SHEETS.CONFIG_MECHANICS, mechanicId, 'mechanic_id');
  } catch (e) {
    Log.exception('getMechanicById', e, {mechanicId: mechanicId});
    return null;
  }
}

function getMechanicByEmail(email) {
  if (!email || typeof email !== 'string') return null;
  
  try {
    var emailLower = email.toLowerCase().trim();
    
    var mechanics = loadMechanics();
    for (var i = 0; i < mechanics.length; i++) {
      var mEmail = mechanics[i].email;
      if (mEmail && typeof mEmail === 'string' && mEmail.toLowerCase().trim() === emailLower) {
        return mechanics[i];
      }
    }
    
    return null;
  } catch (e) {
    Log.exception('getMechanicByEmail', e, {email: email});
    return null;
  }
}

function getMechanicsByRole(role) {
  if (!role || typeof role !== 'string') return [];
  
  try {
    var roleLower = role.toLowerCase();
    
    return queryRows(SHEETS.CONFIG_MECHANICS, function(m) {
      var mRole = m.role;
      return mRole && typeof mRole === 'string' && mRole.toLowerCase() === roleLower;
    });
  } catch (e) {
    Log.exception('getMechanicsByRole', e);
    return [];
  }
}

function getActiveMechanics() {
  try {
    return queryRows(SHEETS.CONFIG_MECHANICS, function(m) {
      return m.is_active === true || m.is_active === 'TRUE';
    });
  } catch (e) {
    Log.exception('getActiveMechanics', e);
    return [];
  }
}

function mechanicExists(mechanicId) {
  return getMechanicById(mechanicId) !== null;
}

// ============================================================================
// FACTORS
// ============================================================================

function loadFactors() {
  try {
    var factorsData = readSheetAsObjects(SHEETS.CONFIG_FACTORS);
    
    var factors = {
      work_condition: {},
      timeliness: {},
      safety: {},
      mtbf: {}
    };
    
    for (var i = 0; i < factorsData.length; i++) {
      var row = factorsData[i];
      var type = row.factor_type;
      var key = row.factor_key;
      var value = parseFloat(row.factor_value);
      
      if (factors[type] && key && !isNaN(value)) {
        factors[type][key] = value;
      }
    }
    
    // Merge dengan defaults untuk fields yang missing
    var defaults = getDefaultFactors();
    for (var factorType in defaults) {
      if (!factors[factorType]) factors[factorType] = {};
      for (var factorKey in defaults[factorType]) {
        if (factors[factorType][factorKey] === undefined) {
          factors[factorType][factorKey] = defaults[factorType][factorKey];
        }
      }
    }
    
    return factors;
  } catch (e) {
    Log.exception('loadFactors', e);
    return getDefaultFactors();
  }
}

function getDefaultFactors() {
  return {
    work_condition: {normal: 1.0, difficult: 1.1, extreme: 1.2},
    timeliness: {on_time: 1.0, late: 0.8, way_late: 0.5},
    safety: {no_incident: 1.0, incident: 0.0},
    mtbf: {redo: 0.8, first_time: 1.2}
  };
}

function getFactor(factorType, factorKey) {
  if (!factorType || !factorKey) return 1.0;
  
  try {
    var factors = loadFactors();
    
    if (!factors[factorType]) {
      Log.warn('getFactor', 'Type not found', {type: factorType});
      return 1.0;
    }
    
    var value = factors[factorType][factorKey];
    
    if (value === undefined || value === null) {
      Log.warn('getFactor', 'Key not found', {type: factorType, key: factorKey});
      return 1.0;
    }
    
    return value;
  } catch (e) {
    Log.exception('getFactor', e);
    return 1.0;
  }
}

function getWorkConditionFactor(condition) {
  return getFactor(FACTOR_TYPES.WORK_CONDITION, condition);
}

function getTimelinessFactor(actualHours, targetHours) {
  if (!targetHours || targetHours === 0) {
    Log.warn('getTimelinessFactor', 'Target hours is 0');
    return {factor: 1.0, status: 'on_time', ratio: 0};
  }
  
  if (typeof actualHours !== 'number' || isNaN(actualHours)) {
    return {factor: 1.0, status: 'on_time', ratio: 0};
  }
  
  var ratio = (actualHours / targetHours) * 100;
  var status, factor;
  
  if (ratio <= TIMELINESS_THRESHOLDS.ON_TIME_MAX) {
    status = TIMELINESS_KEYS.ON_TIME;
    factor = getFactor(FACTOR_TYPES.TIMELINESS, TIMELINESS_KEYS.ON_TIME);
  } else if (ratio <= TIMELINESS_THRESHOLDS.LATE_MAX) {
    status = TIMELINESS_KEYS.LATE;
    factor = getFactor(FACTOR_TYPES.TIMELINESS, TIMELINESS_KEYS.LATE);
  } else {
    status = TIMELINESS_KEYS.WAY_LATE;
    factor = getFactor(FACTOR_TYPES.TIMELINESS, TIMELINESS_KEYS.WAY_LATE);
  }
  
  return {
    factor: factor,
    status: status,
    ratio: roundTo(ratio, 2)
  };
}

function getSafetyFactor(hasSafetyIncident) {
  if (hasSafetyIncident === true) {
    return getFactor(FACTOR_TYPES.SAFETY, SAFETY_KEYS.INCIDENT);
  }
  return getFactor(FACTOR_TYPES.SAFETY, SAFETY_KEYS.NO_INCIDENT);
}

function getMtbfFactorByStatus(isRedo) {
  if (isRedo === true) {
    return getFactor(FACTOR_TYPES.MTBF, MTBF_KEYS.REDO);
  }
  return getFactor(FACTOR_TYPES.MTBF, MTBF_KEYS.FIRST_TIME);
}

// ============================================================================
// SETTINGS
// ============================================================================

function loadSettings() {
  try {
    var settingsData = readSheetAsObjects(SHEETS.CONFIG_BASE_SETTINGS);
    var settings = {};
    
    for (var i = 0; i < settingsData.length; i++) {
      var key = settingsData[i].setting_key;
      var value = settingsData[i].setting_value;
      
      if (!key) continue;
      
      // Try to parse numeric values
      if (typeof value === 'string' && !isNaN(value) && value.trim() !== '') {
        value = parseFloat(value);
      }
      
      settings[key] = value;
    }
    
    // Merge dengan defaults
    var defaults = getDefaultSettings();
    for (var dKey in defaults) {
      if (settings[dKey] === undefined || settings[dKey] === null) {
        settings[dKey] = defaults[dKey];
      }
    }
    
    return settings;
  } catch (e) {
    Log.exception('loadSettings', e);
    return getDefaultSettings();
  }
}

function getDefaultSettings() {
  return {
    mtbf_threshold_hours: DEFAULTS.MTBF_THRESHOLD_HOURS,
    idr_rate: DEFAULTS.IDR_RATE,
    points_to_idr_multiplier: DEFAULTS.POINTS_TO_IDR_MULTIPLIER,
    base_points_multiplier: DEFAULTS.BASE_POINTS_MULTIPLIER,
    on_time_days_buffer: DEFAULTS.ON_TIME_DAYS_BUFFER,
    safety_incident_penalty: DEFAULTS.SAFETY_INCIDENT_PENALTY
  };
}

function getSetting(settingKey) {
  if (!settingKey) return null;
  
  try {
    var settings = loadSettings();
    return settings.hasOwnProperty(settingKey) ? settings[settingKey] : null;
  } catch (e) {
    return null;
  }
}

function getMtbfThresholdHours() {
  var value = getSetting('mtbf_threshold_hours');
  return (typeof value === 'number' && value > 0) ? value : DEFAULTS.MTBF_THRESHOLD_HOURS;
}

function getIdrRate() {
  var value = getSetting('idr_rate');
  return (typeof value === 'number' && value > 0) ? value : DEFAULTS.IDR_RATE;
}

function getPointsToIdrMultiplier() {
  var value = getSetting('points_to_idr_multiplier');
  return (typeof value === 'number' && value > 0) ? value : DEFAULTS.POINTS_TO_IDR_MULTIPLIER;
}

function getRateForMechanic(mechanicId) {
  try {
    var defaultRate = getPointsToIdrMultiplier();
    if (!mechanicId) return defaultRate;
    var mech = getMechanicById(mechanicId);
    if (!mech || !mech.position) return defaultRate;
    var position = String(mech.position).toLowerCase().trim();
    if (!position) return defaultRate;
    var rate = getSetting('rate_' + position);
    return (typeof rate === 'number' && rate > 0) ? rate : defaultRate;
  } catch (e) {
    Log.exception('getRateForMechanic', e, {mechanicId: mechanicId});
    return getPointsToIdrMultiplier();
  }
}

// ============================================================================
// CONFIG SUMMARY
// ============================================================================

function getConfigSummary() {
  try {
    var config = getConfig();
    
    return {
      components_count: config.components.length,
      units_count: config.units.length,
      mechanics_count: config.mechanics.length,
      mechanics_by_role: {
        mechanic: getMechanicsByRole(ROLES.MECHANIC).length,
        supervisor: getMechanicsByRole(ROLES.SUPERVISOR).length,
        superintendent: getMechanicsByRole(ROLES.SUPERINTENDENT).length
      },
      factors: config.factors,
      settings: config.settings
    };
  } catch (e) {
    Log.exception('getConfigSummary', e);
    return null;
  }
}

// ============================================================================
// TESTING
// ============================================================================

function testConfigService() {
  Log.separator('Testing ConfigService.gs');
  
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
  
  // Components
  Log.section('Components');
  tryTest('loadComponents', function() {
    var components = loadComponents();
    assert(components.length === 94, 'Loaded 94 components');
    assert(typeof components[0].base_points === 'number', 'base_points is number');
  });
  
  tryTest('getComponentById', function() {
    var comp = getComponentById('COM-001');
    assert(comp !== null && comp.component_name === 'Intercooler', 'Got Intercooler');
    assert(getComponentById('NONEXISTENT') === null, 'Non-existent returns null');
  });
  
  tryTest('searchComponents', function() {
    var results = searchComponents('Engine');
    assert(results.length > 0, 'Search returns results');
  });
  
  // Units
  Log.section('Units');
  tryTest('loadUnits', function() {
    var units = loadUnits();
    assert(units.length === 4, '4 units');
    assert(typeof units[0].unit_factor === 'number', 'unit_factor is number');
  });
  
  tryTest('getUnitFactor', function() {
    assert(getUnitFactor('UNIT-001') === 1.2, 'CAT 320 factor = 1.2');
    assert(getUnitFactor('NONEXISTENT') === DEFAULTS.UNIT_FACTOR, 'Default for non-existent');
  });
  
  // Mechanics
  Log.section('Mechanics');
  tryTest('loadMechanics', function() {
    var mechanics = loadMechanics();
    assert(mechanics.length === 17, '17 mechanics total');
  });
  
  tryTest('getMechanicsByRole', function() {
    assert(getMechanicsByRole('mechanic').length === 12, '12 mechanics');
    assert(getMechanicsByRole('supervisor').length === 3, '3 supervisors');
    assert(getMechanicsByRole('superintendent').length === 2, '2 superintendents');
  });
  
  tryTest('getMechanicByEmail', function() {
    var mech = getMechanicByEmail('ahmad.fauzi@company.com');
    assert(mech !== null && mech.mechanic_id === 'MECH-001', 'Found Ahmad');
  });
  
  // Factors
  Log.section('Factors');
  tryTest('loadFactors', function() {
    var factors = loadFactors();
    assert(factors.work_condition.normal === 1.0, 'work_condition.normal');
    assert(factors.timeliness.late === 0.8, 'timeliness.late');
    assert(factors.mtbf.redo === 0.8, 'mtbf.redo');
    assert(factors.safety.incident === 0.0, 'safety.incident');
  });
  
  tryTest('getTimelinessFactor', function() {
    var onTime = getTimelinessFactor(5, 5); // 100%
    var late = getTimelinessFactor(6, 5);   // 120%
    var wayLate = getTimelinessFactor(8, 5); // 160%
    
    assert(onTime.status === 'on_time' && onTime.factor === 1.0, 'On time');
    assert(late.status === 'late' && late.factor === 0.8, 'Late');
    assert(wayLate.status === 'way_late' && wayLate.factor === 0.5, 'Way late');
  });
  
  tryTest('getSafetyFactor', function() {
    assert(getSafetyFactor(true) === 0.0, 'Incident = 0');
    assert(getSafetyFactor(false) === 1.0, 'No incident = 1');
  });
  
  // Settings
  Log.section('Settings');
  tryTest('loadSettings', function() {
    var settings = loadSettings();
    assert(settings.mtbf_threshold_hours === 80, 'MTBF threshold 80');
    assert(settings.idr_rate === 50000, 'IDR rate 50000');
  });
  
  tryTest('getMtbfThresholdHours', function() {
    assert(getMtbfThresholdHours() === 80, 'MTBF helper');
  });
  
  // Full config
  Log.section('Full Config');
  tryTest('getConfig', function() {
    var config = getConfig();
    assert(config.components.length === 94 && 
           config.units.length === 4 &&
           config.mechanics.length === 17, 'Full config loaded');
  });
  
  // Summary
  Log.separator('Test Results');
  Log.info('test', '✅ Passed: ' + passed + ' | ❌ Failed: ' + failed);
  if (failed === 0) Log.info('test', '🎉 All tests passed!');
}


