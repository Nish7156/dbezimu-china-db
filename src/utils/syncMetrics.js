// Sync Metrics Tracker - Track sync latency and statistics

class SyncMetrics {
  constructor() {
    // Store last 100 sync events per direction
    this.metrics = {
      'china-to-india': [],
      'india-to-china': []
    };
    this.maxEvents = 100;
    
    // Store per-product/record sync times
    this.recordSyncTimes = new Map(); // "tableName:recordId" -> syncData
  }

  // Record a sync event
  recordSync(source, destination, tableName, recordId, latencyMs) {
    const direction = `${source}-to-${destination}`;
    const event = {
      timestamp: new Date(),
      source,
      destination,
      tableName,
      recordId,
      latencyMs: Math.round(latencyMs),
      date: new Date().toISOString()
    };

    if (!this.metrics[direction]) {
      this.metrics[direction] = [];
    }

    // Add event
    this.metrics[direction].push(event);

    // Keep only last maxEvents
    if (this.metrics[direction].length > this.maxEvents) {
      this.metrics[direction].shift();
    }

    // Store per-record sync time
    const key = `${tableName}:${recordId}`;
    this.recordSyncTimes.set(key, {
      latencyMs: Math.round(latencyMs),
      timestamp: new Date(),
      tableName,
      recordId,
      direction,
      source,
      destination
    });

    // Clean old entries (keep last 1000)
    if (this.recordSyncTimes.size > 1000) {
      const firstKey = this.recordSyncTimes.keys().next().value;
      this.recordSyncTimes.delete(firstKey);
    }

    console.log(`⏱️  Sync Latency: ${source} → ${destination} | ${tableName}#${recordId} | ${latencyMs}ms`);
  }

  // Get per-record sync time
  getRecordSyncTime(tableName, recordId) {
    const key = `${tableName}:${recordId}`;
    const syncData = this.recordSyncTimes.get(key);
    
    if (!syncData) {
      return null;
    }
    
    const timeAgo = Math.floor((new Date() - syncData.timestamp) / 1000); // seconds ago
    
    return {
      latencyMs: syncData.latencyMs,
      timestamp: syncData.timestamp,
      direction: syncData.direction,
      timeAgo,
      source: syncData.source,
      destination: syncData.destination
    };
  }

  // Get statistics for a direction
  getStats(direction) {
    const events = this.metrics[direction] || [];
    
    if (events.length === 0) {
      return {
        totalSyncs: 0,
        avgLatencyMs: 0,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        lastSyncTime: null,
        lastSyncLatencyMs: 0,
        syncsLastMinute: 0,
        avgLastMinuteMs: 0,
        recentSyncs: []
      };
    }

    // Calculate statistics
    const latencies = events.map(e => e.latencyMs);
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);

    // Recent syncs (last minute)
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    const recentEvents = events.filter(e => e.timestamp.getTime() > oneMinuteAgo);
    const syncsLastMinute = recentEvents.length;
    
    // Average latency for last minute
    const avgLastMinute = recentEvents.length > 0
      ? Math.round(recentEvents.reduce((a, b) => a + b.latencyMs, 0) / recentEvents.length)
      : 0;

    // Last sync
    const lastSync = events[events.length - 1];

    return {
      totalSyncs: events.length,
      avgLatencyMs: Math.round(avgLatency),
      minLatencyMs: minLatency,
      maxLatencyMs: maxLatency,
      lastSyncTime: lastSync.timestamp,
      lastSyncLatencyMs: lastSync.latencyMs,
      syncsLastMinute,
      avgLastMinuteMs: avgLastMinute,
      recentSyncs: events.slice(-10).reverse().map(e => ({
        table: e.tableName,
        recordId: e.recordId,
        latencyMs: e.latencyMs,
        time: e.date,
        timestamp: e.timestamp
      }))
    };
  }

  // Get stats for India (receives from China)
  getIndiaStats() {
    return {
      direction: 'china-to-india',
      receives_from: 'china',
      ...this.getStats('china-to-india')
    };
  }

  // Get stats for China (receives from India)
  getChinaStats() {
    return {
      direction: 'india-to-china',
      receives_from: 'india',
      ...this.getStats('india-to-china')
    };
  }

  // Get all stats
  getAllStats() {
    return {
      'china-to-india': this.getStats('china-to-india'),
      'india-to-china': this.getStats('india-to-china'),
      timestamp: new Date().toISOString()
    };
  }
}

// Singleton instance
const syncMetrics = new SyncMetrics();

module.exports = {
  syncMetrics
};
