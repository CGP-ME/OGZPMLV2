PushNotificationServer.js
// mobile/pushNotificationService.js
const admin = require('firebase-admin');

class PushNotificationService {
  constructor(config = {}) {
    this.config = {
      serviceAccount: process.env.FIREBASE_SERVICE_ACCOUNT,
      databaseURL: process.env.FIREBASE_DATABASE_URL,
      ...config
    };

    if (this.config.serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(this.config.serviceAccount)),
        databaseURL: this.config.databaseURL
      });
    }

    this.tokens = new Map();
  }

  async registerDevice(userId, token, platform = 'ios') {
    this.tokens.set(userId, { token, platform });
    // Store in database for persistence
    return true;
  }

  async sendNotification(userId, notification) {
    const userToken = this.tokens.get(userId);
    if (!userToken) return false;

    const message = {
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: notification.data || {},
      token: userToken.token
    };

    try {
      const response = await admin.messaging().send(message);
      console.log('Push notification sent:', response);
      return true;
    } catch (error) {
      console.error('Push notification error:', error);
      return false;
    }
  }

  async sendMulticast(userIds, notification) {
    const tokens = userIds
      .map(id => this.tokens.get(id)?.token)
      .filter(Boolean);

    if (tokens.length === 0) return;

    const message = {
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: notification.data || {},
      tokens
    };

    try {
      const response = await admin.messaging().sendMulticast(message);
      console.log(`Sent to ${response.successCount} devices`);
      return response;
    } catch (error) {
      console.error('Multicast error:', error);
    }
  }
}

module.exports = PushNotificationService;