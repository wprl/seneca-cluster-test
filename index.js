'use strict';

var seneca = require('seneca');
var cluster = require('cluster');
var express = require('express');
var cpuCount = require('os').cpus().length;
var childCount = cpuCount / 2;

if (cluster.isMaster) {
  // Fork workers.
  for (var i = 0; i < childCount; i++) {
    cluster.fork();
  }

  cluster.on('exit', function(worker, code, signal) {
    console.log('worker ' + worker.process.pid + ' died');
  });
}
else {
  var seneca1 = seneca();

  seneca1.use('seneca-rabbitmq-transport')
    .use('seneca-web');

  seneca1.client({ type: 'tcp', port: 10301, pin: 'role:test-worker,cmd:*' })

  // Create a web.
  seneca1.add({ role: 'test-web', cmd: 'proxy' }, function (args, done) {
    return seneca1.act({ role: 'test-worker', cmd: 'ping' }, done);
  });

  seneca1.act({ role: 'web', map: [
    { proxy: { alias: 'ping' } }
  ]});

  seneca1.act({ role: 'web' }, { use: {
    prefix: '/',
    pin: { role: 'test-web', cmd:'*' },
    map:{ proxy: { GET: true, alias: 'ping' } }
  }});

  var app = express();
  app.use(function (req, res, next) {
    req.body = {}; // stop warning output
    next();
  });
  app.use(seneca1.export('web'));
  app.listen(3000);

  console.info('HTTP server started');

  // ----------------------------------------------------------

  var seneca2 = seneca({
    transport: {
      type: 'tcp',
      tcp: { port: 10301 }
    }
  });

  seneca2.use('seneca-rabbitmq-transport');

  // Create a worker.
  seneca2.add({ role: 'test-worker', cmd: 'ping' }, function (args, done) {
    return done(null, { msg: 'pong' });
  });

  seneca2.listen();
}
