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
  var requiredSettings = ['dataUrl', 'bearerToken'];

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
            if (!settings.hasOwnProperty(setting) || (settings[setting].length == 0)) {
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
  var url = settings.dataUrl + '?' + settings.teachers.map(function (teacher) { return 'teacher_id[]=' + teacher.id }).join('&');

  request(url, {auth: {bearer: settings.bearerToken}}, function (err, response, body) {
    if (err) { return callback(err.code + ' ' + url); }
    if (response.statusCode != 200) { return callback(response.statusCode + ' ' + url); }
    if (!body || (body.length == 0)) { return callback('NO DATA! ' + url); }
    try {
      parsedBody = JSON.parse(body);
    }
    catch (e) {
      return callback('Unable to parse student data at ' + url + ': ' + e.message);
    }
    callback(null, parsedBody);
  });
};

var xlatHeader = function (header) {
  return header.replace(/_/g, '').toLowerCase();
};

var loadTeacherSheets = function (key, settings, callback) {
  _loadTeacherSheets(key, settings.teachers.slice(), {}, callback);
};
var _loadTeacherSheets = function (key, teachers, teacherSheets, callback) {
  if (teachers.length == 0) {
    return callback(null, teacherSheets);
  }
  var teacher = teachers.shift();
      teacherSheet = new GoogleSpreadsheet(teacher.fileId);

  teacherSheet.useServiceAccountAuth(key, function (err) {
    if (err) { return callback(err); }
    teacherSheet.getInfo(function(err, sheetInfo)  {
      if (err) { return callback(err); }
      _loadTeacherWorksheets(sheetInfo.worksheets.slice(), [], function (err, worksheets) {
        if (err) { return callback(err, teacherSheets); }
        teacherSheets[teacher.id] = {
          info: sheetInfo,
          worksheets: worksheets
        };
        _loadTeacherSheets(key, teachers, teacherSheets, callback);
      });
    });
  });
};
var _loadTeacherWorksheets = function (worksheets, results, callback) {
  if (worksheets.length == 0) {
    callback(null, results);
  }
  else {
    var worksheet = worksheets.shift();

    worksheet.getRows(function (err, rows) {
      if (err) { return callback(err); }
      var rowHash = {};
      rows.forEach(function (row) {
        var key = ["activity_id", "teacher_id", "class_id", "student_id", "question_type", "question_id"].map(function (header) { return row[xlatHeader(header)]; }).join("|");
        rowHash[key] = row;
      });
      results.push({
        activityId: (rows.length > 0) && rows[0][xlatHeader('activity_id')] ? rows[0][xlatHeader('activity_id')] : null,
        api: worksheet,
        rows: rowHash
      });
      _loadTeacherWorksheets(worksheets, results, callback);
    });
  }
};

var write = function (key, settings, portalData, teacherSheets, callback) {

  var changeRows = [],
      key, i, worksheet, firstBlankWorksheet, row;

  for (var teacherId in portalData.teachers) {
    if (portalData.teachers.hasOwnProperty(teacherId)) {
      var teacher = portalData.teachers[teacherId];
      for (var activityId in teacher.activities) {
        if (teacher.activities.hasOwnProperty(activityId)) {
          var activity = teacher.activities[activityId];
          worksheet = null;
          teacherSheets[teacherId].worksheets.forEach(function (_worksheet) {
            if (_worksheet.activityId == activityId) {
              worksheet = _worksheet;
            }
            else if (!_worksheet.activityId) {
              firstBlankWorksheet = _worksheet;
            }
          });
          if (!worksheet) {
            if (firstBlankWorksheet) {
              worksheet = firstBlankWorksheet;
              worksheet.activityId = activityId;
            }
            else {
              return callback("No worksheet found for activity " + activityId + " and no blank worksheets also found");
            }
          }

          for (var classId in activity.classes) {
            if (activity.classes.hasOwnProperty(classId)) {
              var clazz = activity.classes[classId];
              for (var studentId in clazz.students) {
                if (clazz.students.hasOwnProperty(studentId)) {
                  var student = clazz.students[studentId];
                  student.questions.forEach(function (question) {

                    question.type = question.type.split('::')[1],
                    question.answer = question.type == "OpenResponse" ? question.answer : question.answer.map(function (answer) { return answer.answer; }).join('\n');
                    question.correct = question.hasOwnProperty('is_correct') ? (question.is_correct ? "YES" : "NO") : 'N/A';
                    question.found_answers = student.found_answers ? "YES" : "NO";

                    key = [activityId, teacherId, classId, studentId, question.type, question.id].join("|");

                    if (worksheet.rows[key]) {
                      var updateRow = false;
                      ["found_answers", "prompt", "answer", "correct"].forEach(function (header) {
                        var value = typeof question[header] == "boolean" ? (question[header] ? "YES" : "NO") : question[header];
                        if (worksheet.rows[key][xlatHeader(header)] != value) {
                          worksheet.rows[key][xlatHeader(header)] = value;
                          updateRow = true;
                        }
                      });
                      if (updateRow) {
                        changeRows.push({
                          op: 'update',
                          row: worksheet.rows[key]
                        });
                      }
                    }
                    else {
                      changeRows.push({
                        op: 'insert',
                        api: worksheet.api,
                        data: {
                          activity_id: activityId,
                          activity_name: activity.name,
                          teacher_id: teacherId,
                          teacher_name: teacher.first_name + ' ' + teacher.last_name,
                          class_id: classId,
                          class_name: clazz.name,
                          student_id: studentId,
                          student_name: student.first_name + ' ' + student.last_name,
                          found_answers: question.found_answers,
                          question_type: question.type,
                          question_id: question.id,
                          prompt: question.prompt,
                          answer: question.answer,
                          correct: question.correct
                        }
                      });
                    }
                  });
                }
              }
            }
          }
        }
      }

    }
  }

  processRowChanges(changeRows, callback);
};

var processRowChanges = function (changeRows, callback) {
  var next = function (err) {
    if (err) {
      callback(err);
    }
    else {
      processRowChanges(changeRows, callback);
    }
  };

  if (changeRows.length == 0) {
    callback(null);
  }
  else {
    var changeRow = changeRows.shift();
    if (changeRow.op == 'update') {
      changeRow.row.save(next);
    }
    else {
      var xlatData = {}, header;
      for (header in changeRow.data) {
        xlatData[xlatHeader(header)] = changeRow.data[header];
      }
      changeRow.api.addRow(xlatData, next);
    }
  }
}

module.exports = {
  getSettings: getSettings,
  read: read,
  loadTeacherSheets: loadTeacherSheets,
  write: write,
  loadKey: loadKey
};
