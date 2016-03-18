var pushPull = require('./push-pull.js'),
    program = require('commander'),
    CronJob = require('cron').CronJob,
    settingsSpreadsheetIdValue = null,
    schedule, job;

var error = function (message) {
  console.error(message);
  process.exit(1);
};

var log = function (message) {
  console.log(message);
};

var main = function () {
  pushPull.loadKey(function (err, key) {
    if (err) { return error(err); }

    pushPull.getSettings(key, settingsSpreadsheetIdValue, program.teacherId, function (err, settings) {
      if (err) { return error(err); }

      if (program.check) {
        log('Settings are ok!');
        return;
      }

      pushPull.read(key, settings, function (err, portalData) {
        if (err) { return error(err); }

        if (program.read) {
          log(JSON.stringify(portalData, null, 2));
          return;
        }

        pushPull.loadTeacherSheets(key, settings, function (err, teacherSheets) {
          if (err) { return done(500, err, result); }

          pushPull.write(key, settings, portalData, teacherSheets, function (err) {
            if (err) { return error(err); }
          });
        });
      });
    });
  });
};

program
  .version('1.0.0')
  .usage('[options] <settingsSpreadsheetId>')
  .option('-c, --check', 'Checks the settings spreadsheet for validity')
  .option('-r, --read', 'Only read the teacher data')
  .option('-t, --teacherId <teacherId>', 'Use only this teacher id')
  .option('-s, --schedule', 'Use SCHEDULE environment variable or run hourly if none found')
  .action(function (settingsSpreadsheetId, foo) {
    settingsSpreadsheetIdValue = settingsSpreadsheetId;
  })
  .parse(process.argv);

// get the settings file id
if (!settingsSpreadsheetIdValue) {
  return error('Missing <settingsSpreadsheetId> parameter');
}

// alway run at the start
main();

// and optionally on a schedule
if (program.schedule) {
  schedule = process.env.SCHEDULE || '0 0 * * * *';
  try {
    job = new CronJob(schedule, main);
    job.start();
  } catch (ex) {
    error("schedule pattern not valid: '" + schedule + "' (note there are 6 fields required, including seconds, unlike the standard cron which has 5)");
  }
}
