const { Kafka } = require('kafkajs');
const { resolveConflict } = require('./conflictResolver');
const config = require('../config/config');

const kafka = new Kafka({
  clientId: config.kafka.clientId || 'china-backend',
  brokers: [config.kafka.broker],
  retry: {
    initialRetryTime: 300,
    retries: 15,
    maxRetryTime: 30000,
    multiplier: 2
  }
});

// China consumer - only processes changes FROM India
const consumer = kafka.consumer({ 
  groupId: config.kafka.groupId || 'china-sync-consumer',
  sessionTimeout: 30000,
  heartbeatInterval: 3000
});

async function initKafkaConsumers() {
  try {
    console.log('🔌 Connecting to Kafka...');
    
    // Subscribe to topics from both sources (including sales)
    await consumer.connect();
    await consumer.subscribe({ 
      topics: ['sync.users', 'sync.products', 'sync.sales'],
      fromBeginning: false 
    });

    console.log('✅ Kafka consumer connected');

    // Run consumer
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        await handleMessage(topic, message);
      },
    });

    console.log('✅ Kafka consumer running and listening for changes...');
  } catch (error) {
    console.error('❌ Failed to initialize Kafka consumer:', error);
    throw error;
  }
}

async function handleMessage(topic, message) {
  try {
    const key = message.key ? JSON.parse(message.key.toString()) : null;
    const value = message.value ? JSON.parse(message.value.toString()) : null;

    if (!value) {
      console.log(`⏭️  Skipping tombstone message`);
      return;
    }

    // Extract sync origin to prevent loops
    const syncOrigin = value.payload?._sync_origin || value._sync_origin;
    
    if (!syncOrigin) {
      console.log(`⚠️  No sync origin found, skipping`);
      return;
    }

    // Determine source and destination based on sync origin
    const source = syncOrigin;
    const destination = source === 'india' ? 'china' : 'india';

    // Extract table name from topic
    const tableName = topic.replace('sync.', '');

    // 🔒 PRIVACY & DIRECTIONAL SYNC RULES
    // Users: NO SYNC (privacy - each region keeps their own users)
    // Products: One-way (china → india for new products, india → china for stock updates)
    // Sales: One-way (india → china only, NO user details exposed)
    
    if (tableName === 'users') {
      console.log(`🔒🔒🔒 PRIVACY BLOCK: Users table sync prevented!`);
      console.log(`   → User data (names, emails, phones) NEVER crosses regions`);
      console.log(`   → India users stay in India DB`);
      console.log(`   → China users stay in China DB`);
      return;
    }
    
    // Special handling for products from India
    if (tableName === 'products' && source === 'india') {
      // Check if this is a stock update (operation = update)
      const operation = value.payload?.op || value.op || 'u';
      
      if (operation === 'c') {
        // Block product creation from India
        console.log(`🚫 DIRECTIONAL BLOCK: Product creation from India prevented`);
        console.log(`   → New products can only be created in China`);
        return;
      }
      
      // Allow updates (stock changes) from India → China
      console.log(`📦 STOCK UPDATE: Allowing product update from India → China`);
      console.log(`   → Stock quantity changes sync back to China for inventory management`);
    }
    
    if (tableName === 'sales' && source === 'china') {
      console.log(`🚫 DIRECTIONAL BLOCK: Sales sync from China prevented`);
      console.log(`   → Sales only sync: India → China (one-way)`);
      return;
    }

    // China backend only processes changes coming TO China (from India)
    if (destination !== 'china') {
      console.log(`⏭️  Skipping - not for China region`);
      return;
    }

    console.log(`📨 [CHINA] Processing ${topic} change from ${source}`);
    console.log(`   Record ID: ${key?.id || 'unknown'}`);
    console.log(`   Operation: ${value.op || value.payload?.op || 'unknown'}`);
    console.log(`   Sync Origin: ${syncOrigin}`);
    console.log(`   🔒 Privacy Mode: ALL user data (names, emails, phones, IDs) will be stripped`);

    // Apply conflict resolution logic
    await resolveConflict({
      topic,
      key,
      value,
      source,
      destination
    });

  } catch (error) {
    console.error(`❌ Error processing message:`, error);
  }
}

module.exports = {
  initKafkaConsumers
};

