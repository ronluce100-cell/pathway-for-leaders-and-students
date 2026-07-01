// ═══════════════════════════════════════════════════════════════════
//  PATHWAY TO FREEDOM — Central Google Apps Script
//  Paste this entire file into Extensions > Apps Script in your
//  Google Sheet. Then Deploy > New Deployment > Web App.
//  Execute as: Me  |  Access: Anyone
//  Copy the Web App URL and paste into both HTML files where you see:
//    var CENTRAL_URL = "YOUR_GAS_URL_HERE";
// ═══════════════════════════════════════════════════════════════════

// ── COLUMN HEADERS ────────────────────────────────────────────────
var ASSESS_COLS = [
  'timestamp','groupCode','week','name','age','group','email','date',
  'growth','growth_now','hope','likely','qt','hear','grow',
  'group_close','trust','ldr_qualities','ldr_connect','issue','prayer','tri2'
];
var LEADER_COLS = ['timestamp','groupCode','name','email','group'];

// ── RECEIVE ASSESSMENT FROM STUDENT ───────────────────────────────
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Assessments') || ss.insertSheet('Assessments');

    // Write headers if sheet is new
    if (sh.getLastRow() === 0) {
      sh.appendRow(ASSESS_COLS);
      sh.getRange(1, 1, 1, ASSESS_COLS.length).setFontWeight('bold');
    }

    var ts = new Date().toISOString();
    var row = ASSESS_COLS.map(function(c) {
      return c === 'timestamp' ? ts : (d[c] !== undefined ? d[c] : '');
    });

    // Update existing row if same student+week+group exists
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][2]) === String(d.name || '')
       && String(vals[i][1]) === String(d.week || '')
       && String(vals[i][0]) === String(d.groupCode || '')) {
        sh.getRange(i + 1, 1, 1, ASSESS_COLS.length).setValues([row]);
        return out({ success: true, action: 'updated' });
      }
    }
    sh.appendRow(row);
    return out({ success: true, action: 'added' });

  } catch (err) {
    return out({ success: false, error: String(err) });
  }
}

// ── HANDLE GET REQUESTS ────────────────────────────────────────────
function doGet(e) {
  var action = (e.parameter && e.parameter.action) || 'data';
  if (action === 'register') return registerLeader(e);
  return getData(e);
}

// ── REGISTER A LEADER (returns groupCode) ─────────────────────────
function registerLeader(e) {
  try {
    var name  = e.parameter.name  || '';
    var email = e.parameter.email || '';
    var group = e.parameter.group || '';
    if (!name || !group) return out({ success: false, error: 'Name and group required' });

    var code = generateCode(group, email);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Leaders') || ss.insertSheet('Leaders');
    if (sh.getLastRow() === 0) {
      sh.appendRow(LEADER_COLS);
      sh.getRange(1, 1, 1, LEADER_COLS.length).setFontWeight('bold');
    }

    // Update or insert leader record
    var ts = new Date().toISOString();
    var row = [ts, code, name, email, group];
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][1]) === code) {
        sh.getRange(i + 1, 1, 1, LEADER_COLS.length).setValues([row]);
        return out({ success: true, groupCode: code });
      }
    }
    sh.appendRow(row);
    return out({ success: true, groupCode: code });

  } catch (err) {
    return out({ success: false, error: String(err) });
  }
}

// ── RETURN ASSESSMENTS FOR A GROUP ────────────────────────────────
function getData(e) {
  try {
    var groupCode = (e.parameter && e.parameter.groupCode) || '';
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Assessments');
    if (!sh || sh.getLastRow() < 2) return out({ success: true, data: [] });

    var vals = sh.getDataRange().getValues();
    var hdrs = vals[0];
    var data = vals.slice(1)
      .filter(function(r) {
        return !groupCode || String(r[1]) === groupCode; // col 1 = groupCode
      })
      .map(function(r) {
        var o = {};
        hdrs.forEach(function(h, i) { o[h] = String(r[i] || ''); });
        return o;
      });

    return out({ success: true, data: data });

  } catch (err) {
    return out({ success: false, error: String(err) });
  }
}

// ── GENERATE DETERMINISTIC 6-CHAR GROUP CODE ──────────────────────
function generateCode(group, email) {
  var str = (group.toLowerCase() + (email || '').toLowerCase()).replace(/\s+/g, '');
  var hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str);
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O,0,I,1 (confusable)
  var code = '';
  for (var i = 0; i < 6; i++) {
    var b = hash[i];
    if (b < 0) b += 256;
    code += chars[b % chars.length];
  }
  return code;
}

// ── JSON RESPONSE HELPER ──────────────────────────────────────────
function out(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
