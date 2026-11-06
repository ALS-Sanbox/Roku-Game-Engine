const http = require('node:http');
const net = require('node:net');
const dgram = require('node:dgram');
const { StringDecoder } = require('node:string_decoder');

class DeviceServices {
  constructor({ ecpPort = 8060, debugPort = 8085, udp = dgram } = {}) {
    this.ecpPort = ecpPort; this.debugPort = debugPort; this.udp = udp; this.sessions = new Map();
  }
  target(ip) {
    if (!net.isIP(String(ip))) throw new Error('Enter a Roku IP address.');
    return String(ip);
  }
  request(ip, path, method = 'GET') {
    const hostname = this.target(ip);
    return new Promise(resolve => {
      const req = http.request({ hostname, port: this.ecpPort, path, method, timeout: 4000 }, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { if (body.length < 1024 * 1024) body += chunk; });
        res.on('error', error => resolve({ success: false, reason: error.message }));
        res.on('end', () => resolve({ success: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body, reason: res.statusCode >= 300 ? `HTTP ${res.statusCode}` : undefined }));
      });
      req.on('timeout', () => req.destroy(new Error('Device request timed out.')));
      req.on('error', error => resolve({ success: false, reason: error.message })); req.end();
    });
  }
  async ping(ip) {
    const response = await this.request(ip, '/query/device-info');
    const read = tag => response.body?.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] || '';
    return { ...response, ip, model: read('model-name'), serial: read('serial-number'), firmwareVersion: read('software-version') };
  }
  async restart(ip) {
    const stopped = await this.request(ip, '/keypress/Home', 'POST');
    if (!stopped.success) return stopped;
    return this.request(ip, '/launch/dev', 'POST');
  }
  discover(timeout = 2500) {
    return new Promise(resolve => {
      const socket = this.udp.createSocket('udp4'), devices = new Map();
      let done = false;
      const finish = error => {
        if (done) return; done = true; clearTimeout(timer);
        try { socket.close(); } catch {}
        resolve({ success: !error, devices: [...devices.values()], reason: error?.message });
      };
      const timer = setTimeout(finish, timeout);
      socket.on('message', buffer => {
        const message = buffer.toString('utf8');
        if (!/roku:ecp/i.test(message)) return;
        const location = message.match(/^location:\s*(.+)$/im)?.[1]?.trim();
        try { const ip = new URL(location).hostname; if (net.isIP(ip)) devices.set(ip, { ip }); } catch {}
      });
      socket.on('error', finish);
      socket.bind(0, () => {
        const query = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nST: roku:ecp\r\nMX: 2\r\n\r\n');
        socket.send(query, 1900, '239.255.255.250', error => { if (error) finish(error); });
      });
    });
  }
  disconnect(owner) {
    const session = this.sessions.get(owner);
    if (session) { this.sessions.delete(owner); session.socket.destroy(); }
  }
  connect(owner, ip, notify) {
    this.target(ip); this.disconnect(owner);
    return new Promise(resolve => {
      const socket = net.createConnection({ host: ip, port: this.debugPort });
      const session = { socket }; this.sessions.set(owner, session);
      const decoder = new StringDecoder('utf8'); let pending = '', telnet = 0, negotiation = 0, connected = false;
      const timer = setTimeout(() => socket.destroy(new Error('Debug console timed out.')), 4000);
      const current = () => this.sessions.get(owner) === session;
      socket.on('connect', () => { connected = true; clearTimeout(timer); resolve({ success: true }); });
      socket.on('data', bytes => {
        if (!current()) return;
        const plain = [];
        for (const byte of bytes) {
          if (telnet === 1) {
            if (byte === 255) { plain.push(byte); telnet = 0; }
            else if ([251,252,253,254].includes(byte)) { negotiation = byte; telnet = 2; }
            else if (byte === 250) telnet = 3;
            else telnet = 0;
          } else if (telnet === 2) { socket.write(Buffer.from([255, negotiation === 253 || negotiation === 254 ? 252 : 254, byte])); telnet = 0; }
          else if (telnet === 3) { if (byte === 255) telnet = 4; }
          else if (telnet === 4) telnet = byte === 240 ? 0 : 3;
          else if (byte === 255) telnet = 1;
          else plain.push(byte);
        }
        pending += decoder.write(Buffer.from(plain));
        const lines = pending.split(/\r?\n/); pending = lines.pop().slice(-65536);
        for (const text of lines) {
          const line = text.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\r/g, '');
          const marker = line.indexOf('RGE_STATS ');
          if (marker >= 0) {
            try { const stats = JSON.parse(line.slice(marker + 10)); notify({ type: 'stats', ip, stats }); } catch {}
          }
          notify({ type: 'log', ip, line });
        }
      });
      socket.on('error', error => { clearTimeout(timer); if (!connected) resolve({ success: false, reason: error.message }); if (current()) notify({ type: 'debug-error', ip, reason: error.message }); });
      socket.on('close', () => { clearTimeout(timer); if (!connected) resolve({ success: false, reason: 'Debug console closed.' }); if (current()) { this.sessions.delete(owner); notify({ type: 'debug-disconnected', ip }); } });
    });
  }
  close() { for (const owner of this.sessions.keys()) this.disconnect(owner); }
}
module.exports = { DeviceServices };
