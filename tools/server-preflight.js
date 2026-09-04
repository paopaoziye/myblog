'use strict';

const net = require('net');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const portIndex = args.findIndex(arg => arg === '--port' || arg === '-p');
const port = Number(portIndex >= 0 ? args[portIndex + 1] : process.env.PORT || 4000);
const hostIndex = args.findIndex(arg => arg === '--ip' || arg === '-i');
const host = hostIndex >= 0 ? args[hostIndex + 1] : '127.0.0.1';

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Invalid server port: ${port}`);
  process.exit(1);
}

const probe = net.createServer();
probe.once('error', error => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use on ${host}. Stop the existing service or use: npm run server -- --port ${port + 1}`);
  } else {
    console.error(`Unable to check ${host}:${port}: ${error.message}`);
  }
  process.exit(1);
});
probe.listen(port, host, () => {
  probe.close(() => {
    const child = spawn(process.execPath, [require.resolve('hexo/bin/hexo'), 'server', ...args], {
      stdio: 'inherit',
      shell: false,
      cwd: process.cwd()
    });
    child.on('exit', (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      else process.exit(code === null ? 1 : code);
    });
  });
});
