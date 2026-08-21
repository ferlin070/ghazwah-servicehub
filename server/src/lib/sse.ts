// lib/sse.ts — Server-Sent Events manager for real-time updates.
// Clients connect via GET /api/events, receive work order status changes.

type SSEClient = {
  userId: string;
  controller: ReadableStreamDefaultController;
};

class SSEManager {
  private clients: Map<string, SSEClient[]> = new Map();

  createStream(userId: string): ReadableStream {
    let controller: ReadableStreamDefaultController;
    const self = this;

    const stream = new ReadableStream({
      start(ctrl) {
        controller = ctrl;
        const client = { userId, controller };
        const existing = self.clients.get(userId) ?? [];
        existing.push(client);
        self.clients.set(userId, existing);

        // Send initial connection event
        const data = JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() });
        ctrl.enqueue(`data: ${data}\n\n`);
      },
      cancel() {
        self.removeClient(userId, controller);
      },
    });

    return stream;
  }

  private removeClient(userId: string, controller: ReadableStreamDefaultController) {
    const clients = this.clients.get(userId) ?? [];
    const filtered = clients.filter((c) => c.controller !== controller);
    if (filtered.length === 0) {
      this.clients.delete(userId);
    } else {
      this.clients.set(userId, filtered);
    }
  }

  broadcast(event: string, data: Record<string, unknown>, userIds?: string[]) {
    const payload = `data: ${JSON.stringify({ type: event, ...data, timestamp: new Date().toISOString() })}\n\n`;
    const targetUserIds = userIds ?? Array.from(this.clients.keys());

    for (const uid of targetUserIds) {
      const clients = this.clients.get(uid) ?? [];
      for (const client of clients) {
        try {
          client.controller.enqueue(payload);
        } catch {
          this.removeClient(uid, client.controller);
        }
      }
    }
  }

  sendTo(userId: string, event: string, data: Record<string, unknown>) {
    this.broadcast(event, data, [userId]);
  }
}

export const sseManager = new SSEManager();
