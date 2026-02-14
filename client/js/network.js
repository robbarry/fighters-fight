import * as MT from '/shared/message-types.js';

export class Network {
  constructor() {
    this.ws = null;
    this.handlers = new Map();
    this.connected = false;
  }

  connect(url) {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url = url || `${proto}//${location.host}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      this.connected = true;
    };

    this.ws.onmessage = (evt) => {
      const msg = JSON.parse(evt.data);
      const handler = this.handlers.get(msg.t);
      if (handler) handler(msg);
    };

    this.ws.onclose = () => {
      this.connected = false;
    };

    this.ws.onerror = (e) => {
      console.error('WebSocket error', e);
    };
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
