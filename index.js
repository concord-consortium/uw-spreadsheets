var http = require('http'),
    url = require('url'),
    pushPull = require('./push-pull.js')

var requestListener = function (req, res) {
  var query = url.parse(req.url, true).query,
      done,settings;

  done = function (code, error, result) {
    var response = {
      success: code == 200
    }, i;

    if (error) {
      response.error = error.toString();
    }

    if (result) {
      for (i in result) {
        if (result.hasOwnProperty(i)) {
          response[i] = result[i];
        }
      }
    }

    res.writeHead(code);
    res.end(JSON.stringify(response, null, 2));
  };

  if (!query.auth) {
    return done(400, 'Missing auth query parameter');
  }
  if (!process.env.AUTH) {
    return done(500, 'Missing auth environment variable');
  }
  if (query.auth !== process.env.AUTH) {
    return done(401, 'Incorrect auth query parameter value');
  }
  if (!query.settingsSpreadsheetId) {
    return done(400, 'Missing settingsSpreadsheetId query parameter');
  }

  try {
    var action = query.action || 'check-settings',
        result = {
          action: action,
          settings: {}
        };

    pushPull.loadKey(function (err, key) {
      if (err) { return done(500, err); }

      pushPull.getSettings(key, query.settingsSpreadsheetId, query.teacherId, function (err, settings) {
        if (err) { return done(500, err); }

        result.settings = settings;

        if ((action == 'read') || (action == 'read-and-write')) {
          pushPull.read(key, settings, function (err, portalData) {
            if (err) { return done(500, err, result); }

            result.portalData = portalData;

            if (action == 'read-and-write') {
              pushPull.loadTeacherSheets(key, settings, function (err, teacherSheets) {
                if (err) { return done(500, err, result); }

                pushPull.write(key, settings, portalData, teacherSheets, function (err) {
                  if (err) { return done(500, err, result); }
                  return done(200, null, result);
                });
              });
            }
            else {
              done(200, null, result);
            }
          });
        }
        else {
          done(200, null, result);
        }
      });
    });
  }
  catch (e) {
    done(500, e.toString(), result)
  }
};

http.createServer(requestListener).listen(process.env.PORT || 9000);
