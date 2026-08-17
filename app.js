const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const sgMail = require('@sendgrid/mail');
const compression = require('compression');
const helmet = require('helmet');
const multer = require('multer');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// FILE UPLOAD CONFIGURATION
// ============================================================

const uploadDir = path.join(__dirname, 'public/uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'lesson-' + uniqueSuffix + ext);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WEBP, SVG)'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024
    }
});

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
// MONGODB CONNECTION
// ============================================================
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shinex';

mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

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

// ============================================================
// EMAIL SYSTEM - SENDGRID
// ============================================================

let useSendGrid = false;
if (process.env.SENDGRID_API_KEY) {
    try {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        useSendGrid = true;
        console.log('SendGrid configured successfully');
    } catch (error) {
        console.error('SendGrid configuration error:', error.message);
        useSendGrid = false;
    }
} else {
    console.log('SENDGRID_API_KEY not found. Emails will be logged.');
}

const emailQueue = [];
let isProcessingQueue = false;
const emailRetryMap = new Map();

async function processEmailQueue() {
    if (isProcessingQueue || emailQueue.length === 0) return;
    
    isProcessingQueue = true;
    
    while (emailQueue.length > 0) {
        const emailJob = emailQueue.shift();
        const key = `${emailJob.to}-${emailJob.subject}`;
        
        try {
            const result = await sendEmailDirect(emailJob.to, emailJob.subject, emailJob.html);
            if (result.success) {
                console.log('Queued email sent to:', emailJob.to);
                emailRetryMap.delete(key);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Failed to send queued email to', emailJob.to, ':', error.message);
            
            const retryCount = emailRetryMap.get(key) || 0;
            if (retryCount < 3) {
                emailRetryMap.set(key, retryCount + 1);
                emailQueue.push(emailJob);
                console.log('Retry', retryCount + 1, '/3 for', emailJob.to);
            } else {
                console.log('Failed after 3 retries:', emailJob.to);
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

async function sendEmailDirect(to, subject, html, from = null) {
    if (useSendGrid) {
        try {
            const msg = {
                to: to,
                from: from || process.env.EMAIL_FROM || 'shinexlearning@gmail.com',
                subject: subject,
                html: html,
                trackingSettings: {
                    clickTracking: { enable: true },
                    openTracking: { enable: true }
                }
            };
            
            await sgMail.send(msg);
            console.log('Email sent via SendGrid to:', to);
            return { success: true, service: 'SendGrid' };
            
        } catch (error) {
            console.error('SendGrid error:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    console.log('EMAIL LOGGED (no service):', to);
    return { success: true, queued: true, service: 'Log' };
}

async function sendEmail(to, subject, html, from = null) {
    if (!useSendGrid) {
        console.log('EMAIL QUEUED (no SendGrid):', to);
        queueEmail(to, subject, html);
        return { success: true, queued: true };
    }
    
    const result = await sendEmailDirect(to, subject, html, from);
    
    if (!result.success) {
        queueEmail(to, subject, html);
        return { success: false, error: result.error, queued: true };
    }
    
    return result;
}

// ============================================================
// AI TUTOR
// ============================================================
app.post('/api/ai-tutor', async (req, res) => {
    const { userPrompt } = req.body;
    
    if (!userPrompt || userPrompt.trim().length === 0) {
        return res.status(400).json({ 
            error: 'Please enter a question or topic to learn about.' 
        });
    }

    const GROQ_API_KEY = process.env.GROQ_API_KEY;
    if (!GROQ_API_KEY) {
        console.error('GROQ_API_KEY not found');
        return res.status(503).json({ 
            error: 'AI service is currently unavailable.' 
        });
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'mixtral-8x7b-32768',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an educational AI assistant for SHINEX Learning Circle. Explain concepts clearly and simply.'
                    },
                    {
                        role: 'user',
                        content: `Explain this clearly: ${userPrompt}`
                    }
                ],
                max_tokens: 800,
                temperature: 0.7
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Groq API Error:', errorData);
            return res.status(503).json({ 
                error: 'AI service is temporarily unavailable.' 
            });
        }

        const data = await response.json();
        const answer = data.choices && data.choices[0] && data.choices[0].message 
            ? data.choices[0].message.content 
            : 'I could not generate a response. Please try again.';
        
        res.json({ 
            success: true,
            answer: answer 
        });

    } catch (error) {
        console.error('AI Tutor error:', error);
        res.status(500).json({ 
            error: 'Something went wrong. Please try again.' 
        });
    }
});

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

async function requireUser(req, res, next) {
    if (!req.session.userId) {
        req.session.messages = { error: 'Please log in to access this page.' };
        return res.redirect('/app/login');
    }
    
    try {
        const user = await User.findOne({ id: req.session.userId });
        if (!user) {
            req.session.destroy();
            req.session.messages = { error: 'Session expired. Please log in again.' };
            return res.redirect('/app/login');
        }
        
        if (user.isAdmin) {
            return res.redirect('/admin/dashboard');
        }
        
        req.user = user;
        next();
    } catch (error) {
        console.error('Auth error:', error);
        req.session.messages = { error: 'Authentication error. Please try again.' };
        res.redirect('/app/login');
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
// ===== MOBILE APP ROUTES =====
// ============================================================

// ===== APP HOME =====
app.get('/app', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    const courses = await Course.find();
    const services = await Service.find({ isActive: true });
    
    res.render('app/index', {
        user: user,
        courses: courses.slice(0, 6),
        services: services.slice(0, 4),
        messages: req.session.messages || {},
        title: 'Home'
    });
    req.session.messages = {};
});

// ===== APP DASHBOARD =====
app.get('/app/dashboard', requireUser, async (req, res) => {
    const user = req.user;
    const courses = await Course.find();
    const enrolledCourse = user.courseId ? await Course.findOne({ id: user.courseId }) : null;
    
    let totalClasses = 0, completedClasses = 0, certificatesEarned = 0;
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
        certificatesEarned = Math.floor(completedClasses / 10);
    }
    const progress = totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0;
    const coursesEnrolled = user.courseId ? 1 : 0;
    
    res.render('app/dashboard', {
        user: user,
        enrolledCourse: enrolledCourse,
        progress: progress,
        completedClasses: completedClasses,
        totalClasses: totalClasses,
        coursesEnrolled: coursesEnrolled,
        certificatesEarned: certificatesEarned,
        courses: courses.slice(0, 6),
        messages: req.session.messages || {},
        title: 'Dashboard'
    });
    req.session.messages = {};
});

// ===== APP COURSES =====
app.get('/app/courses', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    const courses = await Course.find();
    
    res.render('app/courses', {
        user: user,
        courses: courses,
        messages: req.session.messages || {},
        title: 'Courses'
    });
    req.session.messages = {};
});

// ===== APP COURSE DETAIL =====
app.get('/app/course/:courseId', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    const course = await Course.findOne({ id: req.params.courseId });
    
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/app/courses');
    }
    
    let totalClasses = 0;
    let completedClasses = 0;
    if (course.levels && user && user.progress) {
        course.levels.forEach(level => {
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
    }
    const progress = totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0;
    
    res.render('app/course-detail', {
        user: user,
        course: course,
        progress: progress,
        completedClasses: completedClasses,
        totalClasses: totalClasses,
        messages: req.session.messages || {},
        title: course.title
    });
    req.session.messages = {};
});

// ===== APP LEVEL VIEW =====
app.get('/app/level/:courseId/:levelId', requireUser, async (req, res) => {
    const user = req.user;
    const course = await Course.findOne({ id: req.params.courseId });
    
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/app/courses');
    }
    
    const level = course.levels.find(l => l.id === req.params.levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect('/app/course/' + req.params.courseId);
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
    
    res.render('app/level-view', {
        user: user,
        course: course,
        level: level,
        currentClass: currentClass,
        currentLesson: currentLesson,
        allClasses: allClasses,
        totalClasses: totalClasses,
        completedClasses: completedClasses,
        progress: progress,
        score: score,
        prevClassId: prevClassId,
        nextClassId: nextClassId,
        messages: req.session.messages || {},
        title: level.name
    });
    req.session.messages = {};
});

// ===== APP AI TUTOR =====
app.get('/app/ai-tutor', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    res.render('app/ai-tutor', {
        user: user,
        messages: req.session.messages || {},
        title: 'AI Tutor'
    });
    req.session.messages = {};
});

// ===== APP PROFILE =====
app.get('/app/profile', requireUser, async (req, res) => {
    const user = req.user;
    res.render('app/profile', {
        user: user,
        messages: req.session.messages || {},
        title: 'Profile'
    });
    req.session.messages = {};
});

// ===== APP SETTINGS =====
app.get('/app/settings', requireUser, async (req, res) => {
    const user = req.user;
    res.render('app/settings', {
        user: user,
        messages: req.session.messages || {},
        title: 'Settings'
    });
    req.session.messages = {};
});

// ===== APP LOGIN =====
app.get('/app/login', (req, res) => {
    if (req.session.userId) return res.redirect('/app/dashboard');
    res.render('app/login', {
        messages: req.session.messages || {},
        title: 'Login'
    });
    req.session.messages = {};
});

app.post('/app/login', async (req, res) => {
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
            return res.redirect('/app/login');
        }
        
        const match = await bcrypt.compare(password, user.password);
        if (!match) {
            req.session.messages = { error: 'Invalid password.' };
            return res.redirect('/app/login');
        }
        
        if (!user.isVerified) {
            req.session.messages = { error: 'Please verify your email first.' };
            return res.redirect('/app/login');
        }
        
        if (user.isAdmin) {
            req.session.adminId = user.id;
            return res.redirect('/admin/dashboard');
        }
        
        req.session.userId = user.id;
        req.session.messages = { success: 'Welcome back, ' + user.firstName + '!' };
        res.redirect('/app/dashboard');
        
    } catch (error) {
        console.error('Login error:', error);
        req.session.messages = { error: 'Something went wrong. Please try again.' };
        res.redirect('/app/login');
    }
});

// ===== APP REGISTER =====
app.get('/app/register', (req, res) => {
    if (req.session.userId) return res.redirect('/app/dashboard');
    const courses = Object.keys(COURSE_CODES);
    res.render('app/register', {
        courses: courses,
        messages: req.session.messages || {},
        title: 'Register'
    });
    req.session.messages = {};
});

app.post('/app/register', async (req, res) => {
    const { 
        firstName, lastName, email, phone,
        courseName, learningLevel,
        password, confirmPassword
    } = req.body;
    
    if (!firstName || !lastName || !email || !password || !courseName) {
        req.session.messages = { error: 'All required fields must be filled.' };
        return res.redirect('/app/register');
    }
    
    if (password !== confirmPassword) {
        req.session.messages = { error: 'Passwords do not match.' };
        return res.redirect('/app/register');
    }
    
    if (password.length < 6) {
        req.session.messages = { error: 'Password must be at least 6 characters.' };
        return res.redirect('/app/register');
    }
    
    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            req.session.messages = { error: 'Email already registered.' };
            return res.redirect('/app/register');
        }
        
        const courseCode = COURSE_CODES[courseName];
        if (!courseCode) {
            req.session.messages = { error: 'Invalid course selected.' };
            return res.redirect('/app/register');
        }
        const studentId = await generateStudentId(courseCode);
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = generateToken();
        
        const newUser = new User({
            id: generateId(),
            studentId: studentId,
            firstName,
            lastName,
            email,
            phone: phone || '',
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
                    <h1 style="color: #8B5CF6; font-size: 28px;">Welcome to SHINEX!</h1>
                </div>
                <div style="background: #fff; padding: 30px; border-radius: 12px;">
                    <h2 style="color: #1A0A2E;">Verify Your Email</h2>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Dear <strong>${firstName} ${lastName}</strong>,
                    </p>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Thank you for registering with SHINEX Learning Circle. Please verify your email to activate your account.
                    </p>
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${verificationLink}" 
                           style="background: #8B5CF6; color: #fff; padding: 12px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                            Verify Email
                        </a>
                    </div>
                    <p style="color: #7a6a8f; font-size: 12px; text-align: center;">
                        This link expires in 24 hours.
                    </p>
                </div>
                <div style="text-align: center; padding: 16px 0; color: #7a6a8f; font-size: 12px;">
                    <p>Learn. Understand. Protect.</p>
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
        
        req.session.messages = { success: 'Registration successful! Please check your email to verify.' };
        res.redirect('/app/login');
        
    } catch (error) {
        console.error('Registration error:', error);
        req.session.messages = { error: 'Something went wrong. Please try again.' };
        res.redirect('/app/register');
    }
});

// ===== APP LOGOUT =====
app.get('/app/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Logout error:', err);
        res.redirect('/app/login');
    });
});

// ===== APP PROGRESS ROUTES =====
app.post('/app/level/complete/:classId', requireUser, async (req, res) => {
    const { classId } = req.params;
    const user = req.user;
    
    if (!user.progress) user.progress = {};
    user.progress[classId] = true;
    await user.save();
    
    const totalCompleted = Object.keys(user.progress).length;
    res.json({ success: true, completed: totalCompleted });
});

app.get('/app/level/:courseId/:levelId/next/:classId', requireUser, async (req, res) => {
    const { courseId, levelId, classId } = req.params;
    const user = req.user;
    
    if (!user.progress) user.progress = {};
    user.progress[classId] = true;
    await user.save();
    
    const course = await Course.findOne({ id: courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/app/courses');
    }
    
    const level = course.levels.find(l => l.id === levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect('/app/course/' + courseId);
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
        success: 'Class completed! +10 points! (' + totalCompleted + '/' + totalClasses + ' done - ' + progressPercent + '%)' 
    };
    
    if (nextClassId) {
        res.redirect('/app/level/' + courseId + '/' + levelId + '?classId=' + nextClassId);
    } else {
        req.session.messages = { 
            success: 'All classes completed! You finished this level! (' + totalCompleted + '/' + totalClasses + ')' 
        };
        res.redirect('/app/course/' + courseId);
    }
});

app.get('/app/level/:courseId/:levelId/prev/:classId', requireUser, async (req, res) => {
    const { courseId, levelId, classId } = req.params;
    
    const course = await Course.findOne({ id: courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/app/courses');
    }
    
    const level = course.levels.find(l => l.id === levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect('/app/course/' + courseId);
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
        res.redirect('/app/level/' + courseId + '/' + levelId + '?classId=' + prevClassId);
    } else {
        req.session.messages = { error: 'This is the first class.' };
        res.redirect('/app/level/' + courseId + '/' + levelId + '?classId=' + classId);
    }
});

// ============================================================
// ===== REDIRECT ROOT =====
// ============================================================
app.get('/', (req, res) => {
    if (isMobile(req)) {
        res.redirect('/app');
    } else {
        res.redirect('/');
    }
});

// ============================================================
// ===== VERIFICATION ROUTES =====
// ============================================================
app.get('/verify-email-sent', (req, res) => {
    const user = req.session.tempUser || null;
    
    if (!user) {
        return res.redirect('/app/register');
    }
    
    res.render('app/verify-sent', {
        user: user,
        messages: req.session.messages || {},
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
                    <h1 style="color: #8B5CF6; font-size: 28px;">Resend Verification</h1>
                    <p style="color: #7a6a8f;">SHINEX Learning Circle</p>
                </div>
                <div style="background: #fff; padding: 30px; border-radius: 12px;">
                    <h2 style="color: #1A0A2E;">New Verification Link</h2>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Dear <strong>${user.firstName}</strong>,
                    </p>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        You requested a new verification link.
                    </p>
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${verificationLink}" 
                           style="background: #8B5CF6; color: #fff; padding: 12px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                            Verify Email
                        </a>
                    </div>
                    <p style="color: #7a6a8f; font-size: 12px; text-align: center;">
                        This link expires in 24 hours.
                    </p>
                </div>
                <div style="text-align: center; padding: 16px 0; color: #7a6a8f; font-size: 12px;">
                    <p>Learn. Understand. Protect.</p>
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
            return res.render('app/verify-error', {
                user: null,
                messages: { error: 'Invalid or expired verification token.' },
                title: 'Verification Failed'
            });
        }
        
        user.isVerified = true;
        user.verificationToken = null;
        await user.save();
        
        const congratsHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f6fc; border-radius: 12px;">
                <div style="text-align: center; padding: 20px 0;">
                    <h1 style="color: #27ae60; font-size: 28px;">Welcome to SHINEX!</h1>
                    <p style="color: #7a6a8f; font-size: 14px;">Your student journey begins now</p>
                </div>
                <div style="background: #fff; padding: 30px; border-radius: 12px;">
                    <h2 style="color: #1A0A2E;">Congratulations, ${user.firstName}!</h2>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Your email has been verified and your account is now fully active.
                    </p>
                    <div style="background: linear-gradient(135deg, #8B5CF6, #6a3dcf); padding: 20px; border-radius: 12px; margin: 16px 0; text-align: center; color: #fff;">
                        <div style="font-size: 12px; opacity: 0.8; text-transform: uppercase; letter-spacing: 2px;">Your Student ID</div>
                        <div style="font-size: 32px; font-weight: 800; letter-spacing: 2px; margin: 4px 0;">${user.studentId}</div>
                        <div style="font-size: 14px; opacity: 0.9;">Use this ID to login to your dashboard</div>
                    </div>
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="/app/dashboard" 
                           style="background: #8B5CF6; color: #fff; padding: 14px 36px; border-radius: 30px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
                            Go to Dashboard
                        </a>
                    </div>
                </div>
                <div style="text-align: center; padding: 16px 0; color: #7a6a8f; font-size: 12px;">
                    <p>Learn. Understand. Protect.</p>
                </div>
            </div>
        `;
        
        await sendEmail(
            user.email,
            'Welcome to SHINEX Learning Circle - Your Student ID: ' + user.studentId,
            congratsHtml
        );
        
        req.session.tempUser = null;
        req.session.userId = user.id;
        
        res.render('app/verify-success', {
            user: user,
            messages: { success: 'Your email has been verified successfully!' },
            title: 'Email Verified'
        });
        
    } catch (error) {
        console.error('Verification error:', error);
        res.render('app/verify-error', {
            user: null,
            messages: { error: 'Something went wrong. Please try again.' },
            title: 'Verification Failed'
        });
    }
});

// ============================================================
// ===== CONTACT ROUTES =====
// ============================================================
app.get('/contact', (req, res) => {
    if (isMobile(req)) {
        res.render('app/contact', {
            user: null,
            messages: req.session.messages || {},
            title: 'Contact Us'
        });
    } else {
        res.render('desktop/contact', {
            user: null,
            messages: req.session.messages || {},
            title: 'Contact Us'
        });
    }
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
                    <h1 style="color: #8B5CF6; font-size: 28px;">New Contact Message</h1>
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
        
        await sendEmail(adminEmail, 'New Contact Message from ' + name + ' - ' + subject, adminHtml);
        
        const userHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f8f6fc; border-radius: 12px;">
                <div style="text-align: center; padding: 20px 0;">
                    <h1 style="color: #8B5CF6; font-size: 28px;">Message Received</h1>
                </div>
                <div style="background: #fff; padding: 24px; border-radius: 12px;">
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Dear <strong>${name}</strong>,
                    </p>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Thank you for contacting SHINEX Learning Circle. We have received your message and will get back to you within 24-48 hours.
                    </p>
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="/app" 
                           style="background: #8B5CF6; color: #fff; padding: 12px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                            Explore Our Courses
                        </a>
                    </div>
                </div>
                <div style="text-align: center; padding: 16px 0; color: #7a6a8f; font-size: 12px;">
                    <p>Learn. Understand. Protect.</p>
                </div>
            </div>
        `;
        
        await sendEmail(email, 'We Received Your Message - SHINEX Learning Circle', userHtml);
        
        req.session.messages = { success: 'Your message has been sent. We\'ll get back to you soon!' };
        res.redirect('/contact');
        
    } catch (error) {
        console.error('Contact error:', error);
        req.session.messages = { error: 'Something went wrong. Please try again.' };
        res.redirect('/contact');
    }
});

// ============================================================
// ===== APP LEGAL PAGES (Privacy, FAQ, Terms, About) =====
// ============================================================

app.get('/app/privacy', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    res.render('app/privacy', {
        user: user,
        messages: req.session.messages || {},
        title: 'Privacy Policy'
    });
    req.session.messages = {};
});

app.get('/app/faq', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    res.render('app/faq', {
        user: user,
        messages: req.session.messages || {},
        title: 'FAQ'
    });
    req.session.messages = {};
});

app.get('/app/terms', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    res.render('app/terms', {
        user: user,
        messages: req.session.messages || {},
        title: 'Terms & Conditions'
    });
    req.session.messages = {};
});

app.get('/app/about', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    res.render('app/about', {
        user: user,
        messages: req.session.messages || {},
        title: 'About Us'
    });
    req.session.messages = {};
});

// ===== DESKTOP LEGAL PAGES =====
app.get('/privacy', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    res.render('desktop/privacy', {
        user: user,
        messages: req.session.messages || {},
        title: 'Privacy Policy'
    });
    req.session.messages = {};
});

app.get('/faq', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    res.render('desktop/faq', {
        user: user,
        messages: req.session.messages || {},
        title: 'FAQ'
    });
    req.session.messages = {};
});

app.get('/terms', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    res.render('desktop/terms', {
        user: user,
        messages: req.session.messages || {},
        title: 'Terms & Conditions'
    });
    req.session.messages = {};
});

app.get('/about', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    res.render('desktop/about', {
        user: user,
        messages: req.session.messages || {},
        title: 'About Us'
    });
    req.session.messages = {};
});

// ============================================================
// ===== DESKTOP ROUTES =====
// ============================================================

app.get('/', async (req, res) => {
    if (isMobile(req)) {
        return res.redirect('/app');
    }
    
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    const courses = await Course.find();
    
    res.render('desktop/index', {
        user: user,
        courses: courses.slice(0, 6),
        messages: req.session.messages || {},
        title: 'Home'
    });
    req.session.messages = {};
});

app.get('/dashboard', requireUser, async (req, res) => {
    if (isMobile(req)) return res.redirect('/app/dashboard');
    
    const user = req.user;
    const courses = await Course.find();
    const enrolledCourse = user.courseId ? await Course.findOne({ id: user.courseId }) : null;
    
    let totalClasses = 0, completedClasses = 0, certificatesEarned = 0;
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
        certificatesEarned = Math.floor(completedClasses / 10);
    }
    const progress = totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0;
    const coursesEnrolled = user.courseId ? 1 : 0;
    
    res.render('desktop/dashboard', {
        user: user,
        courses: courses,
        enrolledCourse: enrolledCourse,
        progress: progress,
        completedClasses: completedClasses,
        totalClasses: totalClasses,
        coursesEnrolled: coursesEnrolled,
        certificatesEarned: certificatesEarned,
        messages: req.session.messages || {},
        title: 'Dashboard'
    });
    req.session.messages = {};
});

app.get('/courses', async (req, res) => {
    if (isMobile(req)) return res.redirect('/app/courses');
    
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    const courses = await Course.find();
    
    res.render('desktop/courses', {
        user: user,
        courses: courses,
        messages: req.session.messages || {},
        title: 'Courses'
    });
    req.session.messages = {};
});

app.get('/course/:courseId', async (req, res) => {
    if (isMobile(req)) return res.redirect('/app/course/' + req.params.courseId);
    
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    const course = await Course.findOne({ id: req.params.courseId });
    
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/courses');
    }
    
    let totalClasses = 0, completedClasses = 0;
    if (course.levels && user && user.progress) {
        course.levels.forEach(level => {
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
    }
    const progress = totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0;
    
    res.render('desktop/course-detail', {
        user: user,
        course: course,
        progress: progress,
        completedClasses: completedClasses,
        totalClasses: totalClasses,
        messages: req.session.messages || {},
        title: course.title
    });
    req.session.messages = {};
});

app.get('/level/:courseId/:levelId', requireUser, async (req, res) => {
    if (isMobile(req)) return res.redirect('/app/level/' + req.params.courseId + '/' + req.params.levelId);
    
    const user = req.user;
    const course = await Course.findOne({ id: req.params.courseId });
    
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/courses');
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
    
    res.render('desktop/level-view', {
        user: user,
        course: course,
        level: level,
        currentClass: currentClass,
        currentLesson: currentLesson,
        allClasses: allClasses,
        totalClasses: totalClasses,
        completedClasses: completedClasses,
        progress: progress,
        score: score,
        prevClassId: prevClassId,
        nextClassId: nextClassId,
        messages: req.session.messages || {},
        title: level.name
    });
    req.session.messages = {};
});

app.get('/ai-tutor', async (req, res) => {
    if (isMobile(req)) return res.redirect('/app/ai-tutor');
    
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    res.render('desktop/ai-tutor', {
        user: user,
        messages: req.session.messages || {},
        title: 'AI Tutor'
    });
    req.session.messages = {};
});

app.get('/profile', requireUser, async (req, res) => {
    if (isMobile(req)) return res.redirect('/app/profile');
    
    const user = req.user;
    res.render('desktop/profile', {
        user: user,
        messages: req.session.messages || {},
        title: 'Profile'
    });
    req.session.messages = {};
});

app.get('/settings', requireUser, async (req, res) => {
    if (isMobile(req)) return res.redirect('/app/settings');
    
    const user = req.user;
    res.render('desktop/settings', {
        user: user,
        messages: req.session.messages || {},
        title: 'Settings'
    });
    req.session.messages = {};
});

app.get('/login', (req, res) => {
    if (isMobile(req)) return res.redirect('/app/login');
    if (req.session.userId) return res.redirect('/dashboard');
    
    res.render('desktop/login', {
        messages: req.session.messages || {},
        title: 'Login'
    });
    req.session.messages = {};
});

app.post('/login', async (req, res) => {
    if (isMobile(req)) {
        const { identifier, password } = req.body;
        req.body = { identifier, password };
        return app.handle(req, res, '/app/login');
    }
    
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
            req.session.messages = { error: 'Please verify your email first.' };
            return res.redirect('/login');
        }
        
        if (user.isAdmin) {
            req.session.adminId = user.id;
            return res.redirect('/admin/dashboard');
        }
        
        req.session.userId = user.id;
        req.session.messages = { success: 'Welcome back, ' + user.firstName + '!' };
        res.redirect('/dashboard');
        
    } catch (error) {
        console.error('Login error:', error);
        req.session.messages = { error: 'Something went wrong. Please try again.' };
        res.redirect('/login');
    }
});

app.get('/register', (req, res) => {
    if (isMobile(req)) return res.redirect('/app/register');
    if (req.session.userId) return res.redirect('/dashboard');
    
    const courses = Object.keys(COURSE_CODES);
    res.render('desktop/register', {
        courses: courses,
        messages: req.session.messages || {},
        title: 'Register'
    });
    req.session.messages = {};
});

app.post('/register', async (req, res) => {
    if (isMobile(req)) {
        return app.handle(req, res, '/app/register');
    }
    
    const { 
        firstName, lastName, email, phone,
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
            lastName,
            email,
            phone: phone || '',
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
                    <h1 style="color: #8B5CF6; font-size: 28px;">Welcome to SHINEX!</h1>
                </div>
                <div style="background: #fff; padding: 30px; border-radius: 12px;">
                    <h2 style="color: #1A0A2E;">Verify Your Email</h2>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Dear <strong>${firstName} ${lastName}</strong>,
                    </p>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Thank you for registering with SHINEX Learning Circle. Please verify your email to activate your account.
                    </p>
                    <div style="text-align: center; margin: 25px 0;">
                        <a href="${verificationLink}" 
                           style="background: #8B5CF6; color: #fff; padding: 12px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                            Verify Email
                        </a>
                    </div>
                    <p style="color: #7a6a8f; font-size: 12px; text-align: center;">
                        This link expires in 24 hours.
                    </p>
                </div>
                <div style="text-align: center; padding: 16px 0; color: #7a6a8f; font-size: 12px;">
                    <p>Learn. Understand. Protect.</p>
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
        
        req.session.messages = { success: 'Registration successful! Please check your email to verify.' };
        res.redirect('/login');
        
    } catch (error) {
        console.error('Registration error:', error);
        req.session.messages = { error: 'Something went wrong. Please try again.' };
        res.redirect('/register');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) console.error('Logout error:', err);
        res.redirect('/');
    });
});

// ============================================================
// ===== ADMIN ROUTES =====
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
    req.session.messages = { success: 'Course added successfully!' };
    res.redirect('/admin/courses');
});

app.post('/admin/courses/delete/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    await Course.findOneAndDelete({ id: req.params.id });
    await User.updateMany({ courseId: req.params.id }, { $set: { courseId: null, progress: {} } });
    req.session.messages = { success: 'Course deleted.' };
    res.redirect('/admin/courses');
});

app.post('/admin/courses/delete-all', blockMobileAdmin, requireAdmin, async (req, res) => {
    await Course.deleteMany({});
    await User.updateMany({}, { $set: { courseId: null, progress: {} } });
    req.session.messages = { success: 'All courses deleted!' };
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
    req.session.messages = { success: 'Course updated!' };
    res.redirect('/admin/courses');
});

app.post('/admin/courses/:id/levels/add', blockMobileAdmin, requireAdmin, async (req, res) => {
    const { name, duration } = req.body;
    if (!name || !duration) {
        req.session.messages = { error: 'Level name and duration required.' };
        return res.redirect('/admin/courses/edit/' + req.params.id);
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
    req.session.messages = { success: 'Level added!' };
    res.redirect('/admin/courses/edit/' + req.params.id);
});

app.post('/admin/courses/:id/levels/delete/:levelId', blockMobileAdmin, requireAdmin, async (req, res) => {
    const course = await Course.findOne({ id: req.params.id });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    course.levels = course.levels.filter(l => l.id !== req.params.levelId);
    await course.save();
    req.session.messages = { success: 'Level deleted.' };
    res.redirect('/admin/courses/edit/' + req.params.id);
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
        return res.redirect('/admin/courses/edit/' + req.params.courseId);
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
        return res.redirect('/admin/levels/edit/' + req.params.courseId + '/' + req.params.levelId);
    }
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    const level = course.levels.find(l => l.id === req.params.levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect('/admin/courses/edit/' + req.params.courseId);
    }
    level.lessons.push({
        id: generateId(),
        title,
        description: description || '',
        classes: []
    });
    await course.save();
    req.session.messages = { success: 'Lesson added!' };
    res.redirect('/admin/levels/edit/' + req.params.courseId + '/' + req.params.levelId);
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
        return res.redirect('/admin/courses/edit/' + req.params.courseId);
    }
    level.lessons = level.lessons.filter(l => l.id !== req.params.lessonId);
    await course.save();
    req.session.messages = { success: 'Lesson deleted.' };
    res.redirect('/admin/levels/edit/' + req.params.courseId + '/' + req.params.levelId);
});

app.post('/admin/levels/:courseId/:levelId/lessons/:lessonId/classes/add',
    blockMobileAdmin,
    requireAdmin,
    upload.single('classImage'),
    async (req, res) => {
        const { title, content, videoUrl, externalLink } = req.body;
        const courseId = req.params.courseId;
        const levelId = req.params.levelId;
        const lessonId = req.params.lessonId;
        
        if (!title || !content) {
            req.session.messages = { error: 'Class title and content required.' };
            return res.redirect('/admin/levels/edit/' + courseId + '/' + levelId);
        }
        
        try {
            const course = await Course.findOne({ id: courseId });
            if (!course) {
                req.session.messages = { error: 'Course not found.' };
                return res.redirect('/admin/courses');
            }
            
            const level = course.levels.find(l => l.id === levelId);
            if (!level) {
                req.session.messages = { error: 'Level not found.' };
                return res.redirect('/admin/courses/edit/' + courseId);
            }
            
            const lesson = level.lessons.find(l => l.id === lessonId);
            if (!lesson) {
                req.session.messages = { error: 'Lesson not found.' };
                return res.redirect('/admin/levels/edit/' + courseId + '/' + levelId);
            }
            
            let imageUrl = '';
            if (req.file) {
                imageUrl = '/uploads/' + req.file.filename;
            }
            
            if (!imageUrl && req.body.imageUrl) {
                imageUrl = req.body.imageUrl;
            }
            
            const newClass = {
                id: generateId(),
                title: title,
                content: sanitize(content),
                imageUrl: imageUrl,
                videoUrl: videoUrl || '',
                externalLink: externalLink || ''
            };
            
            lesson.classes.push(newClass);
            await course.save();
            
            req.session.messages = { success: 'Class added successfully!' };
            res.redirect('/admin/levels/edit/' + courseId + '/' + levelId);
            
        } catch (error) {
            console.error('Add class error:', error);
            req.session.messages = { error: 'Something went wrong. Please try again.' };
            res.redirect('/admin/levels/edit/' + courseId + '/' + levelId);
        }
    }
);

app.post('/admin/levels/:courseId/:levelId/lessons/:lessonId/classes/edit/:classId',
    blockMobileAdmin,
    requireAdmin,
    upload.single('classImage'),
    async (req, res) => {
        const { title, content, videoUrl, externalLink } = req.body;
        const courseId = req.params.courseId;
        const levelId = req.params.levelId;
        const lessonId = req.params.lessonId;
        const classId = req.params.classId;
        
        try {
            const course = await Course.findOne({ id: courseId });
            if (!course) {
                req.session.messages = { error: 'Course not found.' };
                return res.redirect('/admin/courses');
            }
            
            const level = course.levels.find(l => l.id === levelId);
            if (!level) {
                req.session.messages = { error: 'Level not found.' };
                return res.redirect('/admin/courses/edit/' + courseId);
            }
            
            const lesson = level.lessons.find(l => l.id === lessonId);
            if (!lesson) {
                req.session.messages = { error: 'Lesson not found.' };
                return res.redirect('/admin/levels/edit/' + courseId + '/' + levelId);
            }
            
            const classItem = lesson.classes.find(c => c.id === classId);
            if (!classItem) {
                req.session.messages = { error: 'Class not found.' };
                return res.redirect('/admin/levels/edit/' + courseId + '/' + levelId);
            }
            
            classItem.title = title || classItem.title;
            classItem.content = sanitize(content || classItem.content);
            classItem.videoUrl = videoUrl || '';
            classItem.externalLink = externalLink || '';
            
            if (req.file) {
                if (classItem.imageUrl && classItem.imageUrl.startsWith('/uploads/')) {
                    const oldImagePath = path.join(__dirname, 'public', classItem.imageUrl);
                    if (fs.existsSync(oldImagePath)) {
                        fs.unlinkSync(oldImagePath);
                    }
                }
                classItem.imageUrl = '/uploads/' + req.file.filename;
            } else if (req.body.imageUrl !== undefined) {
                classItem.imageUrl = req.body.imageUrl || '';
            }
            
            await course.save();
            
            req.session.messages = { success: 'Class updated successfully!' };
            res.redirect('/admin/levels/edit/' + courseId + '/' + levelId);
            
        } catch (error) {
            console.error('Edit class error:', error);
            req.session.messages = { error: 'Something went wrong. Please try again.' };
            res.redirect('/admin/levels/edit/' + courseId + '/' + levelId);
        }
    }
);

app.post('/admin/levels/:courseId/:levelId/lessons/:lessonId/classes/delete/:classId',
    blockMobileAdmin,
    requireAdmin,
    async (req, res) => {
        const courseId = req.params.courseId;
        const levelId = req.params.levelId;
        const lessonId = req.params.lessonId;
        const classId = req.params.classId;
        
        try {
            const course = await Course.findOne({ id: courseId });
            if (!course) {
                req.session.messages = { error: 'Course not found.' };
                return res.redirect('/admin/courses');
            }
            
            const level = course.levels.find(l => l.id === levelId);
            if (!level) {
                req.session.messages = { error: 'Level not found.' };
                return res.redirect('/admin/courses/edit/' + courseId);
            }
            
            const lesson = level.lessons.find(l => l.id === lessonId);
            if (!lesson) {
                req.session.messages = { error: 'Lesson not found.' };
                return res.redirect('/admin/levels/edit/' + courseId + '/' + levelId);
            }
            
            const classItem = lesson.classes.find(c => c.id === classId);
            if (classItem && classItem.imageUrl && classItem.imageUrl.startsWith('/uploads/')) {
                const imagePath = path.join(__dirname, 'public', classItem.imageUrl);
                if (fs.existsSync(imagePath)) {
                    fs.unlinkSync(imagePath);
                }
            }
            
            lesson.classes = lesson.classes.filter(c => c.id !== classId);
            await course.save();
            
            req.session.messages = { success: 'Class deleted successfully!' };
            res.redirect('/admin/levels/edit/' + courseId + '/' + levelId);
            
        } catch (error) {
            console.error('Delete class error:', error);
            req.session.messages = { error: 'Something went wrong. Please try again.' };
            res.redirect('/admin/levels/edit/' + courseId + '/' + levelId);
        }
    }
);

app.post('/admin/levels/:courseId/:levelId/test/add', blockMobileAdmin, requireAdmin, async (req, res) => {
    const { question, option1, option2, option3, option4, correct } = req.body;
    if (!question || !option1 || !option2 || !option3 || !option4 || correct === undefined) {
        req.session.messages = { error: 'All test fields required.' };
        return res.redirect('/admin/levels/edit/' + req.params.courseId + '/' + req.params.levelId);
    }
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    const level = course.levels.find(l => l.id === req.params.levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect('/admin/courses/edit/' + req.params.courseId);
    }
    if (!level.test) level.test = { questions: [] };
    level.test.questions.push({
        id: generateId(),
        question,
        options: [option1, option2, option3, option4],
        correct: parseInt(correct)
    });
    await course.save();
    req.session.messages = { success: 'Test question added!' };
    res.redirect('/admin/levels/edit/' + req.params.courseId + '/' + req.params.levelId);
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
        return res.redirect('/admin/courses/edit/' + req.params.courseId);
    }
    level.test.questions = level.test.questions.filter(q => q.id !== req.params.questionId);
    if (level.test.questions.length === 0) level.test = null;
    await course.save();
    req.session.messages = { success: 'Test question deleted.' };
    res.redirect('/admin/levels/edit/' + req.params.courseId + '/' + req.params.levelId);
});

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
    req.session.messages = { success: 'Service added successfully!' };
    res.redirect('/admin/services');
});

app.get('/admin/services/delete/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    await Service.findOneAndDelete({ id: req.params.id });
    req.session.messages = { success: 'Service deleted.' };
    res.redirect('/admin/services');
});

app.post('/admin/services/toggle/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    const service = await Service.findOne({ id: req.params.id });
    if (service) {
        service.isActive = !service.isActive;
        await service.save();
        req.session.messages = { success: 'Service ' + (service.isActive ? 'activated' : 'deactivated') + '.' };
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
    req.session.messages = { success: 'Service updated successfully!' };
    res.redirect('/admin/services');
});

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
        req.session.messages = { success: 'User is now an admin!' };
    }
    res.redirect('/admin/manage-admins');
});

app.post('/admin/remove-admin/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    const user = await User.findOne({ id: req.params.id });
    if (user && user.email !== 'balogunmustaphaaddeji@gmail.com') {
        user.isAdmin = false;
        await user.save();
        req.session.messages = { success: 'Admin privileges removed.' };
    } else {
        req.session.messages = { error: 'Cannot remove the main admin.' };
    }
    res.redirect('/admin/manage-admins');
});

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
                    <h1 style="color: #8B5CF6; font-size: 28px;">Reply from SHINEX</h1>
                </div>
                <div style="background: #fff; padding: 24px; border-radius: 12px;">
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Dear <strong>${message.name}</strong>,
                    </p>
                    <p style="color: #5a4a70; font-size: 16px; line-height: 1.6;">
                        Thank you for contacting SHINEX Learning Circle. Here is our response:
                    </p>
                    <div style="background: #e8f5e9; padding: 15px; border-radius: 8px; margin: 16px 0; border-left: 4px solid #4CAF50;">
                        <p style="margin: 0;"><strong>Our Reply:</strong></p>
                        <p style="color: #1B5E20; margin: 8px 0 0 0;">${reply}</p>
                    </div>
                    <div style="text-align: center; margin-top: 20px;">
                        <a href="/app" 
                           style="background: #8B5CF6; color: #fff; padding: 12px 32px; border-radius: 30px; text-decoration: none; font-weight: 600; display: inline-block;">
                            Visit SHINEX
                        </a>
                    </div>
                </div>
                <div style="text-align: center; padding: 16px 0; color: #7a6a8f; font-size: 12px;">
                    <p>Learn. Understand. Protect.</p>
                </div>
            </div>
        `;
        
        await sendEmail(message.email, 'Reply from SHINEX Learning Circle', emailHtml);
        
        req.session.messages = { success: 'Reply sent successfully!' };
        res.redirect('/admin/messages');
        
    } catch (error) {
        console.error('Reply error:', error);
        req.session.messages = { error: 'Something went wrong. Please try again.' };
        res.redirect('/admin/messages/' + message.id);
    }
});

app.post('/admin/messages/delete/:id', blockMobileAdmin, requireAdmin, async (req, res) => {
    await ContactMessage.findOneAndDelete({ id: req.params.id });
    req.session.messages = { success: 'Message deleted.' };
    res.redirect('/admin/messages');
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
            console.log('Admin created: balogunmustaphaaddeji@gmail.com / SHINEXAdmin@2026');
        }

        app.listen(PORT, () => {
            console.log('\n SHINEX running on http://localhost:' + PORT);
            console.log(' Admin: balogunmustaphaaddeji@gmail.com / SHINEXAdmin@2026');
            console.log(' Admin Login: http://localhost:' + PORT + '/shinex-admin');
            console.log(' Mobile App: http://localhost:' + PORT + '/app');
            console.log(' MongoDB connected.\n');
            
            if (useSendGrid) {
                console.log(' Email configured with SendGrid');
            } else {
                console.log(' Email not configured.');
            }
            
            console.log(' Image upload enabled:', uploadDir + '\n');
        });
    } catch (error) {
        console.error('Server startup error:', error);
    }
}

startServer();