// PDF Change Notification System
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class NotificationSystem {
    constructor() {
        this.notificationMethods = {
            console: this.consoleNotification,
            email: this.emailNotification,
            webhook: this.webhookNotification,
            file: this.fileNotification,
            slack: this.slackNotification
        };
        
        this.config = {
            email: {
                enabled: process.env.EMAIL_NOTIFICATIONS === 'true',
                to: process.env.NOTIFICATION_EMAIL,
                from: process.env.FROM_EMAIL,
                smtp: {
                    host: process.env.SMTP_HOST,
                    port: process.env.SMTP_PORT,
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            },
            webhook: {
                enabled: process.env.WEBHOOK_NOTIFICATIONS === 'true',
                url: process.env.WEBHOOK_URL,
                secret: process.env.WEBHOOK_SECRET
            },
            slack: {
                enabled: process.env.SLACK_NOTIFICATIONS === 'true',
                webhook: process.env.SLACK_WEBHOOK_URL,
                channel: process.env.SLACK_CHANNEL || '#tax-sale-updates'
            },
            file: {
                enabled: process.env.FILE_NOTIFICATIONS === 'true',
                logPath: process.env.NOTIFICATION_LOG_PATH || './notifications.log'
            },
            console: {
                enabled: true // Always enabled
            }
        };
    }

    async notifyPDFChange(county, changeDetails) {
        const notification = {
            timestamp: new Date().toISOString(),
            county: county,
            type: 'PDF_CHANGE',
            details: changeDetails,
            message: `🚨 PDF file changed for ${county} county!`,
            data: {
                oldHash: changeDetails.oldHash,
                newHash: changeDetails.newHash,
                url: changeDetails.url,
                totalProperties: changeDetails.totalProperties,
                newProperties: changeDetails.newProperties,
                removedProperties: changeDetails.removedProperties
            }
        };

        console.log(`📢 Sending notifications for PDF change in ${county}...`);

        // Send notifications via all enabled methods
        const promises = [];
        
        for (const [method, handler] of Object.entries(this.notificationMethods)) {
            if (this.config[method]?.enabled) {
                promises.push(
                    handler.call(this, notification).catch(error => {
                        console.error(`❌ ${method} notification failed:`, error.message);
                    })
                );
            }
        }

        await Promise.allSettled(promises);
        console.log('✅ All notifications sent');
    }

    async consoleNotification(notification) {
        console.log('\n' + '='.repeat(60));
        console.log('🚨 PDF CHANGE ALERT');
        console.log('='.repeat(60));
        console.log(`📅 Time: ${notification.timestamp}`);
        console.log(`🏛️ County: ${notification.county.toUpperCase()}`);
        console.log(`📊 Total Properties: ${notification.data.totalProperties}`);
        console.log(`🆕 New Properties: ${notification.data.newProperties}`);
        console.log(`🗑️ Removed Properties: ${notification.data.removedProperties}`);
        console.log(`🔗 URL: ${notification.data.url}`);
        console.log(`🏷️ Old Hash: ${notification.data.oldHash?.substring(0, 12)}...`);
        console.log(`🏷️ New Hash: ${notification.data.newHash?.substring(0, 12)}...`);
        console.log('='.repeat(60));
    }

    async fileNotification(notification) {
        const logEntry = `[${notification.timestamp}] PDF_CHANGE: ${notification.county} - Total: ${notification.data.totalProperties}, New: ${notification.data.newProperties}, Removed: ${notification.data.removedProperties}\n`;
        
        try {
            await fs.promises.appendFile(this.config.file.logPath, logEntry);
            console.log(`📝 Notification logged to ${this.config.file.logPath}`);
        } catch (error) {
            console.error('❌ File notification failed:', error.message);
        }
    }

    async emailNotification(notification) {
        if (!this.config.email.to) {
            console.log('⚠️ No email address configured for notifications');
            return;
        }

        // Note: You'll need to install nodemailer: npm install nodemailer
        try {
            const nodemailer = require('nodemailer');
            
            const transporter = nodemailer.createTransporter({
                host: this.config.email.smtp.host,
                port: this.config.email.smtp.port,
                secure: this.config.email.smtp.port === 465,
                auth: {
                    user: this.config.email.smtp.user,
                    pass: this.config.email.smtp.pass
                }
            });

            const htmlContent = `
                <h2>🚨 Tax Sale PDF Update Alert</h2>
                <p><strong>County:</strong> ${notification.county.toUpperCase()}</p>
                <p><strong>Time:</strong> ${new Date(notification.timestamp).toLocaleString()}</p>
                <p><strong>Total Properties:</strong> ${notification.data.totalProperties}</p>
                <p><strong>New Properties:</strong> ${notification.data.newProperties}</p>
                <p><strong>Removed Properties:</strong> ${notification.data.removedProperties}</p>
                <p><strong>PDF URL:</strong> <a href="${notification.data.url}">View PDF</a></p>
                <hr>
                <p><em>This is an automated notification from your Tax Sale Monitoring System</em></p>
            `;

            await transporter.sendMail({
                from: this.config.email.from,
                to: this.config.email.to,
                subject: `🚨 Tax Sale Update: ${notification.county.toUpperCase()} County`,
                html: htmlContent
            });

            console.log(`📧 Email notification sent to ${this.config.email.to}`);
        } catch (error) {
            if (error.code === 'MODULE_NOT_FOUND') {
                console.log('⚠️ nodemailer not installed. Run: npm install nodemailer');
            } else {
                console.error('❌ Email notification failed:', error.message);
            }
        }
    }

    async webhookNotification(notification) {
        if (!this.config.webhook.url) {
            console.log('⚠️ No webhook URL configured');
            return;
        }

        try {
            const fetch = require('node-fetch');
            
            const payload = {
                text: notification.message,
                county: notification.county,
                timestamp: notification.timestamp,
                data: notification.data
            };

            const response = await fetch(this.config.webhook.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'TaxSaleNotifier/1.0'
                },
                body: JSON.stringify(payload)
            });

            if (response.ok) {
                console.log('🎯 Webhook notification sent successfully');
            } else {
                console.error('❌ Webhook notification failed:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('❌ Webhook notification failed:', error.message);
        }
    }

    async slackNotification(notification) {
        if (!this.config.slack.webhook) {
            console.log('⚠️ No Slack webhook URL configured');
            return;
        }

        try {
            const fetch = require('node-fetch');
            
            const slackPayload = {
                channel: this.config.slack.channel,
                username: 'Tax Sale Bot',
                icon_emoji: ':warning:',
                attachments: [{
                    color: 'warning',
                    title: '🚨 Tax Sale PDF Updated',
                    fields: [
                        {
                            title: 'County',
                            value: notification.county.toUpperCase(),
                            short: true
                        },
                        {
                            title: 'Total Properties',
                            value: notification.data.totalProperties.toString(),
                            short: true
                        },
                        {
                            title: 'New Properties',
                            value: notification.data.newProperties.toString(),
                            short: true
                        },
                        {
                            title: 'Removed Properties',
                            value: notification.data.removedProperties.toString(),
                            short: true
                        },
                        {
                            title: 'PDF URL',
                            value: `<${notification.data.url}|View PDF>`,
                            short: false
                        }
                    ],
                    footer: 'Tax Sale Monitoring System',
                    ts: Math.floor(Date.now() / 1000)
                }]
            };

            const response = await fetch(this.config.slack.webhook, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(slackPayload)
            });

            if (response.ok) {
                console.log('💬 Slack notification sent successfully');
            } else {
                console.error('❌ Slack notification failed:', response.status);
            }
        } catch (error) {
            console.error('❌ Slack notification failed:', error.message);
        }
    }

    // Test all notification methods
    async testNotifications() {
        console.log('🧪 Testing notification system...');
        
        const testNotification = {
            timestamp: new Date().toISOString(),
            county: 'chatham',
            type: 'TEST',
            message: '🧪 This is a test notification',
            data: {
                oldHash: 'abc123...',
                newHash: 'def456...',
                url: 'https://example.com/test.pdf',
                totalProperties: 150,
                newProperties: 5,
                removedProperties: 2
            }
        };

        await this.notifyPDFChange('chatham', {
            oldHash: 'abc123...',
            newHash: 'def456...',
            url: 'https://example.com/test.pdf',
            totalProperties: 150,
            newProperties: 5,
            removedProperties: 2
        });
    }
}

module.exports = NotificationSystem;
