var path = require('path'),
  cp = require('child-process-debug'),
  processHelper = require('./../process-helper.js'),
  booleanHelper = require('../boolean-helper'),
  log = require('./../log'),
  _ = require('underscore'),
  colors = require('colors'),
  glob = require('glob'),
  fs = require('fs-extra');

/**
 * Mocha Constructor
 *
 * @param {Object} options
 * @api public
 */

function Mocha(options) {
  this.options = options;
  this.child = null;
}

/**
 * Run Mocha specs
 *
 * @param {Function} callback
 * @api public
 */

Mocha.prototype.start = function (callback) {

  var self = this;
  if (glob.sync(self.options.path).length === 0) {
    const infoMessage = `[chimp][mocha] Directory ${self.options.path} does not exist. Not running`;
    if (booleanHelper.isTruthy(self.options['fail-when-no-tests-run'])) {
      callback(infoMessage);
    }
    else {
      log.info(infoMessage);
      callback();
    }
    return;
  }

  log.debug('[chimp][mocha] Running...');

  var opts = {
    env: process.env,
    silent: true
  };

  var port;
  if (this.options.debugMocha) {
    port = parseInt(this.options.debugMocha);
    if (port > 1) {
      opts.execArgv = ['--debug=' + port];
    } else {
      opts.execArgv = ['--debug'];
    }
  }

  if (this.options.debugBrkMocha) {
    port = parseInt(this.options.debugBrkMocha);
    if (port > 1) {
      opts.execArgv = ['--debug-brk=' + port];
    } else {
      opts.execArgv = ['--debug-brk'];
    }
  }

  let _specs = [];
  if (this.options._.length > 2) {
    _specs = this.options._.slice(2);
  }

  opts.env = _.extend(process.env, {
    mochaConfig: JSON.stringify(this.options.mochaConfig)
  });
  self.child = cp.fork(path.join(__dirname, 'mocha-wrapper-instance.js'), _specs, opts);
  self.child.stdout.pipe(process.stdout);
  self.child.stderr.pipe(process.stderr);
  process.stdin.pipe(self.child.stdin);


  let noTestsFound = false;
  self.child.stdout.on('data', function(data) {
    const colorCodesRegExp = new RegExp(`\x1B\\[([0-9]{1,2}(;[0-9]{1,2})?)?[m|K]`, 'g');
    const dataFromStdout = data.toString().replace(colorCodesRegExp, '').trim();
    if (/^0 passing/.test(dataFromStdout)) {
      noTestsFound = true;
    }
  });

  var result = null;
  self.child.on('message', function (res) {
    log.debug('[chimp][mocha] Received message from Mocha child. Result:', res);
    result = res;
  });

  self.child.on('close', (code) => {
    log.debug('[chimp][mocha] Closed with code', code);
    const failWhenNoTestsRun = booleanHelper.isTruthy(self.options['fail-when-no-tests-run']);
    if (!self.child.stopping) {
      log.debug('[chimp][mocha] Mocha not in a stopping state');
      callback(code !== 0 || (code === 0 && noTestsFound && failWhenNoTestsRun) ? 'Mocha failed' : null, result);
    }
  });

};

Mocha.prototype.interrupt = function (callback) {

  log.debug('[chimp][mocha] interrupting mocha');

  var self = this;

  if (!self.child) {
    log.debug('[chimp][mocha] no child to interrupt');
    return callback();
  }
  self.child.stopping = true;

  var options = {
    child: self.child,
    prefix: 'mocha'
  };

  processHelper.kill(options, function (err, res) {
    self.child = null;
    if (callback) {
      callback(err, res);
    }
  });

};

module.exports = Mocha;
