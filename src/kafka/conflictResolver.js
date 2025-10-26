const { pool } = require('../database/dbConnection');
const { Kafka } = require('kafkajs');
const { syncMetrics } = require('../utils/syncMetrics');
const config = require('../config/config');

const kafka = new Kafka({
  clientId: config.kafka.clientId || 'india-resolver',
  brokers: [config.kafka.broker]
});

const producer = kafka.producer();
let producerConnected = false;

async function ensureProducerConnected() {
  if (!producerConnected) {
    await producer.connect();
    producerConnected = true;
    console.log('✅ Kafka producer connected for conflict resolution');
  }
}

/**
 * Resolve conflicts using Last-Write-Wins strategy based on updated_at timestamp
 * This function determines if an incoming change should be applied to the destination database
 */
async function resolveConflict({ topic, key, value, source, destination }) {
  const syncStartTime = Date.now(); // Track when sync processing started
  
  try {
    await ensureProducerConnected();

    // Extract table name from topic (e.g., 'sync.users' -> 'users')
    const tableName = topic.replace('sync.', '');
    
    // Extract the actual data from Debezium envelope
    const newData = value.payload?.after || value.after || value;
    const operation = value.payload?.op || value.op || 'u'; // c=create, u=update, d=delete
    
    // Calculate sync latency (time since record was created/updated in source)
    let sourceTimestamp = null;
    if (newData.updated_at) {
      // Handle both timestamp formats (milliseconds and microseconds)
      const ts = newData.updated_at;
      if (typeof ts === 'number' && ts > 100000000000) {
        // Debezium sends microseconds, convert to milliseconds
        sourceTimestamp = Math.floor(ts / 1000);
      } else {
        sourceTimestamp = new Date(ts).getTime();
      }
    } else if (newData.created_at) {
      const ts = newData.created_at;
      if (typeof ts === 'number' && ts > 100000000000) {
        sourceTimestamp = Math.floor(ts / 1000);
      } else {
        sourceTimestamp = new Date(ts).getTime();
      }
    }
    
    if (!newData && operation !== 'd') {
      console.log('⚠️  No data to sync, skipping');
      return;
    }

    // Use India database pool (this backend only handles India)
    const destPool = pool;
    
    // Check if record exists in destination
    const recordId = key?.id || newData?.id;
    if (!recordId) {
      console.log('⚠️  No record ID found, skipping');
      return;
    }

    const existingRecord = await destPool.query(
      `SELECT * FROM ${tableName} WHERE id = $1`,
      [recordId]
    );

    // CONFLICT RESOLUTION LOGIC WITH LOOP PREVENTION
    let shouldApply = false;
    let conflictReason = '';

    if (existingRecord.rows.length === 0) {
      // New record - always apply
      shouldApply = true;
      conflictReason = 'new_record';
    } else if (operation === 'd') {
      // Delete operation
      shouldApply = true;
      conflictReason = 'delete_operation';
    } else {
      // Record exists - apply Last-Write-Wins strategy with loop prevention
      const existingRecord_data = existingRecord.rows[0];
      const existingUpdatedAt = new Date(existingRecord_data.updated_at);
      let incomingUpdatedAt;
      
      // Handle timestamp conversion
      if (typeof newData.updated_at === 'number' && newData.updated_at > 100000000000) {
        incomingUpdatedAt = new Date(Math.floor(newData.updated_at / 1000));
      } else {
        incomingUpdatedAt = new Date(newData.updated_at);
      }
      
      // Calculate time difference for loop detection
      const timeDiff = Math.abs(incomingUpdatedAt.getTime() - existingUpdatedAt.getTime());
      
      // LOOP PREVENTION: If timestamps are too close (< 1 second), likely a loop
      if (timeDiff < 1000) {
        shouldApply = false;
        conflictReason = 'loop_prevention_rapid_update';
        console.log(`🔄 Loop prevented: Time diff ${timeDiff}ms < 1000ms`);
        return; // Exit early to prevent loop
      }
      
      if (incomingUpdatedAt > existingUpdatedAt) {
        shouldApply = true;
        conflictReason = 'newer_timestamp';
      } else if (timeDiff < 100) {
        // Timestamps are essentially the same, use version
        const existingVersion = existingRecord_data.version || 0;
        const incomingVersion = newData.version || 0;
        
        if (incomingVersion > existingVersion) {
          shouldApply = true;
          conflictReason = 'higher_version';
        } else {
          shouldApply = false;
          conflictReason = 'same_or_older_version';
        }
      } else {
        shouldApply = false;
        conflictReason = 'older_timestamp';
      }
    }

    console.log(`🔍 Conflict Resolution for ${tableName}#${recordId}:`);
    console.log(`   Decision: ${shouldApply ? '✅ APPLY' : '❌ SKIP'}`);
    console.log(`   Reason: ${conflictReason}`);

    if (shouldApply) {
      // Write directly to destination database
      if (operation === 'd') {
        // Delete operation
        await destPool.query(
          `DELETE FROM ${tableName} WHERE id = $1`,
          [recordId]
        );
        console.log(`✅ Record deleted from ${destination} DB`);
      } else {
        // Insert or Update operation
        // 🔒 PRIVACY PROTECTION: Strip user-identifying fields but handle foreign keys properly
        const allColumns = Object.keys(newData).filter(k => !k.startsWith('_'));
        
        // Define fields with personal information that should NEVER cross regions
        const PRIVATE_FIELDS = [
          // User personal information (in case of accidental denormalization)
          'username',
          'email',
          'full_name',
          'phone',
          'user_email',
          'user_phone',
          'user_name',
          'creator_name',
          'creator_email',
          'creator_phone',
          'salesperson_name',
          'salesperson_email',
          'salesperson_phone'
        ];
        
        // For foreign keys, we'll NULL them instead of removing from query
        const FOREIGN_KEY_FIELDS = [
          'created_by_user_id',
          'salesperson_user_id'
        ];
        
        // Keep all columns but we'll handle private data specially
        const columns = allColumns.filter(col => !PRIVATE_FIELDS.includes(col));
        
        // Log which fields were removed for transparency
        const removedFields = allColumns.filter(col => PRIVATE_FIELDS.includes(col));
        if (removedFields.length > 0) {
          console.log(`🔒 PRIVACY: Stripped ${removedFields.length} private field(s): ${removedFields.join(', ')}`);
        } else {
          console.log(`🔒 PRIVACY: No private fields detected in this sync`);
        }
        
        // Convert Debezium timestamps and dates to proper formats
        // Set foreign keys to NULL for privacy (user IDs from other region)
        const values = columns.map(col => {
          const value = newData[col];
          
          // NULL out foreign keys pointing to users in other regions (PRIVACY)
          if (FOREIGN_KEY_FIELDS.includes(col)) {
            console.log(`🔒 PRIVACY: Setting ${col} to NULL (was ${value})`);
            return null;
          }
          
          // Handle DATE fields (days since epoch - typically numbers < 100000)
          if (col.includes('date') && typeof value === 'number' && value < 100000) {
            // Convert days since epoch (1970-01-01) to date
            const date = new Date(1970, 0, 1);
            date.setDate(date.getDate() + value);
            return date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
          }
          
          // Handle TIMESTAMP fields (microseconds since epoch - large numbers)
          if (typeof value === 'number' && value > 100000000000) {
            // Convert microseconds to milliseconds
            return new Date(Math.floor(value / 1000));
          }
          
          return value;
        });
        
        const placeholders = columns.map((_, i) => `$${i + 1}`);
        
        // For conflict (update), exclude columns that are already being set
        const updateColumns = columns.filter(col => col !== 'sync_source' && col !== 'updated_at');
        const conflictSet = updateColumns.map((col, i) => {
          const valueIndex = columns.indexOf(col) + 1;
          return `${col} = $${valueIndex}`;
        }).join(', ');
        
        // For updates, preserve original sync_source (don't change it)
        // Only set sync_source on INSERT (new records)
        const query = `
          INSERT INTO ${tableName} (${columns.join(', ')})
          VALUES (${placeholders.join(', ')})
          ON CONFLICT (id) DO UPDATE SET
          ${conflictSet}${conflictSet ? ',' : ''}
          updated_at = NOW()
        `;
        
        await destPool.query(query, values);
        console.log(`✅ Record ${operation === 'c' ? 'inserted' : 'updated'} in ${destination} DB`);
        
        // Record sync metrics
        const syncEndTime = Date.now();
        const syncLatency = sourceTimestamp ? (syncEndTime - sourceTimestamp) : (syncEndTime - syncStartTime);
        syncMetrics.recordSync(source, destination, tableName, recordId, syncLatency);
      }
    } else {
      console.log(`⏭️  Change skipped due to: ${conflictReason}`);
    }

  } catch (error) {
    console.error('❌ Conflict resolution error:', error);
    // In production, you might want to send to a dead-letter queue
  }
}

module.exports = {
  resolveConflict
};

