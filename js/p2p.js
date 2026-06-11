export class P2PService {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.onMessage = null;
  }

  host() {
    return new Promise((resolve, reject) => {
      const id = `ptcg-${Math.random().toString(36).slice(2, 8)}`;
      this.peer = new Peer(id, { debug: 0 });
      this.peer.on('open', () => resolve(id));
      this.peer.on('error', reject);
      this.peer.on('connection', (conn) => this.setupConnection(conn));
    });
  }

  join(hostId) {
    return new Promise((resolve, reject) => {
      this.peer = new Peer(`ptcg-${Math.random().toString(36).slice(2, 8)}`, { debug: 0 });
      this.peer.on('open', () => {
        const conn = this.peer.connect(hostId, { reliable: true });
        this.setupConnection(conn);
        conn.on('open', () => resolve());
      });
      this.peer.on('error', reject);
    });
  }

  setupConnection(conn) {
    this.conn = conn;
    conn.on('data', (data) => { if (this.onMessage) this.onMessage(data); });
  }

  send(msg) { this.conn?.send(msg); }
  onData(handler) { this.onMessage = handler; }

  destroy() {
    this.conn?.close();
    this.peer?.destroy();
    this.conn = null;
    this.peer = null;
  }
}
