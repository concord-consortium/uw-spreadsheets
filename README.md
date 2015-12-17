# UW Spreadsheets

This node app pulls student answer data from the Concord Portal and pushes it to Google spreadsheets for further analysis.

## Web Interface

This app has both a web interface and a command line interface.  The web interface defaults to port 9000 but the port can be set via the PORT environment variable.  Before starting the web interface you also need to set the following environment variables:

* AUTH: a string that needs to match the auth query parameter for authentication
* CLIENT_EMAIL: the email address of the Google service account used to access the spreadsheets
* PRIVATE_KEY: the certificate from the json file downloaded when the Google service account is created.  NOTE: Node autoescapes embedded escaped newlines.  This app will autounsecape them meaning you just need to copy the string from the json file into a environment variable.

Once the environment variables are set you can access the web interface with the following urls:

```
/?auth=<AUTH environment variable value>&settingsSpreadsheetId<id of settings spreadsheet>&action=[check-settings|read|read-and-write]&teacherId=[optional id of single teacher to use]
```

where the spreadsheet id is *1AmmWWX8_3HQ1jafF3si4__7HSvTUR5hdSJ6MqnEpbtM* for the following Google Spreadsheet url:
```https://docs.google.com/spreadsheets/d/1AmmWWX8_3HQ1jafF3si4__7HSvTUR5hdSJ6MqnEpbtM/edit#gid=0```

and the default action is check-settings which will just ensure it has access to the settings spreadsheet and that the settings spreadsheet has a proper format.  The teacherId parameter is optional and when present selects only that teacher in the settings spreadsheet.

## Command Line Interface

Like the web interface above you need to set the CLIENT_EMAIL and PRIVATE_KEY environment variables.  You do not need to set the AUTH environment variable.  Once set you can use the built-in help to access the command line interface settings:

```
node worker.js --help

  Usage: worker [options] <settingsSpreadsheetId>

  Options:

    -h, --help                   output usage information
    -V, --version                output the version number
    -c, --check                  Checks the settings spreadsheet for validity
    -r, --read                   Only read the teacher data
    -t, --teacherId <teacherId>  Use only this teacher id
```

## Settings Spreadsheet Format

The settings spreadsheet is comprised of two sheets.  The first sheet consists of key/value pairs in columns A and B.  Currently the valid keys are:

* dataUrl: This is the portal url to pull the JSON data from
* bearerToken: This is the authentication bearer token to use with the dataUrl

The second sheet in the settings spreadsheet is a mapping of teacher ids to teach spreadsheets using columns A and B.  Column A is the teacher id and column B is the spreadsheet file id which looks the same as the settings spreadsheet id.

## How it Works

1. The settings spreadsheet is read to gather the dataUrl, bearerToken and teacher ids to spreadsheets mapping.  The teacher id list is then filtered if the teacher id parameter is set in the web or command line interface.  If the check settings parameter is set the process outputs the settings and ends, otherwise it continues.
2. The portal data at dataUrl is read using the bearerToken.  If the read parameter is set the process outputs the portal data and ends, otherwise is continues.
3. Each of the teacher spreadsheets is read into memory.
4. The portal data is iterated over checking each teacher spreadsheet against the portal data to see if it needs to be inserted or updated.  The app assumes the activity id is in column A so it looks in each spreadsheet sheet at column A2 to get the activity id for that sheet.  If it cannot find a sheet matching the activity id in the portal data it will use the first blank sheet it finds.  If it cannot find a blank sheet it will abort with an error.
5. Once all the updates and inserts are found they are sent to Google via the api sequentially and then the process terminates.

## TODO:

1. Add insertion of a blank worksheet if no blank worksheets are found.
2. Rename the sheet if the activity name changes
3. Throttle the updates/adds if Google response with Too Many Requests
