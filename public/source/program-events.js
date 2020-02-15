
var signals = require('micro-signals');

var programEvents = new signals.Signal();
module.exports = programEvents;

programEvents.add(function(event) {
  console.log('Event:', event);
});
