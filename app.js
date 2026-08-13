const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const compression = require('compression');
const helmet = require('helmet');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// SECURITY & PERFORMANCE MIDDLEWARE
// ============================================================
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(compression());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
// SESSION CONFIGURATION
// ============================================================
app.use(session({
    secret: process.env.SESSION_SECRET || 'shinex-super-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 365,
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        sameSite: 'lax'
    },
    name: 'shinex.sid'
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================================
// DEVICE DETECTION
// ============================================================
function isMobile(req) {
    const ua = req.headers['user-agent'] || '';
    return /Mobi|Android|iPhone|iPad|iPod|BlackBerry|Opera Mini|IEMobile/i.test(ua);
}

// ============================================================
// VIEW HELPERS
// ============================================================
app.use((req, res, next) => {
    const mobile = isMobile(req);
    
    res.locals.getHeader = function() {
        return mobile ? 'partials/header-mobile' : 'partials/header';
    };
    res.locals.getFooter = function() {
        return mobile ? 'partials/footer-mobile' : 'partials/footer';
    };
    res.locals.isMobile = mobile;
    res.locals.getAdBox = function() {
        return 'partials/ad-box';
    };
    
    next();
});

// ============================================================
// MONGODB CONNECTION
// ============================================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shinex';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ============================================================
// COURSE CODES FOR STUDENT ID
// ============================================================
const COURSE_CODES = {
    'Cybersecurity': 1,
    'Data Analysis': 2,
    'Digital Marketing': 3,
    'Graphic Design': 4,
    'Motion Design': 5,
    'Networking': 6,
    'Programming': 7,
    'UI/UX Design': 8,
    'Web Development': 9,
    'WordPress Development': 10
};

// ============================================================
// MONGODB SCHEMAS
// ============================================================

const UserSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    studentId: { type: String, unique: true },
    
    firstName: { type: String, required: true },
    middleName: String,
    lastName: { type: String, required: true },
    dateOfBirth: String,
    gender: { type: String, enum: ['Male', 'Female'] },
    country: String,
    state: String,
    city: String,
    
    email: { type: String, unique: true, required: true },
    phone: String,
    whatsapp: String,
    homeAddress: String,
    
    school: String,
    department: String,
    currentLevel: String,
    studentStatus: String,
    
    courseId: String,
    courseName: String,
    learningLevel: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' },
    
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    tokenExpires: Date,
    
    progress: { type: Object, default: {} },
    testResults: { type: Object, default: {} },
    
    isAdmin: { type: Boolean, default: false },
    
    textSize: { type: Number, default: 16 },
    darkMode: { type: Boolean, default: false },
    twoFactorEnabled: { type: Boolean, default: false },
    emailNotifications: { type: Boolean, default: true },
    browserNotifications: { type: Boolean, default: false },
    courseUpdates: { type: Boolean, default: true },
    profileVisibility: { type: String, enum: ['public', 'private'], default: 'public' },
    learningInterests: { type: String, default: '' },
    bio: { type: String, default: '' },
    notifications: { type: Array, default: [] },
    
    createdAt: { type: Date, default: Date.now }
});

const ContactMessageSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['unread', 'read', 'replied'], default: 'unread' },
    adminReply: String,
    repliedAt: Date,
    createdAt: { type: Date, default: Date.now }
});

const CourseSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    title: String,
    description: String,
    duration: String,
    level: String,
    levels: [{
        id: String,
        name: String,
        duration: String,
        lessons: [{
            id: String,
            title: String,
            description: String,
            classes: [{
                id: String,
                title: String,
                content: String,
                imageUrl: String,
                videoUrl: String,
                externalLink: String
            }]
        }],
        test: {
            questions: [{
                id: String,
                question: String,
                options: [String],
                correct: Number
            }]
        }
    }],
    review: String,
    createdAt: { type: Date, default: Date.now }
});

const ServiceSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    name: { type: String, required: true },
    description: String,
    price: { type: Number, default: 0 },
    category: { 
        type: String, 
        enum: ['registration', 'design', 'campaign', 'website', 'other'],
        default: 'other'
    },
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Course = mongoose.model('Course', CourseSchema);
const Service = mongoose.model('Service', ServiceSchema);
const ContactMessage = mongoose.model('ContactMessage', ContactMessageSchema);

// ============================================================
// HELPERS
// ============================================================
function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

async function generateStudentId(courseCode, year = new Date().getFullYear()) {
    const courseCodePadded = String(courseCode).padStart(2, '0');
    const regex = new RegExp(`SLC-${year}-${courseCodePadded}-`);
    
    const lastStudent = await User.findOne({ 
        studentId: { $regex: regex } 
    }).sort({ studentId: -1 });
    
    let nextNumber = 1;
    if (lastStudent) {
        const parts = lastStudent.studentId.split('-');
        const lastNumber = parseInt(parts[3]);
        if (!isNaN(lastNumber)) {
            nextNumber = lastNumber + 1;
        }
    }
    
    return `SLC-${year}-${courseCodePadded}-${String(nextNumber).padStart(3, '0')}`;
}

function sanitize(content) {
    if (!content) return '';
    return content.replace(/<script/g, '&lt;script').replace(/<\/script>/g, '&lt;/script&gt;');
}

function parseContent(text) {
    if (!text) return '';
    const lines = text.split('\n');
    let result = [];
    let inList = false;
    let listType = null;
    
    for (let line of lines) {
        line = line.trim();
        if (!line) {
            if (inList) { result.push('</' + listType + '>'); inList = false; listType = null; }
            continue;
        }
        if (line.startsWith('# ')) { result.push('<h1>' + line.slice(2) + '</h1>'); continue; }
        if (line.startsWith('## ')) { result.push('<h2>' + line.slice(3) + '</h2>'); continue; }
        if (line.startsWith('### ')) { result.push('<h3>' + line.slice(4) + '</h3>'); continue; }
        if (line.match(/^---+$/)) { result.push('<hr>'); continue; }
        if (line.match(/^(\*|-)\s/)) {
            if (!inList) { result.push('<ul>'); inList = true; listType = 'ul'; }
            result.push('<li>' + line.replace(/^(\*|-)\s/, '') + '</li>');
            continue;
        }
        if (line.match(/^\d+\.\s/)) {
            if (!inList || listType !== 'ol') {
                if (inList) result.push('</' + listType + '>');
                result.push('<ol>'); inList = true; listType = 'ol';
            }
            result.push('<li>' + line.replace(/^\d+\.\s/, '') + '</li>');
            continue;
        }
        if (inList) { result.push('</' + listType + '>'); inList = false; listType = null; }
        let processed = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        processed = processed.replace(/_(.+?)_/g, '<em>$1</em>');
        processed = processed.replace(/`(.+?)`/g, '<code>$1</code>');
        processed = processed.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank">$1</a>');
        result.push('<p>' + processed + '</p>');
    }
    if (inList) result.push('</' + listType + '>');
    return result.join('\n');
}

// ============================================================
// ===== EMAIL SYSTEM - SENDGRID + NODEMAILER FALLBACK =====
// ============================================================

// Configure SendGrid
let useSendGrid = false;
if (process.env.SENDGRID_API_KEY) {
    try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        useSendGrid = true;
        console.log('✅ SendGrid configured successfully');
    } catch (error) {
        console.error('❌ SendGrid configuration error:', error.message);
        useSendGrid = false;
    }
} else {
    console.log('⚠️ SENDGRID_API_KEY not found. Trying Nodemailer...');
}

// Configure Nodemailer as fallback
const hasEmailConfig = process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD;
let transporter = null;

if (hasEmailConfig) {
    try {
        transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_APP_PASSWORD
            },
            pool: true,
            maxConnections: 5,
            maxMessages: 100,
            rateDelta: 1000,
            rateLimit: 5,
            socketTimeout: 30000,
            connectionTimeout: 30000,
            tls: {
                rejectUnauthorized: process.env.NODE_ENV === 'production'
            }
        });

        transporter.verify((error, success) => {
            if (error) {
                console.error('❌ Nodemailer verification failed:', error.message);
            } else {
                console.log('✅ Nodemailer configured successfully');
                console.log(`📧 Using: ${process.env.EMAIL_USER}`);
            }
        });
    } catch (error) {
        console.error('❌ Nodemailer configuration error:', error.message);
        transporter = null;
    }
}

// Email queue system
const emailQueue = [];
let isProcessingQueue = false;
const emailRetryMap = new Map();

// Process email queue
async function processEmailQueue() {
    if (isProcessingQueue || emailQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (emailQueue.length > 0) {
        const emailJob = emailQueue.shift();
        const key = `${emailJob.to}-${emailJob.subject}`;
        
        try {
            const result = await sendEmailDirect(emailJob.to, emailJob.subject, emailJob.html);
            if (result.success) {
                console.log('✅ Queued email sent to:', emailJob.to);
                emailRetryMap.delete(key);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error(`❌ Failed to send queued email to ${emailJob.to}:`, error.message);
            
            const retryCount = emailRetryMap.get(key) || 0;
            if (retryCount < 3) {
                emailRetryMap.set(key, retryCount + 1);
                emailQueue.push(emailJob);
                console.log(`🔄 Retry ${retryCount + 1}/3 for ${emailJob.to}`);
            } else {
                console.log(`❌ Failed after 3 retries: ${emailJob.to}`);
                emailRetryMap.delete(key);
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    isProcessingQueue = false;
}

function queueEmail(to, subject, html) {
    emailQueue.push({ to, subject, html });
    processEmailQueue();
}

// Main send email function
async function sendEmailDirect(to, subject, html, from = null) {
    // Try SendGrid first
    if (useSendGrid) {
        try {
            const msg = {
                to: to,
                from: from || process.env.EMAIL_FROM || 'shinexlearning@gmail.com',
                subject: subject,
                html: html
            };
            
            await sgMail.send(msg);
            console.log('✅ Email sent via SendGrid to:', to);
            return { success: true, service: 'SendGrid' };
            
        } catch (error) {
            console.error('❌ SendGrid error:', error.message);
            if (error.response) {
                console.error('SendGrid response:', error.response.body);
            }
        }
    }
    
    // Fallback: Use Nodemailer
    if (transporter) {
        try {
            const mailOptions = {
                from: from || `"SHINEX Learning Circle" <${process.env.EMAIL_USER}>`,
                to: to,
                subject: subject,
                html: html
            };
            
            const info = await transporter.sendMail(mailOptions);
            console.log('✅ Email sent via Nodemailer to:', to);
            return { success: true, service: 'Nodemailer' };
            
        } catch (error) {
            console.error('❌ Nodemailer error:', error.message);
        }
    }
    
    // Final fallback: Log the email
    console.log('📧 EMAIL LOGGED (no service):');
    console.log('   To:', to);
    console.log('   Subject:', subject);
    console.log('   HTML length:', html ? html.length : 0);
    return { success: true, queued: true };
}

async function sendEmail(to, subject, html, from = null) {
    // If no service is available, queue the email
    if (!useSendGrid && !transporter) {
        console.log('📧 EMAIL QUEUED (no service):', to);
        queueEmail(to, subject, html);
        return { success: true, queued: true };
    }
    
    // Try to send directly
    const result = await sendEmailDirect(to, subject, html, from);
    
    // If failed, queue for retry
    if (!result.success) {
        queueEmail(to, subject, html);
        return { success: false, error: result.error, queued: true };
    }
    
    return result;
}

// ============================================================
// TEST EMAIL ROUTE
// ============================================================
app.get('/test-email', async (req, res) => {
    try {
        const testHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f6fc; border-radius: 12px;">
                <div style="text-align: center; padding: 20px 0;">
                    <h1 style="color: #8B5CF6; font-size: 28px;">🧪 Email Test</h1>
                </div>
                <div style="background: #fff; padding: 24px; border-radius: 12px;">
                    <h2 style="color: #1A0A2E;">✅ Email Configuration Working!</h2>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Your SHINEX app is successfully configured to send emails.
                    </p>
                    <div style="background: #f8f6fc; padding: 16px; border-radius: 8px; margin: 16px 0;">
                        <p><strong>Service:</strong> ${useSendGrid ? '✅ SendGrid' : transporter ? '✅ Nodemailer' : '⚠️ No Service'}</p>
                        <p><strong>From:</strong> ${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'Not Set'}</p>
                        <p><strong>To:</strong> ${process.env.ADMIN_EMAIL || 'Admin Email'}</p>
                        <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                    <div style="text-align: center; margin-top: 16px;">
                        <a href="https://shinex-learning.onrender.com" 
                           style="background: #8B5CF6; color: #fff; padding: 10px 24px; border-radius: 30px; text-decoration: none; font-weight: 600;">
                            Visit SHINEX
                        </a>
                    </div>
                </div>
                <div style="text-align: center; padding: 16px 0; color: #7a6a8f; font-size: 12px;">
                    <p>Learn. Understand. Protect. 🛡️</p>
                </div>
            </div>
        `;

        const result = await sendEmail(
            process.env.ADMIN_EMAIL || 'your-email@gmail.com',
            '🧪 Test Email from SHINEX',
            testHtml
        );

        if (result.success) {
            res.send(`
                <html>
                    <head><title>Email Test</title></head>
                    <body style="font-family: Arial; text-align: center; padding: 50px; background: #f8f6fc;">
                        <h1 style="color: #4CAF50;">✅ Test Email Sent!</h1>
                        <p>Check your inbox: <strong>${process.env.ADMIN_EMAIL || 'your-email@gmail.com'}</strong></p>
                        <p>Service used: <strong>${result.service || 'Queued'}</strong></p>
                        ${result.queued ? '<p style="color: #FF9800;">⚠️ Email was queued (no service)</p>' : ''}
                        <a href="/" style="color: #8B5CF6; text-decoration: none;">← Back to Home</a>
                    </body>
                </html>
            `);
        } else {
            res.send(`
                <html>
                    <head><title>Email Test Failed</title></head>
                    <body style="font-family: Arial; text-align: center; padding: 50px;">
                        <h1 style="color: #f44336;">❌ Test Failed</h1>
                        <p>Error: ${result.error}</p>
                        <p>Make sure SENDGRID_API_KEY is set in your .env file.</p>
                        <a href="/" style="color: #8B5CF6;">← Back to Home</a>
                    </body>
                </html>
            `);
        }
    } catch (error) {
        res.send(`
            <html>
                <head><title>Email Test Error</title></head>
                <body style="font-family: Arial; text-align: center; padding: 50px;">
                    <h1 style="color: #f44336;">❌ Error</h1>
                    <p>${error.message}</p>
                    <a href="/" style="color: #8B5CF6;">← Back to Home</a>
                </body>
            </html>
        `);
    }
});

// ============================================================
// AI TUTOR
// ============================================================
app.post('/api/ai-tutor', async (req, res) => {
    const { userPrompt } = req.body;
    if (!userPrompt) return res.status(400).json({ error: 'Prompt is required.' });

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) return res.status(500).json({ error: 'AI service not configured.' });

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'mixtral-8x7b-32768',
                messages: [{
                    role: 'system',
                    content: 'You are an educational AI assistant for SHINEX Learning Circle. Explain concepts clearly and simply.'
                }, {
                    role: 'user',
                    content: `Explain this clearly: ${userPrompt}`
                }],
                max_tokens: 500,
                temperature: 0.7
            })
        });

        const data = await response.json();
        res.json({ answer: data.choices[0].message.content });
    } catch (error) {
        console.error('AI Tutor error:', error);
        res.status(500).json({ error: 'AI service is currently busy. Please try again.' });
    }
});

// ============================================================
// ===== AUTH ROUTES =====
// ============================================================

// ===== LOGIN =====
app.get('/login', (req, res) => {
    const view = isMobile(req) ? 'mobile/login' : 'login';
    res.render(view, {
        user: null,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Login'
    });
    req.session.messages = {};
});

app.post('/login', async (req, res) => {
    const { identifier, password } = req.body;
    
    try {
        const user = await User.findOne({ 
            $or: [
                { studentId: identifier },
                { email: identifier }
            ]
        });
        
        if (!user) {
            req.session.messages = { error: 'Invalid Student ID or Email.' };
            return res.redirect('/login');
        }
        
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            req.session.messages = { error: 'Invalid password.' };
            return res.redirect('/login');
        }
        
        if (!user.isVerified) {
            req.session.messages = { error: 'Please verify your email first. Check your inbox.' };
            return res.redirect('/login');
        }
        
        if (user.isAdmin) {
            req.session.adminId = user.id;
            req.session.messages = { success: `✅ Welcome Admin, ${user.firstName}!` };
            res.redirect('/admin/dashboard');
        } else {
            req.session.userId = user.id;
            req.session.messages = { success: `✅ Welcome back, ${user.firstName}!` };
            res.redirect('/dashboard');
        }
        
    } catch (error) {
        console.error('Login error:', error);
        req.session.messages = { error: 'Something went wrong. Please try again.' };
        res.redirect('/login');
    }
});

// ============================================================
// ===== REGISTER - WITH VERIFICATION PAGE REDIRECT =====
// ============================================================
app.get('/register', (req, res) => {
    const courses = Object.keys(COURSE_CODES);
    const view = isMobile(req) ? 'mobile/register' : 'register';
    res.render(view, {
        user: null,
        courses: courses,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Register'
    });
    req.session.messages = {};
});

app.post('/register', async (req, res) => {
    const { 
        firstName, middleName, lastName, dateOfBirth, gender,
        country, state, city,
        email, phone, whatsapp, homeAddress,
        school, department, currentLevel, studentStatus,
        courseName, learningLevel,
        password, confirmPassword
    } = req.body;
    
    if (!firstName || !lastName || !email || !password || !courseName) {
        req.session.messages = { error: 'All required fields must be filled.' };
        return res.redirect('/register');
    }
    
    if (password !== confirmPassword) {
        req.session.messages = { error: 'Passwords do not match.' };
        return res.redirect('/register');
    }
    
    if (password.length < 6) {
        req.session.messages = { error: 'Password must be at least 6 characters.' };
        return res.redirect('/register');
    }
    
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            req.session.messages = { error: 'Email already registered.' };
            return res.redirect('/register');
        }
        
        const courseCode = COURSE_CODES[courseName];
        if (!courseCode) {
            req.session.messages = { error: 'Invalid course selected.' };
            return res.redirect('/register');
        }
        const studentId = await generateStudentId(courseCode);
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = generateToken();
        
        const newUser = new User({
            id: generateId(),
            studentId: studentId,
            firstName,
            middleName: middleName || '',
            lastName,
            dateOfBirth: dateOfBirth || '',
            gender: gender || '',
            country: country || '',
            state: state || '',
            city: city || '',
            email,
            phone: phone || '',
            whatsapp: whatsapp || '',
            homeAddress: homeAddress || '',
            school: school || '',
            department: department || '',
            currentLevel: currentLevel || '',
            studentStatus: studentStatus || '',
            courseId: null,
            courseName: courseName,
            learningLevel: learningLevel || 'Beginner',
            password: hashedPassword,
            isVerified: false,
            verificationToken: verificationToken,
            isAdmin: false,
            darkMode: false,
            textSize: 16,
            createdAt: new Date()
        });
        
        await newUser.save();
        
        const verificationLink = `https://shinex-learning.onrender.com/verify-email/${verificationToken}`;
        
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f6fc; border-radius: 12px;">
                <div style="text-align: center; padding: 20px 0;">
                    <h1 style="color: #8B5CF6; font-size: 28px;">SHINEX</h1>
                    <p style="color: #7a6a8f; font-size: 14px;">Learning Circle</p>
                </div>
                <div style="background: #fff; padding: 30px; border-radius: 12px;">
                    <h2 style="color: #1A0A2E;">✅ Registration Successful!</h2>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Dear <strong>${firstName} ${lastName}</strong>,
                    </p>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Your registration with SHINEX Learning Circle has been successful.
                    </p>
                    
                    <div style="background: #f8f6fc; padding: 16px; border-radius: 8px; margin: 16px 0;">
                        <p style="margin: 4px 0;"><strong style="color: #1A0A2E;">Student ID:</strong> <span style="color: #8B5CF6; font-weight: 700;">${studentId}</span></p>
                        <p style="margin: 4px 0;"><strong style="color: #1A0A2E;">Course:</strong> ${courseName}</p>
                    </div>
                    
                    <p style="color: #5a4a70; font-size: 14px; line-height: 1.6;">
                        Please verify your email to activate your account:
                    </p>
                    
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${verificationLink}" 
                           style="background: #8B5CF6; color: #fff; padding: 12px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
                            Verify Email
                        </a>
                    </div>
                    
                    <p style="color: #5a4a70; font-size: 12px; text-align: center;">
                        Or copy and paste this link: ${verificationLink}
                    </p>
                    
                    <p style="color: #7a6a8f; font-size: 12px; text-align: center; margin-top: 16px;">
                        This link expires in 24 hours.
                    </p>
                </div>
                <div style="text-align: center; padding: 16px 0; color: #7a6a8f; font-size: 12px;">
                    <p style="font-style: italic;">Learn. Understand. Protect.</p>
                </div>
            </div>
        `;
        
        await sendEmail(email, 'Verify Your Email - SHINEX Learning Circle', emailHtml);
        
        req.session.tempUser = {
            id: newUser.id,
            email: newUser.email,
            firstName: newUser.firstName,
            studentId: newUser.studentId
        };
        
        res.redirect('/verify-email-sent');
        
    } catch (error) {
        console.error('Registration error:', error);
        req.session.messages = { error: 'Something went wrong. Please try again.' };
        res.redirect('/register');
    }
});

// ============================================================
// ===== VERIFICATION ROUTES =====
// ============================================================

app.get('/verify-email-sent', (req, res) => {
    const user = req.session.tempUser || null;
    
    if (!user) {
        return res.redirect('/register');
    }
    
    const view = isMobile(req) ? 'mobile/verify-sent' : 'verify-sent';
    res.render(view, {
        user: user,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Verify Your Email'
    });
    req.session.messages = {};
});

app.post('/resend-verification', async (req, res) => {
    const { email } = req.body;
    
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.json({ success: false, error: 'User not found.' });
        }
        
        if (user.isVerified) {
            return res.json({ success: false, error: 'Email already verified.' });
        }
        
        const newToken = generateToken();
        user.verificationToken = newToken;
        await user.save();
        
        const verificationLink = `https://shinex-learning.onrender.com/verify-email/${newToken}`;
        
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f6fc; border-radius: 12px;">
                <div style="text-align: center; padding: 20px 0;">
                    <h1 style="color: #8B5CF6; font-size: 28px;">SHINEX</h1>
                    <p style="color: #7a6a8f; font-size: 14px;">Learning Circle</p>
                </div>
                <div style="background: #fff; padding: 30px; border-radius: 12px;">
                    <h2 style="color: #1A0A2E;">📧 Resend Verification</h2>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Dear <strong>${user.firstName}</strong>,
                    </p>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        You requested a new verification link.
                    </p>
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${verificationLink}" 
                           style="background: #8B5CF6; color: #fff; padding: 12px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
                            Verify Email
                        </a>
                    </div>
                    <p style="color: #7a6a8f; font-size: 12px; text-align: center;">
                        This link expires in 24 hours.
                    </p>
                </div>
            </div>
        `;
        
        await sendEmail(email, 'Resend Verification - SHINEX Learning Circle', emailHtml);
        
        req.session.tempUser = {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            studentId: user.studentId
        };
        
        res.json({ success: true, message: 'Verification email resent successfully!' });
        
    } catch (error) {
        console.error('Resend error:', error);
        res.json({ success: false, error: 'Something went wrong.' });
    }
});

app.get('/verify-email/:token', async (req, res) => {
    const { token } = req.params;
    
    try {
        const user = await User.findOne({ verificationToken: token });
        if (!user) {
            const view = isMobile(req) ? 'mobile/verify-error' : 'verify-error';
            return res.render(view, {
                user: null,
                messages: { error: 'Invalid or expired verification token.' },
                showBack: true,
                title: 'Verification Failed'
            });
        }
        
        user.isVerified = true;
        user.verificationToken = null;
        await user.save();
        
        req.session.tempUser = null;
        req.session.userId = user.id;
        
        const view = isMobile(req) ? 'mobile/verify-success' : 'verify-success';
        res.render(view, {
            user: user,
            messages: { success: '✅ Your email has been verified successfully!' },
            showBack: true,
            title: 'Email Verified'
        });
        
    } catch (error) {
        console.error('Verification error:', error);
        const view = isMobile(req) ? 'mobile/verify-error' : 'verify-error';
        res.render(view, {
            user: null,
            messages: { error: 'Something went wrong. Please try again.' },
            showBack: true,
            title: 'Verification Failed'
        });
    }
});

// ============================================================
// ===== AUTH MIDDLEWARE - SEPARATED ROLES =====
// ============================================================

async function requireUser(req, res, next) {
    if (!req.session.userId) {
        req.session.messages = { error: 'Please log in to access this page.' };
        return res.redirect('/login');
    }
    
    try {
        const user = await User.findOne({ id: req.session.userId });
        if (!user) {
            req.session.destroy();
            req.session.messages = { error: 'Session expired. Please log in again.' };
            return res.redirect('/login');
        }
        
        if (user.isAdmin) {
            return res.redirect('/admin/dashboard');
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        req.session.messages = { error: 'Authentication error. Please try again.' };
        res.redirect('/login');
    }
}

async function requireAdmin(req, res, next) {
    if (!req.session.adminId) {
        req.session.messages = { error: 'Please log in as admin.' };
        return res.redirect('/shinex-admin');
    }
    
    try {
        const admin = await User.findOne({ id: req.session.adminId });
        if (!admin) {
            req.session.destroy();
            req.session.messages = { error: 'Session expired. Please log in again.' };
            return res.redirect('/shinex-admin');
        }
        
        if (!admin.isAdmin) {
            req.session.destroy();
            req.session.messages = { error: 'Admin access required.' };
            return res.redirect('/shinex-admin');
        }
        
        req.admin = admin;
        next();
    } catch (error) {
        console.error('Admin auth error:', error);
        req.session.messages = { error: 'Authentication error. Please try again.' };
        res.redirect('/shinex-admin');
    }
}

function blockMobileAdmin(req, res, next) {
    if (isMobile(req)) {
        req.session.messages = { error: 'Admin panel is only available on desktop.' };
        return res.redirect('/');
    }
    next();
}

// ============================================================
// ===== PUBLIC ROUTES =====
// ============================================================
app.get('/', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    const courses = await Course.find();
    const services = await Service.find({ isActive: true });
    const view = isMobile(req) ? 'mobile/index' : 'index';
    res.render(view, {
        user: user,
        courses,
        services,
        messages: req.session.messages || {},
        showBack: false,
        title: 'Home'
    });
    req.session.messages = {};
});

app.get('/terms', (req, res) => {
    const view = isMobile(req) ? 'mobile/terms' : 'terms';
    res.render(view, { 
        user: null, 
        messages: req.session.messages || {}, 
        showBack: true, 
        title: 'Terms & Conditions' 
    });
    req.session.messages = {};
});

app.get('/privacy', (req, res) => {
    const view = isMobile(req) ? 'mobile/privacy' : 'privacy';
    res.render(view, { 
        user: null, 
        messages: req.session.messages || {}, 
        showBack: true, 
        title: 'Privacy Policy' 
    });
    req.session.messages = {};
});

app.get('/faq', (req, res) => {
    const view = isMobile(req) ? 'mobile/faq' : 'faq';
    res.render(view, {
        user: null,
        messages: req.session.messages || {},
        showBack: true,
        title: 'FAQ'
    });
    req.session.messages = {};
});

app.get('/about', (req, res) => {
    const view = isMobile(req) ? 'mobile/about' : 'about';
    res.render(view, {
        user: null,
        messages: req.session.messages || {},
        showBack: true,
        title: 'About Us'
    });
    req.session.messages = {};
});

app.get('/services', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    const services = await Service.find({ isActive: true });
    const view = isMobile(req) ? 'mobile/services' : 'services';
    res.render(view, {
        user: user,
        services: services,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Our Services'
    });
    req.session.messages = {};
});

// ============================================================
// ===== COURSE ROUTES =====
// ============================================================
app.get('/course/:courseId', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/');
    }
    const view = isMobile(req) ? 'mobile/course' : 'course';
    res.render(view, {
        user: user,
        course,
        messages: req.session.messages || {},
        showBack: true,
        title: course.title
    });
    req.session.messages = {};
});

app.get('/level/:courseId/:levelId', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/');
    }

    const level = course.levels.find(l => l.id === req.params.levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect('/course/' + req.params.courseId);
    }

    let allClasses = [];
    let classIndex = 0;
    if (level.lessons) {
        level.lessons.forEach(lesson => {
            if (lesson.classes) {
                lesson.classes.forEach(cls => {
                    const isCompleted = user && user.progress && user.progress[cls.id] || false;
                    let isLocked = false;
                    if (classIndex > 0) {
                        const prevClass = allClasses[classIndex - 1];
                        if (prevClass && !prevClass.completed) {
                            isLocked = true;
                        }
                    }
                    allClasses.push({
                        id: cls.id,
                        lessonId: lesson.id,
                        lessonTitle: lesson.title,
                        title: cls.title,
                        content: cls.content,
                        imageUrl: cls.imageUrl,
                        videoUrl: cls.videoUrl,
                        externalLink: cls.externalLink,
                        completed: isCompleted,
                        locked: isLocked,
                        index: classIndex
                    });
                    classIndex++;
                });
            }
        });
    }

    let currentClassId = req.query.classId || (allClasses.length > 0 ? allClasses[0].id : null);
    let currentClass = allClasses.find(c => c.id === currentClassId);
    if (!currentClass && allClasses.length > 0) {
        currentClass = allClasses[0];
        currentClassId = currentClass.id;
    }

    if (currentClass && currentClass.locked) {
        const firstUnlocked = allClasses.find(c => !c.locked);
        if (firstUnlocked) {
            return res.redirect(`/level/${course.id}/${level.id}?classId=${firstUnlocked.id}`);
        } else {
            return res.redirect(`/level/${course.id}/${level.id}?classId=${allClasses[0].id}`);
        }
    }

    let totalClasses = allClasses.length;
    let completedClasses = allClasses.filter(c => c.completed).length;
    let score = completedClasses * 10;
    let progress = totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0;

    let currentLesson = null;
    if (level.lessons) {
        level.lessons.forEach(lesson => {
            if (lesson.classes && lesson.classes.some(c => c.id === currentClassId)) {
                currentLesson = lesson;
            }
        });
    }

    let currentIndex = allClasses.findIndex(c => c.id === currentClassId);
    let prevClassId = currentIndex > 0 ? allClasses[currentIndex - 1].id : null;
    let nextClassId = currentIndex < allClasses.length - 1 ? allClasses[currentIndex + 1].id : null;

    let nextLocked = false;
    if (nextClassId) {
        const nextClass = allClasses.find(c => c.id === nextClassId);
        if (nextClass) nextLocked = nextClass.locked;
    }

    const view = isMobile(req) ? 'mobile/level' : 'level';
    res.render(view, {
        user: user,
        course,
        level,
        currentClass,
        currentLesson,
        allClasses,
        totalClasses,
        completedClasses,
        progress,
        score,
        prevClassId,
        nextClassId,
        nextLocked,
        messages: req.session.messages || {},
        showBack: true,
        title: level.name + ' - ' + course.title
    });
    req.session.messages = {};
});

// ============================================================
// ===== USER PROTECTED ROUTES - requireUser =====
// ============================================================

app.get('/dashboard', requireUser, async (req, res) => {
    const user = req.user;
    const courses = await Course.find();
    const enrolledCourse = user.courseId ? await Course.findOne({ id: user.courseId }) : null;
    
    let totalClasses = 0, completedClasses = 0, score = 0;
    if (enrolledCourse && enrolledCourse.levels && user.progress) {
        enrolledCourse.levels.forEach(level => {
            if (level.lessons) {
                level.lessons.forEach(lesson => {
                    if (lesson.classes) {
                        lesson.classes.forEach(cls => {
                            totalClasses++;
                            if (user.progress && user.progress[cls.id]) completedClasses++;
                        });
                    }
                });
            }
        });
        score = completedClasses * 10;
    }
    const progress = totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0;
    
    const view = isMobile(req) ? 'mobile/dashboard' : 'dashboard';
    res.render(view, {
        user: user,
        enrolledCourse: enrolledCourse,
        progress: progress,
        completedClasses: completedClasses,
        totalClasses: totalClasses,
        score: score,
        courses: courses,
        messages: req.session.messages || {},
        showBack: false,
        title: 'Dashboard'
    });
    req.session.messages = {};
});

app.get('/settings', requireUser, async (req, res) => {
    const user = req.user;
    const view = isMobile(req) ? 'mobile/settings' : 'settings';
    res.render(view, {
        user: user,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Settings'
    });
    req.session.messages = {};
});

app.post('/settings/update', requireUser, async (req, res) => {
    const user = req.user;
    const {
        firstName, lastName, bio,
        textSize, darkMode,
        twoFactorEnabled,
        emailNotifications, browserNotifications, courseUpdates,
        profileVisibility,
        learningInterests,
        currentPassword, newPassword, confirmPassword
    } = req.body;

    try {
        if (firstName) user.firstName = firstName;
        if (lastName) user.lastName = lastName;
        if (bio !== undefined) user.bio = bio;
        if (textSize) user.textSize = parseInt(textSize);
        if (darkMode !== undefined) user.darkMode = darkMode === 'on' || darkMode === 'true';
        if (twoFactorEnabled !== undefined) user.twoFactorEnabled = twoFactorEnabled === 'on' || twoFactorEnabled === 'true';
        if (emailNotifications !== undefined) user.emailNotifications = emailNotifications === 'on' || emailNotifications === 'true';
        if (browserNotifications !== undefined) user.browserNotifications = browserNotifications === 'on' || browserNotifications === 'true';
        if (courseUpdates !== undefined) user.courseUpdates = courseUpdates === 'on' || courseUpdates === 'true';
        if (profileVisibility) user.profileVisibility = profileVisibility;
        if (learningInterests !== undefined) user.learningInterests = learningInterests;

        if (currentPassword && newPassword && confirmPassword) {
            if (!(await bcrypt.compare(currentPassword, user.password))) {
                return res.json({ success: false, error: 'Current password is incorrect.' });
            }
            if (newPassword !== confirmPassword || newPassword.length < 6) {
                return res.json({ success: false, error: 'New password must be at least 6 characters and match.' });
            }
            user.password = await bcrypt.hash(newPassword, 10);
        }

        await user.save();
        res.json({ success: true, message: 'Settings updated successfully!' });
    } catch (error) {
        console.error('Settings error:', error);
        res.json({ success: false, error: 'Something went wrong. Please try again.' });
    }
});

// ============================================================
// PROGRESS TRACKING ROUTES
// ============================================================
app.post('/level/complete/:classId', requireUser, async (req, res) => {
    const { classId } = req.params;
    const user = req.user;
    
    if (!user.progress) user.progress = {};
    user.progress[classId] = true;
    await user.save();
    
    const totalCompleted = Object.keys(user.progress).length;
    res.json({ success: true, completed: totalCompleted });
});

app.get('/level/:courseId/:levelId/next/:classId', requireUser, async (req, res) => {
    const { courseId, levelId, classId } = req.params;
    const user = req.user;
    
    if (!user.progress) user.progress = {};
    user.progress[classId] = true;
    await user.save();
    
    const course = await Course.findOne({ id: courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/');
    }
    
    const level = course.levels.find(l => l.id === levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect('/course/' + courseId);
    }
    
    let allClassIds = [];
    if (level.lessons) {
        level.lessons.forEach(lesson => {
            if (lesson.classes) {
                lesson.classes.forEach(cls => {
                    allClassIds.push(cls.id);
                });
            }
        });
    }
    
    const currentIndex = allClassIds.indexOf(classId);
    const nextClassId = currentIndex < allClassIds.length - 1 ? allClassIds[currentIndex + 1] : null;
    const totalCompleted = Object.keys(user.progress).length;
    const totalClasses = allClassIds.length;
    const progressPercent = Math.round((totalCompleted / totalClasses) * 100);
    
    req.session.messages = { 
        success: `✅ Class completed! +10 points! (${totalCompleted}/${totalClasses} done - ${progressPercent}%)` 
    };
    
    if (nextClassId) {
        res.redirect(`/level/${courseId}/${levelId}?classId=${nextClassId}`);
    } else {
        req.session.messages = { 
            success: `🎉 All classes completed! You finished this level! (${totalCompleted}/${totalClasses})` 
        };
        res.redirect(`/course/${courseId}`);
    }
});

app.get('/level/:courseId/:levelId/prev/:classId', requireUser, async (req, res) => {
    const { courseId, levelId, classId } = req.params;
    
    const course = await Course.findOne({ id: courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/');
    }
    
    const level = course.levels.find(l => l.id === levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect('/course/' + courseId);
    }
    
    let allClassIds = [];
    if (level.lessons) {
        level.lessons.forEach(lesson => {
            if (lesson.classes) {
                lesson.classes.forEach(cls => {
                    allClassIds.push(cls.id);
                });
            }
        });
    }
    
    const currentIndex = allClassIds.indexOf(classId);
    const prevClassId = currentIndex > 0 ? allClassIds[currentIndex - 1] : null;
    
    if (prevClassId) {
        res.redirect(`/level/${courseId}/${levelId}?classId=${prevClassId}`);
    } else {
        req.session.messages = { error: 'This is the first class.' };
        res.redirect(`/level/${courseId}/${levelId}?classId=${classId}`);
    }
});

// ============================================================
// ===== CONTACT ROUTES =====
// ============================================================
app.get('/contact', (req, res) => {
    const view = isMobile(req) ? 'mobile/contact' : 'contact';
    res.render(view, { 
        user: null, 
        messages: req.session.messages || {}, 
        showBack: true, 
        title: 'Contact Us' 
    });
    req.session.messages = {};
});

app.post('/contact/send', async (req, res) => {
    const { name, email, subject, message } = req.body;
    
    if (!name || !email || !subject || !message) {
        req.session.messages = { error: 'All fields are required.' };
        return res.redirect('/contact');
    }
    
    try {
        const newMessage = new ContactMessage({
            id: generateId(),
            name,
            email,
            subject,
            message,
            status: 'unread',
            createdAt: new Date()
        });
        await newMessage.save();
        
        const adminEmail = process.env.ADMIN_EMAIL || 'balogunmustaphaaddeji@gmail.com';
        
        const adminHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f6fc; border-radius: 12px;">
                <div style="text-align: center; padding: 20px 0;">
                    <h1 style="color: #8B5CF6; font-size: 28px;">📬 New Contact Message</h1>
                    <p style="color: #7a6a8f;">From ${name}</p>
                </div>
                <div style="background: #fff; padding: 24px; border-radius: 12px;">
                    <div style="display: grid; gap: 12px;">
                        <div style="background: #f8f6fc; padding: 10px; border-radius: 6px;">
                            <strong>Name:</strong> ${name}
                        </div>
                        <div style="background: #f8f6fc; padding: 10px; border-radius: 6px;">
                            <strong>Email:</strong> <a href="mailto:${email}">${email}</a>
                        </div>
                        <div style="background: #f8f6fc; padding: 10px; border-radius: 6px;">
                            <strong>Subject:</strong> ${subject}
                        </div>
                        <div style="background: #f8f6fc; padding: 15px; border-radius: 6px; margin-top: 10px;">
                            <strong>Message:</strong>
                            <p style="color: #5a4a70; margin-top: 8px;">${message}</p>
                        </div>
                    </div>
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="https://shinex-learning.onrender.com/admin/messages/${newMessage.id}" 
                           style="background: #8B5CF6; color: #fff; padding: 10px 24px; border-radius: 30px; text-decoration: none; font-weight: 600;">
                            View & Reply
                        </a>
                    </div>
                </div>
                <div style="text-align: center; padding: 16px 0; color: #7a6a8f; font-size: 12px;">
                    <p>Received: ${new Date().toLocaleString()}</p>
                </div>
            </div>
        `;
        
        await sendEmail(adminEmail, `📬 New Contact Message from ${name} - ${subject}`, adminHtml);
        
        const userHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f6fc; border-radius: 12px;">
                <div style="text-align: center; padding: 20px 0;">
                    <h1 style="color: #8B5CF6; font-size: 28px;">✅ Message Received</h1>
                </div>
                <div style="background: #fff; padding: 24px; border-radius: 12px;">
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Dear <strong>${name}</strong>,
                    </p>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Thank you for contacting SHINEX Learning Circle. We have received your message and will get back to you within 24-48 hours.
                    </p>
                    <div style="background: #f8f6fc; padding: 15px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #8B5CF6;">
                        <p style="margin: 0;"><strong>Your Message:</strong></p>
                        <p style="color: #5a4a70; margin: 8px 0 0 0;">${message}</p>
                    </div>
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="https://shinex-learning.onrender.com" 
                           style="background: #8B5CF6; color: #fff; padding: 12px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                            Explore Our Courses
                        </a>
                    </div>
                </div>
                <div style="text-align: center; padding: 16px 0; color: #7a6a8f; font-size: 12px;">
                    <p style="font-style: italic;">Learn. Understand. Protect. 🛡️</p>
                </div>
            </div>
        `;
        
        await sendEmail(email, '✅ We Received Your Message - SHINEX Learning Circle', userHtml);
        
        req.session.messages = { success: '✅ Your message has been sent. We\'ll get back to you soon!' };
        res.redirect('/contact');
        
    } catch (error) {
        console.error('Contact error:', error);
        req.session.messages = { error: 'Something went wrong. Please try again.' };
        res.redirect('/contact');
    }
});

// ============================================================
// ===== ADMIN MESSAGE ROUTES =====
// ============================================================
app.get('/admin/messages', blockMobileAdmin, requireAdmin, async (req, res) => {
    const messages = await ContactMessage.find().sort({ createdAt: -1 });
    const unreadCount = messages.filter(m => m.status === 'unread').length;
    
    res.render('admin/messages', {
        admin: req.admin,
        messages: messages,
        unreadCount: unreadCount,
        msg: req.session.messages || {},
        showBack: true,
        title: 'Messages'
    });
    req.session.messages = {};
});

app.get('/admin/messages/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    const message = await ContactMessage.findOne({ id: req.params.id });
    if (!message) {
        req.session.messages = { error: 'Message not found.' };
        return res.redirect('/admin/messages');
    }
    
    if (message.status === 'unread') {
        message.status = 'read';
        await message.save();
    }
    
    res.render('admin/message-view', {
        admin: req.admin,
        message: message,
        messages: req.session.messages || {},
        showBack: true,
        title: 'View Message'
    });
    req.session.messages = {};
});

app.post('/admin/messages/reply/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    const { reply } = req.body;
    const message = await ContactMessage.findOne({ id: req.params.id });
    
    if (!message) {
        req.session.messages = { error: 'Message not found.' };
        return res.redirect('/admin/messages');
    }
    
    if (!reply) {
        req.session.messages = { error: 'Reply message is required.' };
        return res.redirect('/admin/messages/' + message.id);
    }
    
    try {
        message.status = 'replied';
        message.adminReply = reply;
        message.repliedAt = new Date();
        await message.save();
        
        const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f6fc; border-radius: 12px;">
                <div style="text-align: center; padding: 20px 0;">
                    <h1 style="color: #8B5CF6; font-size: 28px;">📩 Reply from SHINEX</h1>
                </div>
                <div style="background: #fff; padding: 24px; border-radius: 12px;">
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Dear <strong>${message.name}</strong>,
                    </p>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Thank you for contacting SHINEX Learning Circle. Here is our response:
                    </p>
                    <div style="background: #f8f6fc; padding: 15px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #f44336;">
                        <p style="margin: 0;"><strong>Your Original Message:</strong></p>
                        <p style="color: #5a4a70; margin: 8px 0 0 0;">${message.message}</p>
                    </div>
                    <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #4CAF50;">
                        <p style="margin: 0;"><strong style="color: #2E7D32;">Our Reply:</strong></p>
                        <p style="color: #1B5E20; margin: 8px 0 0 0;">${reply}</p>
                    </div>
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="https://shinex-learning.onrender.com" 
                           style="background: #8B5CF6; color: #fff; padding: 12px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                            Visit SHINEX
                        </a>
                    </div>
                </div>
                <div style="text-align: center; padding: 16px 0; color: #7a6a8f; font-size: 12px;">
                    <p>Learn. Understand. Protect. 🛡️</p>
                </div>
            </div>
        `;
        
        await sendEmail(message.email, '📩 Reply from SHINEX Learning Circle', emailHtml);
        
        req.session.messages = { success: '✅ Reply sent successfully!' };
        res.redirect('/admin/messages');
        
    } catch (error) {
        console.error('Reply error:', error);
        req.session.messages = { error: 'Something went wrong. Please try again.' };
        res.redirect('/admin/messages/' + message.id);
    }
});

app.post('/admin/messages/delete/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    await ContactMessage.findOneAndDelete({ id: req.params.id });
    req.session.messages = { success: '🗑️ Message deleted.' };
    res.redirect('/admin/messages');
});

// ============================================================
// ===== ADMIN LOGIN =====
// ============================================================
app.get('/shinex-admin', (req, res) => {
    if (req.session.adminId) return res.redirect('/admin/dashboard');
    if (isMobile(req)) return res.redirect('/');
    res.render('admin/login', { 
        messages: req.session.messages || {}, 
        showBack: false, 
        title: 'Admin Login' 
    });
    req.session.messages = {};
});

app.post('/shinex-admin', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        const user = await User.findOne({ email });
        if (!user || !user.isAdmin) {
            req.session.messages = { error: 'Invalid admin credentials.' };
            return res.redirect('/shinex-admin');
        }
        
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            req.session.messages = { error: 'Invalid admin credentials.' };
            return res.redirect('/shinex-admin');
        }
        
        req.session.userId = null;
        req.session.adminId = user.id;
        
        req.session.messages = { success: 'Welcome to Admin Panel.' };
        res.redirect('/admin/dashboard');
        
    } catch (error) {
        console.error('Admin login error:', error);
        req.session.messages = { error: 'Something went wrong. Please try again.' };
        res.redirect('/shinex-admin');
    }
});

app.get('/admin/logout', (req, res) => {
    req.session.adminId = null;
    req.session.destroy((err) => {
        if (err) console.error('Admin logout error:', err);
        res.redirect('/shinex-admin');
    });
});

// ============================================================
// ===== LOGOUT =====
// ============================================================
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Logout error:', err);
        res.redirect('/');
    });
});

// ============================================================
// ===== ADMIN ROUTES =====
// ============================================================

app.get('/admin/dashboard', blockMobileAdmin, requireAdmin, async (req, res) => {
    const admin = req.admin;
    const users = await User.find();
    const courses = await Course.find();
    const services = await Service.find();
    const messages = await ContactMessage.find();
    const totalStudents = users.filter(u => !u.isAdmin).length;
    const totalCourses = courses.length;
    const totalEnrollments = users.filter(u => u.courseId && !u.isAdmin).length;
    const totalServices = services.length;
    const unreadCount = messages.filter(m => m.status === 'unread').length;

    let totalClasses = 0;
    courses.forEach(c => {
        if (c.levels) {
            c.levels.forEach(l => {
                if (l.lessons) {
                    l.lessons.forEach(ls => {
                        if (ls.classes) totalClasses += ls.classes.length;
                    });
                }
            });
        }
    });

    const studentsByCourse = {};
    courses.forEach(c => {
        const students = users.filter(u => u.courseId === c.id && !u.isAdmin);
        studentsByCourse[c.id] = { course: c, students, count: students.length };
    });

    res.render('admin/dashboard', {
        admin: admin,
        totalStudents,
        totalCourses,
        totalEnrollments,
        totalClasses,
        totalServices,
        unreadCount,
        studentsByCourse,
        courses,
        users,
        services,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Admin Dashboard'
    });
    req.session.messages = {};
});

app.get('/admin/students', blockMobileAdmin, requireAdmin, async (req, res) => {
    const users = await User.find();
    const students = users.filter(u => !u.isAdmin);
    const courses = await Course.find();
    const courseMap = {};
    courses.forEach(c => { courseMap[c.id] = c.title; });
    res.render('admin/students', {
        students,
        courseMap,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Students'
    });
    req.session.messages = {};
});

app.get('/admin/courses', blockMobileAdmin, requireAdmin, async (req, res) => {
    const courses = await Course.find();
    const users = await User.find();
    const coursesWithCount = courses.map(c => ({
        ...c.toObject(),
        studentCount: users.filter(u => u.courseId === c.id && !u.isAdmin).length
    }));
    res.render('admin/courses', {
        courses: coursesWithCount,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Manage Courses'
    });
    req.session.messages = {};
});

app.post('/admin/courses/add', blockMobileAdmin, requireAdmin, async (req, res) => {
    const { title, description, duration, level, review } = req.body;
    if (!title || !description || !duration) {
        req.session.messages = { error: 'All fields required.' };
        return res.redirect('/admin/courses');
    }

    const newCourse = new Course({
        id: generateId(),
        title,
        description,
        duration,
        level: level || 'Beginner',
        levels: [],
        review: review || '',
        createdAt: new Date()
    });
    await newCourse.save();
    req.session.messages = { success: '✅ Course added successfully!' };
    res.redirect('/admin/courses');
});

app.post('/admin/courses/delete/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    await Course.findOneAndDelete({ id: req.params.id });
    await User.updateMany({ courseId: req.params.id }, { $set: { courseId: null, progress: {} } });
    req.session.messages = { success: '🗑️ Course deleted.' };
    res.redirect('/admin/courses');
});

app.post('/admin/courses/delete-all', blockMobileAdmin, requireAdmin, async (req, res) => {
    await Course.deleteMany({});
    await User.updateMany({}, { $set: { courseId: null, progress: {} } });
    req.session.messages = { success: '🗑️ All courses deleted!' };
    res.redirect('/admin/courses');
});

app.get('/admin/courses/edit/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    const course = await Course.findOne({ id: req.params.id });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    res.render('admin/course-edit', {
        course,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Edit Course'
    });
    req.session.messages = {};
});

app.post('/admin/courses/edit/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    const { title, description, duration, level, review } = req.body;
    const course = await Course.findOne({ id: req.params.id });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    course.title = title || course.title;
    course.description = description || course.description;
    course.duration = duration || course.duration;
    course.level = level || course.level;
    course.review = review || course.review;
    await course.save();
    req.session.messages = { success: '✅ Course updated!' };
    res.redirect('/admin/courses');
});

// ============================================================
// ADMIN LEVEL ROUTES
// ============================================================
app.post('/admin/courses/:id/levels/add', blockMobileAdmin, requireAdmin, async (req, res) => {
    const { name, duration } = req.body;
    if (!name || !duration) {
        req.session.messages = { error: 'Level name and duration required.' };
        return res.redirect(`/admin/courses/edit/${req.params.id}`);
    }
    const course = await Course.findOne({ id: req.params.id });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    if (!course.levels) course.levels = [];
    course.levels.push({
        id: generateId(),
        name,
        duration,
        lessons: [],
        test: { questions: [] }
    });
    await course.save();
    req.session.messages = { success: '✅ Level added!' };
    res.redirect(`/admin/courses/edit/${req.params.id}`);
});

app.post('/admin/courses/:id/levels/delete/:levelId', blockMobileAdmin, requireAdmin, async (req, res) => {
    const course = await Course.findOne({ id: req.params.id });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    course.levels = course.levels.filter(l => l.id !== req.params.levelId);
    await course.save();
    req.session.messages = { success: '🗑️ Level deleted.' };
    res.redirect(`/admin/courses/edit/${req.params.id}`);
});

app.get('/admin/levels/edit/:courseId/:levelId', blockMobileAdmin, requireAdmin, async (req, res) => {
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    const level = course.levels.find(l => l.id === req.params.levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect(`/admin/courses/edit/${req.params.courseId}`);
    }
    res.render('admin/level-edit', {
        course,
        level,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Edit Level'
    });
    req.session.messages = {};
});

app.post('/admin/levels/:courseId/:levelId/lessons/add', blockMobileAdmin, requireAdmin, async (req, res) => {
    const { title, description } = req.body;
    if (!title) {
        req.session.messages = { error: 'Lesson title required.' };
        return res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
    }
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    const level = course.levels.find(l => l.id === req.params.levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect(`/admin/courses/edit/${req.params.courseId}`);
    }
    level.lessons.push({
        id: generateId(),
        title,
        description: description || '',
        classes: []
    });
    await course.save();
    req.session.messages = { success: '✅ Lesson added!' };
    res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
});

app.post('/admin/levels/:courseId/:levelId/lessons/delete/:lessonId', blockMobileAdmin, requireAdmin, async (req, res) => {
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    const level = course.levels.find(l => l.id === req.params.levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect(`/admin/courses/edit/${req.params.courseId}`);
    }
    level.lessons = level.lessons.filter(l => l.id !== req.params.lessonId);
    await course.save();
    req.session.messages = { success: '🗑️ Lesson deleted.' };
    res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
});

app.post('/admin/levels/:courseId/:levelId/lessons/:lessonId/classes/add', blockMobileAdmin, requireAdmin, async (req, res) => {
    const { title, content, imageUrl, videoUrl, externalLink } = req.body;
    if (!title || !content) {
        req.session.messages = { error: 'Class title and content required.' };
        return res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
    }
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    const level = course.levels.find(l => l.id === req.params.levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect(`/admin/courses/edit/${req.params.courseId}`);
    }
    const lesson = level.lessons.find(l => l.id === req.params.lessonId);
    if (!lesson) {
        req.session.messages = { error: 'Lesson not found.' };
        return res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
    }
    lesson.classes.push({
        id: generateId(),
        title,
        content: sanitize(content),
        imageUrl: imageUrl || '',
        videoUrl: videoUrl || '',
        externalLink: externalLink || ''
    });
    await course.save();
    req.session.messages = { success: '✅ Class added!' };
    res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
});

app.post('/admin/levels/:courseId/:levelId/lessons/:lessonId/classes/delete/:classId', blockMobileAdmin, requireAdmin, async (req, res) => {
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    const level = course.levels.find(l => l.id === req.params.levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect(`/admin/courses/edit/${req.params.courseId}`);
    }
    const lesson = level.lessons.find(l => l.id === req.params.lessonId);
    if (!lesson) {
        req.session.messages = { error: 'Lesson not found.' };
        return res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
    }
    lesson.classes = lesson.classes.filter(c => c.id !== req.params.classId);
    await course.save();
    req.session.messages = { success: '🗑️ Class deleted.' };
    res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
});

app.post('/admin/levels/:courseId/:levelId/lessons/:lessonId/classes/edit/:classId', blockMobileAdmin, requireAdmin, async (req, res) => {
    const { title, content, imageUrl, videoUrl, externalLink } = req.body;
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    const level = course.levels.find(l => l.id === req.params.levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect(`/admin/courses/edit/${req.params.courseId}`);
    }
    const lesson = level.lessons.find(l => l.id === req.params.lessonId);
    if (!lesson) {
        req.session.messages = { error: 'Lesson not found.' };
        return res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
    }
    const cls = lesson.classes.find(c => c.id === req.params.classId);
    if (!cls) {
        req.session.messages = { error: 'Class not found.' };
        return res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
    }
    cls.title = title || cls.title;
    cls.content = sanitize(content || cls.content);
    cls.imageUrl = imageUrl || '';
    cls.videoUrl = videoUrl || '';
    cls.externalLink = externalLink || '';
    await course.save();
    req.session.messages = { success: '✅ Class updated!' };
    res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
});

// ============================================================
// ADMIN TEST ROUTES
// ============================================================
app.post('/admin/levels/:courseId/:levelId/test/add', blockMobileAdmin, requireAdmin, async (req, res) => {
    const { question, option1, option2, option3, option4, correct } = req.body;
    if (!question || !option1 || !option2 || !option3 || !option4 || correct === undefined) {
        req.session.messages = { error: 'All test fields required.' };
        return res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
    }
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    const level = course.levels.find(l => l.id === req.params.levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect(`/admin/courses/edit/${req.params.courseId}`);
    }
    if (!level.test) level.test = { questions: [] };
    level.test.questions.push({
        id: generateId(),
        question,
        options: [option1, option2, option3, option4],
        correct: parseInt(correct)
    });
    await course.save();
    req.session.messages = { success: '✅ Test question added!' };
    res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
});

app.post('/admin/levels/:courseId/:levelId/test/delete/:questionId', blockMobileAdmin, requireAdmin, async (req, res) => {
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    const level = course.levels.find(l => l.id === req.params.levelId);
    if (!level || !level.test) {
        req.session.messages = { error: 'Level or test not found.' };
        return res.redirect(`/admin/courses/edit/${req.params.courseId}`);
    }
    level.test.questions = level.test.questions.filter(q => q.id !== req.params.questionId);
    if (level.test.questions.length === 0) level.test = null;
    await course.save();
    req.session.messages = { success: '🗑️ Test question deleted.' };
    res.redirect(`/admin/levels/edit/${req.params.courseId}/${req.params.levelId}`);
});

// ============================================================
// ADMIN SERVICES MANAGEMENT
// ============================================================
app.get('/admin/services', blockMobileAdmin, requireAdmin, async (req, res) => {
    const services = await Service.find().sort({ createdAt: -1 });
    res.render('admin/services', {
        admin: req.admin,
        services,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Manage Services'
    });
    req.session.messages = {};
});

app.post('/admin/services/add', blockMobileAdmin, requireAdmin, async (req, res) => {
    const { name, description, price, category } = req.body;
    if (!name) {
        req.session.messages = { error: 'Service name is required.' };
        return res.redirect('/admin/services');
    }
    const newService = new Service({
        id: generateId(),
        name,
        description: description || '',
        price: parseInt(price) || 0,
        category: category || 'other',
        isActive: true,
        createdAt: new Date()
    });
    await newService.save();
    req.session.messages = { success: '✅ Service added successfully!' };
    res.redirect('/admin/services');
});

app.get('/admin/services/delete/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    await Service.findOneAndDelete({ id: req.params.id });
    req.session.messages = { success: '🗑️ Service deleted.' };
    res.redirect('/admin/services');
});

app.post('/admin/services/toggle/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    const service = await Service.findOne({ id: req.params.id });
    if (service) {
        service.isActive = !service.isActive;
        await service.save();
        req.session.messages = { success: `✅ Service ${service.isActive ? 'activated' : 'deactivated'}.` };
    }
    res.redirect('/admin/services');
});

app.get('/admin/services/edit/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    const service = await Service.findOne({ id: req.params.id });
    if (!service) {
        req.session.messages = { error: 'Service not found.' };
        return res.redirect('/admin/services');
    }
    res.render('admin/service-edit', {
        admin: req.admin,
        service,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Edit Service'
    });
    req.session.messages = {};
});

app.post('/admin/services/edit/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    const { name, description, price, category } = req.body;
    const service = await Service.findOne({ id: req.params.id });
    if (!service) {
        req.session.messages = { error: 'Service not found.' };
        return res.redirect('/admin/services');
    }
    if (name) service.name = name;
    if (description !== undefined) service.description = description;
    if (price !== undefined) service.price = parseInt(price) || 0;
    if (category) service.category = category;
    await service.save();
    req.session.messages = { success: '✅ Service updated successfully!' };
    res.redirect('/admin/services');
});

// ============================================================
// ADMIN MANAGE ADMINS
// ============================================================
app.get('/admin/manage-admins', blockMobileAdmin, requireAdmin, async (req, res) => {
    const users = await User.find();
    const admins = users.filter(u => u.isAdmin);
    const nonAdmins = users.filter(u => !u.isAdmin);
    res.render('admin/manage-admins', {
        admins,
        nonAdmins,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Manage Admins'
    });
    req.session.messages = {};
});

app.post('/admin/make-admin/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    if (user) {
        user.isAdmin = true;
        await user.save();
        req.session.messages = { success: '✅ User is now an admin!' };
    }
    res.redirect('/admin/manage-admins');
});

app.post('/admin/remove-admin/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    if (user && user.email !== 'balogunmustaphaaddeji@gmail.com') {
        user.isAdmin = false;
        await user.save();
        req.session.messages = { success: '✅ Admin privileges removed.' };
    } else {
        req.session.messages = { error: 'Cannot remove the main admin.' };
    }
    res.redirect('/admin/manage-admins');
});

// ============================================================
// START SERVER
// ============================================================
async function startServer() {
    try {
        const adminExists = await User.findOne({ email: 'balogunmustaphaaddeji@gmail.com' });
        if (!adminExists) {
            const hashed = await bcrypt.hash('SHINEXAdmin@2026', 10);
            const admin = new User({
                id: generateId(),
                firstName: 'Admin',
                lastName: 'User',
                email: 'balogunmustaphaaddeji@gmail.com',
                password: hashed,
                studentId: 'SLC-2026-ADMIN-001',
                isAdmin: true,
                isVerified: true,
                createdAt: new Date()
            });
            await admin.save();
            console.log('✅ Admin created: balogunmustaphaaddeji@gmail.com / SHINEXAdmin@2026');
        }

        app.listen(PORT, () => {
            console.log(`\n🚀 SHINEX running on http://localhost:${PORT}`);
            console.log(`🔐 Admin: balogunmustaphaaddeji@gmail.com / SHINEXAdmin@2026`);
            console.log(`📚 Admin Login: http://localhost:${PORT}/shinex-admin`);
            console.log(`📧 Test Email: http://localhost:${PORT}/test-email`);
            console.log(`📚 MongoDB connected. Data is now PERSISTENT!\n`);
            
            if (useSendGrid) {
                console.log(`✅ Email configured with SendGrid`);
                console.log(`📧 Email status: READY TO SEND\n`);
            } else if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
                console.log(`✅ Email configured with Gmail: ${process.env.EMAIL_USER}`);
                console.log(`📧 Email status: READY TO SEND\n`);
            } else {
                console.log('⚠️ Email not configured. Create .env file with:');
                console.log('   SENDGRID_API_KEY=your-key-here');
                console.log('   EMAIL_FROM=shinexlearning@gmail.com\n');
            }
        });
    } catch (error) {
        console.error('❌ Server startup error:', error);
    }
}

startServer();