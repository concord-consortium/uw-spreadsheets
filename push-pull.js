var GoogleSpreadsheet = require('google-spreadsheet'),
    request = require('request');

var loadKey = function (callback) {
  if (!process.env.CLIENT_EMAIL) {
    return callback('Missing CLIENT_EMAIL environment variable');
  }
  if (!process.env.PRIVATE_KEY) {
    return callback('Missing PRIVATE_KEY environment variable');
  }
  callback(null, {
    client_email: process.env.CLIENT_EMAIL,
    private_key: process.env.PRIVATE_KEY.replace(/\\n/g, '\n')
  });
};

var getSettings = function (key, settingsSpreadsheetId, teacherId, callback) {
  var requiredSettings = ['reportUrl'];

  // pull google settings spreadsheet
  var settingsSheet = new GoogleSpreadsheet(settingsSpreadsheetId);
  settingsSheet.useServiceAccountAuth(key, function (err) {
    if (err) { return callback(err); }

    settingsSheet.getInfo(function(err, sheetInfo)  {
      if (err) { return callback(err); }

      // get the settings
      sheetInfo.worksheets[0].getCells(function (err, cells) {
        if (err) { return callback(err); }

        var settings = {},
            i, cell, rowLabel;

        cells.forEach(function (cell) {
          if (cell.col == 1) {
            rowLabel = cell.value;
          }
          else if (cell.value) {
            settings[rowLabel] = cell.value;
          }
        });

        // get the teacher id to spreadsheet mapping
        settings.teachers = [];
        sheetInfo.worksheets[1].getCells(function (err, cells) {
          if (err) { return callback(err, null); }

          var hasTeacherId = !teacherId,
              id;

          cells.forEach(function (cell) {
            if (cell.col == 1) {
              id = cell.value;
              hasTeacherId = hasTeacherId || (id == teacherId);
            }
            else if (cell.value && (!teacherId || (id == teacherId))) {
              settings.teachers.push({
                id: id,
                fileId: cell.value
              });
            }
          });

          // check settings
          requiredSettings.forEach(function (setting) {
            if (!settings.hasOwnProperty(setting)) {
              callback('Missing required setting: ' + setting, settings);
            }
          });
          if (!hasTeacherId) {
            callback('Missing requested teacherId of ' + teacherId + ' in second tab of settings spreadsheet', settings);
          }
          if (settings.teachers.length == 0) {
            callback('No teacher mappings found in second tab of settings spreadsheet', settings);
          }

          callback(null, settings);
        });
      });
    });
  });
};

var read = function (key, settings, callback) {
  return callback(null, []);

  var url = settings.reportUrl + '?teachers=' + settings.teachers.map(function (teacher) { return teacher.id }).join(',');

  request(url, function (err, response, body) {
    if (err) { return callback(err.code + ' ' + url); }
    if (response.statusCode != 200) { return callback(response.statusCode + ' ' + url); }
    if (!body || (body.length == 0)) { return callback('NO DATA! ' + url); }
    callback(null, body);
  });
};

var loadTeacherSheets = function (key, settings, callback) {
  _loadTeacherSheets(settings.teachers.slice(), {}, callback);
};
var _loadTeacherSheets = function (teachers, teacherSheets, callback) {
  if (teachers.length == 0) {
    return callback(null, teacherSheets);
  }
  var teacher = teachers.shift();
      teacherSheet = new GoogleSpreadsheet(teacher.fileId);

  teacherSheet.useServiceAccountAuth({client_email: key.client_email, private_key: key.private_key}, function (err) {
    if (err) { return callback(err); }
    teacherSheet.getInfo(function(err, sheetInfo)  {
      if (err) { return callback(err); }
      teacherSheets[teacher.id] = {
        info: sheetInfo,
        worksheet: sheetInfo.worksheets[0],
        startingCells: null
      };
      teacherSheets[teacher.id].worksheets.getCells(function (err, cells) {
        if (err) { return callback(err, teacherSheets); }
        teacherSheets[teacher.id].startingCells = cells;
        _loadTeacherSheets(teachers, teacherSheets, callback);
      });
    });
  });
};

var write = function (key, settings, portalData, teacherSheets, callback) {
  //var lines = data.split('\n');
  //    dataHeader = data.shift();

  /* TODO

    1. Read the portalData as csv
    2. Convert the starting teacher sheet cells into better data structure
    3. Find all the rows to update
    4. Find all the rows to insert
  */

  // split the
  settings.teachers.forEach(function (teacher) {
    teacherSheets[teacher.id].worksheet.addRow({foo: (new Date()).toString()}, function (err) {
      if (err) { console.error(err); }
    });
  });

  callback(null);
};

var getTeacherIds = function (settings) {
  return settings.teachers.map(function (teacher) { return teacher.id });
};

module.exports = {
  getSettings: getSettings,
  read: read,
  loadTeacherSheets: loadTeacherSheets,
  write: write,
  loadKey: loadKey
};
