// This repeatedly runs the click and unit tests to verify their stability

var childProcess = require('child_process');
var DateTime = require('luxon').DateTime;

var count = 0;
var clickTestErrors = 0;
var unitTestErrors = 0;
var startTime = Date.now();
var run = function () {
  var testTime = Date.now();
  count++;
  console.log('Round ' + count + '...');
  childProcess.exec('npm run clicktest', function (err, stdout, stderr) {
    if (err) {
      clickTestErrors++;
      console.log(stdout);
      console.log(stderr);
      console.log('Clicktest failed!');
    }
    childProcess.exec('npm run unittest', function (err, stdout, stderr) {
      if (err) {
        unitTestErrors++;
        console.log(stdout);
        console.log(stderr);
        console.log('Unittest failed!');
      }
      console.log(
        count +
          ' test run, ' +
          clickTestErrors +
          ' clicktest errors (' +
          Math.floor((100 * clickTestErrors) / count) +
          '%), ' +
          unitTestErrors +
          ' unittest errors (' +
          Math.floor((100 * unitTestErrors) / count) +
          '%) ' +
          '(this round: ' +
          DateTime.fromJSDate(testTime).diffNow().seconds +
          'sec, total: ' +
          DateTime.fromJSDate(startTime).diffNow().toRelative() +
          ')'
      );
      run();
    });
  });
};
run();
