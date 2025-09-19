// Kafka POC - Runs parallel to existing system
const { Kafka } = require('kafkajs');

// Kafka configuration
const kafka = new Kafka({
  clientId: 'settlepaisa-poc',
  brokers: ['localhost:9092'],
  retry: {
    retries: 3
  }
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: 'recon-group' });

// Initialize Kafka (if broker is running)
async function initKafka() {
  try {
    await producer.connect();
    await consumer.connect();
    
    // Create topics
    const admin = kafka.admin();
    await admin.connect();
    
    await admin.createTopics({
      topics: [
        { topic: 'recon.jobs', numPartitions: 3 },
        { topic: 'recon.results', numPartitions: 3 },
        { topic: 'payment.events', numPartitions: 5 }
      ]
    });
    
    console.log('✅ Kafka POC initialized');
    await admin.disconnect();
    
    // Subscribe to topics
    await consumer.subscribe({ 
      topics: ['recon.jobs'], 
      fromBeginning: true 
    });
    
    // Process messages
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        console.log({
          topic,
          partition,
          value: message.value.toString()
        });
      }
    });
    
  } catch (error) {
    console.log('❌ Kafka not available - running without streaming');
    console.log('To enable: docker-compose up -d kafka zookeeper');
    return false;
  }
}

// Wrapper to publish events (won't break if Kafka is down)
async function publishEvent(topic, event) {
  try {
    if (producer) {
      await producer.send({
        topic,
        messages: [
          { value: JSON.stringify(event) }
        ]
      });
    }
  } catch (error) {
    // Silently fail - don't break main flow
    console.log('Kafka publish failed, continuing without streaming');
  }
}

module.exports = {
  initKafka,
  publishEvent,
  producer,
  consumer
};