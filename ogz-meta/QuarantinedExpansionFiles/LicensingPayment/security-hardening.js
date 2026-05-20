// ==========================================
// OGZ PRIME SECURITY HARDENING SYSTEM
// Comprehensive security implementation
// ==========================================

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const compression = require('compression');

// Security Headers Configuration
const securityHeaders = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://js.stripe.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            connectSrc: ["'self'", "https://api.stripe.com", "https://api.paypal.com", "wss:", "ws:"],
            mediaSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com", "https://www.paypal.com"]
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'same-origin' }
});

// Rate Limiting Configuration
const createRateLimit = (windowMs, max, message) => rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        console.log(`🚨 Rate limit exceeded: ${req.ip} - ${req.originalUrl}`);
        res.status(429).json({
            error: message,
            retryAfter: Math.round(windowMs / 1000)
        });
    }
});

// Different rate limits for different endpoints
const rateLimits = {
    // General API rate limit
    general: createRateLimit(15 * 60 * 1000, 100, 'Too many requests, please try again later'),
    
    // Strict rate limit for payment endpoints
    payment: createRateLimit(15 * 60 * 1000, 5, 'Too many payment attempts, please wait before trying again'),
    
    // Authentication rate limit
    auth: createRateLimit(15 * 60 * 1000, 10, 'Too many login attempts, please wait before trying again'),
    
    // WebSocket connection rate limit
    websocket: createRateLimit(5 * 60 * 1000, 20, 'Too many connection attempts, please wait')
};

// CORS Configuration
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = [
            'https://ogzprime.com',
            'https://www.ogzprime.com',
            'https://dashboard.ogzprime.com',
            'http://localhost:3000',
            'http://localhost:3001',
            'http://localhost:3010',
            'http://localhost:3011',
            'http://127.0.0.1:3000',
            'http://127.0.0.1:3001',
            'http://127.0.0.1:3010',
            'http://127.0.0.1:3011'
        ];
        
        if (process.env.NODE_ENV === 'development') {
            // Allow all origins in development
            return callback(null, true);
        }
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log(`🚨 Blocked CORS request from: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Input Sanitization
const sanitizeInput = (input) => {
    if (typeof input !== 'string') return input;
    
    return input
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove scripts
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, '') // Remove event handlers
        .trim()
        .substring(0, 1000); // Limit length
};

// Request validation middleware
const validateRequest = (req, res, next) => {
    // Sanitize all string inputs
    const sanitizeObject = (obj) => {
        for (let key in obj) {
            if (obj[key] && typeof obj[key] === 'object') {
                sanitizeObject(obj[key]);
            } else if (typeof obj[key] === 'string') {
                obj[key] = sanitizeInput(obj[key]);
            }
        }
    };
    
    if (req.body) sanitizeObject(req.body);
    if (req.query) sanitizeObject(req.query);
    if (req.params) sanitizeObject(req.params);
    
    next();
};

// Security logging middleware
const securityLogger = (req, res, next) => {
    const start = Date.now();
    
    // Log suspicious patterns
    const suspiciousPatterns = [
        /\.\./,           // Path traversal
        /<script/i,       // XSS attempts
        /union.*select/i, // SQL injection
        /javascript:/i,   // JavaScript protocol
        /vbscript:/i,     // VBScript protocol
        /data:.*base64/i  // Base64 data URLs
    ];
    
    const fullUrl = req.originalUrl || req.url;
    const userAgent = req.get('User-Agent') || '';
    const body = JSON.stringify(req.body);
    
    let isSuspicious = false;
    suspiciousPatterns.forEach(pattern => {
        if (pattern.test(fullUrl) || pattern.test(userAgent) || pattern.test(body)) {
            isSuspicious = true;
        }
    });
    
    if (isSuspicious) {
        console.log(`🚨 SUSPICIOUS REQUEST DETECTED:`);
        console.log(`   IP: ${req.ip}`);
        console.log(`   Method: ${req.method}`);
        console.log(`   URL: ${fullUrl}`);
        console.log(`   User-Agent: ${userAgent}`);
        console.log(`   Body: ${body}`);
        console.log(`   Timestamp: ${new Date().toISOString()}`);
    }
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        
        // Log slow requests (potential DoS)
        if (duration > 5000) {
            console.log(`⚠️  SLOW REQUEST: ${req.method} ${fullUrl} took ${duration}ms`);
        }
    });
    
    next();
};

// Environment validation
const validateEnvironment = () => {
    const requiredVars = [
        'STRIPE_SECRET_KEY',
        'POLYGON_API_KEY',
        'ELEVENLABS_API_KEY'
    ];
    
    const missing = requiredVars.filter(varName => !process.env[varName]);
    
    if (missing.length > 0) {
        console.error(`🚨 SECURITY WARNING: Missing environment variables:`);
        missing.forEach(varName => console.error(`   - ${varName}`));
        console.error(`   This could expose sensitive functionality or cause crashes.`);
        
        if (process.env.NODE_ENV === 'production') {
            console.error(`🚨 EXITING: Cannot run in production without required environment variables`);
            process.exit(1);
        }
    }
    
    // Check for default/example values
    const defaultChecks = {
        'STRIPE_SECRET_KEY': ['pk_test_', 'sk_test_'],
        'BTC_WALLET_ADDRESS': ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'] // Genesis block address
    };
    
    Object.entries(defaultChecks).forEach(([varName, defaults]) => {
        const value = process.env[varName];
        if (value && defaults.some(def => value.includes(def))) {
            console.warn(`⚠️  WARNING: ${varName} appears to use default/test value`);
        }
    });
};

// Apply all security middleware to an Express app
const applySecurity = (app) => {
    console.log('🛡️  Applying OGZ Prime Security Hardening...');
    
    // Validate environment first
    validateEnvironment();
    
    // Trust proxy (for accurate IP addresses behind load balancer)
    app.set('trust proxy', 1);
    
    // Compression
    app.use(compression({
        level: 6,
        threshold: 1024,
        filter: (req, res) => {
            if (req.headers['x-no-compression']) return false;
            return compression.filter(req, res);
        }
    }));
    
    // Security headers
    app.use(securityHeaders);
    
    // CORS
    app.use(cors(corsOptions));
    
    // Request validation and sanitization
    app.use(validateRequest);
    
    // Security logging
    app.use(securityLogger);
    
    // Rate limiting for different endpoint types
    app.use('/create-checkout-session', rateLimits.payment);
    app.use('/create-paypal-payment', rateLimits.payment);
    app.use('/create-btc-payment', rateLimits.payment);
    app.use('/webhook', rateLimits.auth);
    app.use('/ws', rateLimits.websocket);
    app.use(rateLimits.general);
    
    // Hide Express server information
    app.disable('x-powered-by');
    
    // Graceful shutdown handling
    process.on('SIGTERM', () => {
        console.log('🛡️  Security: Received SIGTERM, shutting down gracefully');
        process.exit(0);
    });
    
    process.on('SIGINT', () => {
        console.log('🛡️  Security: Received SIGINT, shutting down gracefully');
        process.exit(0);
    });
    
    // Global error handler
    app.use((err, req, res, next) => {
        console.error(`🚨 SECURITY ERROR: ${err.message}`);
        console.error(`   URL: ${req.originalUrl}`);
        console.error(`   IP: ${req.ip}`);
        console.error(`   Stack: ${err.stack}`);
        
        // Don't leak error details in production
        if (process.env.NODE_ENV === 'production') {
            res.status(500).json({ error: 'Internal server error' });
        } else {
            res.status(500).json({ error: err.message, stack: err.stack });
        }
    });
    
    console.log('✅ OGZ Prime Security Hardening Applied');
    console.log('🛡️  Security Features Enabled:');
    console.log('   - Content Security Policy');
    console.log('   - Rate Limiting (tiered)');
    console.log('   - Request Sanitization');
    console.log('   - CORS Protection');
    console.log('   - Security Headers');
    console.log('   - Suspicious Activity Logging');
    console.log('   - Input Validation');
    console.log('   - Environment Validation');
};

module.exports = {
    applySecurity,
    rateLimits,
    corsOptions,
    securityHeaders,
    validateRequest,
    securityLogger,
    validateEnvironment,
    sanitizeInput
};