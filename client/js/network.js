import * as MT from '/shared/message-types.js';

export class Network {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.connected = false;
    this.onDisconnectCallback = null;
    this.onConnect = null;
    this.onLog = null;
  }

  connect(url) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url = url || `${proto}//${location.host}`;
    if (this.onLog) this.onLog(`Connecting to ${url}...`);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
      if (this.onLog) this.onLog('WebSocket Open');
      if (this.onConnect) this.onConnect();
    };

    this.ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        const handler = this.handlers.get(msg.t);
        if (handler) handler(msg);
      } catch (e) {
        console.error('Parse error', e);
        if (this.onLog) this.onLog('Parse error');
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      if (this.onLog) this.onLog('WebSocket Closed');
      if (this.onDisconnectCallback) this.onDisconnectCallback();
    };

    this.ws.onerror = (e) => {
      console.error('WebSocket error', e);
      if (this.onLog) this.onLog('WebSocket Error');
    };
  }

  setDisconnectHandler(cb) {
    this.onDisconnectCallback = cb;
  }

  send(msg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(msgType, callback) {
    this.handlers.set(msgType, callback);
  }
}
