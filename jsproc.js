(function() {
  var addslashes, cp, exec;

  cp = require('child_process');

  addslashes = function(str) {
    return str.replace(/\\/g, '\\\\').replace(/\'/g, '\\\'').replace(/\0/g, '\\0');
  };

  exec = function(cmd, body, cb) {
    var proc, response;
    response = [];
    proc = cp.spawn(cmd);
    proc.stdout.on('data', function(data) {
      return response.push(data.toString());
    });
    proc.on('exit', function(code) {
      if (code) {
        return cb(code);
      } else {
        return cb(null, response.join(''));
      }
    });
    proc.stdin.write(body.join('\n'));
    return proc.stdin.end();
  };

  module.exports = function(input, cb) {
    var end, lines, output, resourceBody, resourceName, resourcePipe, resources, state, step;
    lines = input.split('\n');
    resources = {};
    state = 'wait';
    resourceName = null;
    resourcePipe = null;
    resourceBody = [];
    output = [];
    step = function(lines) {
      var line, matches, next, res;
      line = lines[0];
      next = function() {
        if (!(lines.length > 1)) return end(resources);
        return step(lines.slice(1));
      };
      output.push(line);
      switch (state) {
        case 'wait':
          if (line.match(/^\s*@@DEFRESOURCE\s*$/gi)) {
            resourceName = null;
            resourcePipe = null;
            resourceBody = [];
            state = 'readResourceHeader';
            return next();
          }
          if (matches = /\/\*@@RESOURCE (\w+)\*\/'(.*)'\/\*@@\/RESOURCE\*\//gi.exec(line)) {
            (function() {
              var end, escaped, res, start, subst, wholeMacro;
              resourceName = matches[1];
              res = resources[resourceName];
              if (!res) process.exit(1);
              escaped = res.escapedResult;
              start = line.substr(0, matches.index);
              wholeMacro = matches[0];
              subst = "/*@@RESOURCE " + resourceName + "*/'" + escaped + "'/*@@/RESOURCE*/";
              end = line.substr(matches.index + wholeMacro.length);
              return output[output.length - 1] = "" + start + subst + end;
            })();
          }
          break;
        case 'readResourceHeader':
          if (line.match(/^\s*$/gi)) {
            if (resourceName === null) process.exit(1);
            state = 'readResourceBody';
            return next();
          }
          if (matches = line.match(/^\s*name:(.+)\s*$/)) {
            resourceName = matches[1];
            return next();
          }
          if (matches = line.match(/^\s*pipe:(.+)\s*$/)) {
            resourcePipe = matches[1];
            return next();
          }
          break;
        case 'readResourceBody':
          if (line.match(/^\s*@@\/DEFRESOURCE\s*$/gi)) {
            res = {
              name: resourceName,
              pipe: resourcePipe,
              body: resourceBody
            };
            resources[resourceName] = res;
            state = 'wait';
            return exec(res.pipe, res.body, function(err, result) {
              if (err) {
                process.exit(1);
                return;
              }
              res.result = result;
              res.escapedResult = addslashes(result);
              return next();
            });
          }
          resourceBody.push(line);
      }
      return next();
    };
    end = function(resources) {
      return cb(output.join('\n'));
    };
    return step(lines);
  };

}).call(this);
