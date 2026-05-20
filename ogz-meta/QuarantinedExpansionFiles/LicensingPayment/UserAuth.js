UserAuth.js
// monetization/userAuth.js
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class UserAuth {
  constructor(config = {}) {
    this.config = {
      jwtSecret: process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex'),
      tokenExpiry: '30d',
      saltRounds: 10,
      ...config
    };
  }

  async hashPassword(password) {
    return bcrypt.hash(password, this.config.saltRounds);
  }

  async verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
  }

  generateToken(userId, email, modules = []) {
    return jwt.sign(
      { userId, email, modules, iat: Date.now() },
      this.config.jwtSecret,
      { expiresIn: this.config.tokenExpiry }
    );
  }

  verifyToken(token) {
    try {
      return jwt.verify(token, this.config.jwtSecret);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      }
      throw new Error('Invalid token');
    }
  }

  generateResetToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  generateApiKey() {
    const prefix = 'ogzp';
    const key = crypto.randomBytes(32).toString('hex');
    return `${prefix}_${key}`;
  }
}

module.exports = UserAuth;