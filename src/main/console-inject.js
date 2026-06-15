try {
  var PREFIX = '\x00CONSOLE:';
  var levels = ['log', 'warn', 'error', 'info', 'debug'];

  function formatMsg(args) {
    try {
      var util = require('util');
      return util.format.apply(util, args);
    } catch (e) {
      return Array.prototype.map.call(args, function(a) {
        if (a === null) return 'null';
        if (a === undefined) return 'undefined';
        if (typeof a === 'string') return a;
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch (e2) { return String(a); }
        }
        return String(a);
      }).join(' ');
    }
  }

  levels.forEach(function(level) {
    var original = console[level];
    console[level] = function() {
      var args = arguments;
      var msg = formatMsg(args);
      process.stdout.write(PREFIX + level + ':' + msg + '\n');
      original.apply(console, args);
    };
  });
} catch (e) {
  // Silently fail — console wrapping is optional
}
