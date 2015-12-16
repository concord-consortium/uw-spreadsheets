var pushPull = require('./push-pull.js'),
    program = require('commander'),
    settingsSpreadsheetIdValue = null;

var showError = function (message) {
  console.error(message);
  process.exit(1);
};

var log = function (message) {
  console.log(message);
};

var dir = function (data) {
  console.dir(data);
};

program
  .version('1.0.0')
  .usage('[options] <settingsSpreadsheetId>')
  .option('-c, --check', 'Checks the settings spreadsheet for validity')
  .option('-r, --read', 'Only read the teacher data')
  .option('-t, --teacherId <teacherId>', 'Use only this teacher id')
  .action(function (settingsSpreadsheetId, foo) {
    settingsSpreadsheetIdValue = settingsSpreadsheetId;
  })
  .parse(process.argv);

// get the settings file id
if (!settingsSpreadsheetIdValue) {
  return showError('Missing <settingsSpreadsheetId> parameter');
}

pushPull.loadKey(function (err, key) {
  if (err) { return showError(err); }

  pushPull.getSettings(key, settingsSpreadsheetIdValue, program.teacherId, function (err, settings) {
    if (err) { return showError(err); }

    if (program.check) {
      log('Settings are ok!');
      return;
    }

    pushPull.read(key, settings, function (err, portalData) {
      if (err) { return showError(err); }

      if (program.read) {
        dir(portalData);
        return;
      }

      pushPull.loadTeacherSheets(key, settings, function (err, teacherSheets) {
        if (err) { return done(500, err, result); }

        pushPull.write(key, settings, portalData, teacherSheets, function (err) {
          if (err) { return showError(err); }
        });
      });
    });
  });
});
