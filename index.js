'use strict';

var seneca = require('seneca');
var cluster = require('cluster');
var express = require('express');

var mq = process.env.TRANSPORT || 'rabbitmq';
var transport = 'seneca-' + mq + '-transport';

if (cluster.isMaster) {
  console.info('Spawning %s children', 2);

  // Fork workers.
  for (var i = 0; i < 2; i++) {
    cluster.fork();
  }

  cluster.on('exit', function(worker, code, signal) {
    console.log('worker ' + worker.process.pid + ' died');
  });
}
else {
  var seneca1 = seneca();

  seneca1.use(transport)
    .use('seneca-web');

  seneca1.client({ type: mq });

  // Create a web.
  seneca1.add({ role: 'test-web', cmd: 'proxy' }, function (args, done) {
    return seneca1.act({ role: 'test-worker', cmd: 'ping' }, done);
  });

  seneca1.act({ role: 'web' }, { use: {
    prefix: '/',
    pin: { role: 'test-web', cmd: '*' },
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
    transport: { type: mq }
  });

  seneca2.use(transport);

  // Create a worker.
  seneca2.add({ role: 'test-worker', cmd: 'ping' }, function (args, done) {
    console.info('REPLYING PONG');
    return done(null, { msg: 'pong' });
  });

  seneca2.listen();
}
