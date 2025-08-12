// Test notification system locally
const NotificationSystem = require('./notification_system');

async function testNotifications() {
    console.log('🧪 Testing Tax Sale Notification System');
    console.log('=====================================');
    
    // Initialize notification system
    const notifier = new NotificationSystem();
    
    // Show current configuration
    console.log('\n📋 Current Configuration:');
    Object.keys(notifier.config).forEach(method => {
        const config = notifier.config[method];
        console.log(`  ${method}: ${config.enabled ? '✅ Enabled' : '❌ Disabled'}`);
        
        if (config.enabled && method !== 'console') {
            // Show if properly configured (without revealing secrets)
            const configured = method === 'email' ? !!config.to :
                             method === 'webhook' ? !!config.url :
                             method === 'slack' ? !!config.webhook :
                             method === 'file' ? !!config.logPath : false;
            console.log(`    Configured: ${configured ? '✅' : '❌'}`);
        }
    });
    
    console.log('\n🔔 Sending test notification...\n');
    
    // Send test notification
    try {
        await notifier.notifyPDFChange('chatham', {
            oldHash: 'abc123456789...',
            newHash: 'def987654321...',
            url: 'https://cms.chathamcountyga.gov/api/assets/taxcommissioner/test.pdf',
            totalProperties: 247,
            newProperties: 12,
            removedProperties: 3,
            isNewFile: false,
            addedPropertyIds: ['20103-03018', '20141-01017', '19045-12032'],
            removedPropertyIds: ['18023-05011', '17056-08009'],
            geocodeStats: { successful: 230, total: 247, fromCache: 200, newlyGeocoded: 30 }
        });
        
        console.log('\n✅ Test completed successfully!');
        console.log('\nNext steps:');
        console.log('1. Check your email/Slack/webhook endpoint for the test notification');
        console.log('2. If using file logging, check the notification log file');
        console.log('3. Configure additional notification methods in .env if needed');
        console.log('4. Deploy to Render and add environment variables there');
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.log('\nTroubleshooting:');
        console.log('1. Check your .env file configuration');
        console.log('2. Install nodemailer if using email: npm install nodemailer');
        console.log('3. Verify your SMTP/webhook/Slack settings');
    }
}

// Run the test
testNotifications().catch(console.error);
