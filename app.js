const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: process.env.SESSION_SECRET || 'shinex-super-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 365,
        secure: false,
        httpOnly: true,
        sameSite: 'lax'
    }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================================
// DEVICE DETECTION – Mobile vs Desktop
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
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// ============================================================
// MONGODB SCHEMAS
// ============================================================

// User Schema
const UserSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    fullName: String,
    email: { type: String, unique: true },
    password: String,
    firstName: String,
    lastName: String,
    gender: String,
    dob: String,
    country: String,
    school: String,
    experienceLevel: String,
    courseId: String,
    interests: [String],
    bio: String,
    termsAccepted: Boolean,
    isAdmin: { type: Boolean, default: false },
    progress: { type: Object, default: {} },
    phone: String,
    isVerified: { type: Boolean, default: false },
    verificationToken: String,
    tokenExpires: Date,
    createdAt: { type: Date, default: Date.now }
});

// Course Schema
const CourseSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    title: String,
    description: String,
    duration: String,
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

const User = mongoose.model('User', UserSchema);
const Course = mongoose.model('Course', CourseSchema);

// ============================================================
// HELPERS
// ============================================================
function generateId() {
    return crypto.randomBytes(16).toString('hex');
}

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function sanitize(content) {
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
// EMAIL TRANSPORTER (Gmail)
// ============================================================
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
async function requireAuth(req, res, next) {
    if (!req.session.userId) {
        req.session.messages = { error: 'Please log in to access this page.' };
        return res.redirect('/login');
    }
    const user = await User.findOne({ id: req.session.userId });
    if (!user) {
        req.session.destroy();
        return res.redirect('/login');
    }
    req.user = user;
    next();
}

async function requireAdmin(req, res, next) {
    if (!req.session.adminId) {
        req.session.messages = { error: 'Please log in as admin.' };
        return res.redirect('/shinex-admin');
    }
    const admin = await User.findOne({ id: req.session.adminId });
    if (!admin || !admin.isAdmin) {
        req.session.destroy();
        req.session.messages = { error: 'Admin access required.' };
        return res.redirect('/shinex-admin');
    }
    req.admin = admin;
    next();
}

// ============================================================
// AI TUTOR (Free – Groq API)
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
// REGISTRATION ROUTES – REDIRECTED (AdSense Review)
// ============================================================
app.get('/register/step1', (req, res) => {
    res.redirect('/');
});

app.post('/register/step1', (req, res) => {
    res.redirect('/');
});

app.get('/register/step2', (req, res) => {
    res.redirect('/');
});

app.post('/register/step2', (req, res) => {
    res.redirect('/');
});

// ============================================================
// VERIFY EMAIL ROUTE – REDIRECTED
// ============================================================
app.get('/verify-email/:token', (req, res) => {
    res.redirect('/');
});

// ============================================================
// RESEND VERIFICATION EMAIL – REDIRECTED
// ============================================================
app.post('/resend-verification', (req, res) => {
    res.redirect('/');
});

// ============================================================
// LOGIN – REDIRECTED
// ============================================================
app.get('/login', (req, res) => {
    res.redirect('/');
});

app.post('/login', (req, res) => {
    res.redirect('/');
});

// ============================================================
// ADMIN LOGIN (SEPARATE – Still Works)
// ============================================================
app.get('/shinex-admin', (req, res) => {
    if (req.session.adminId) return res.redirect('/admin/dashboard');
    if (isMobile(req)) {
        req.session.messages = { error: 'Admin panel is only available on desktop.' };
        return res.redirect('/');
    }
    res.render('admin/login', { messages: req.session.messages || {}, showBack: false, title: 'Admin Login' });
    req.session.messages = {};
});

app.post('/shinex-admin', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email, isAdmin: true });
    if (!user) {
        req.session.messages = { error: 'Invalid admin credentials.' };
        return res.redirect('/shinex-admin');
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
        req.session.messages = { error: 'Invalid admin credentials.' };
        return res.redirect('/shinex-admin');
    }
    req.session.adminId = user.id;
    req.session.messages = { success: 'Welcome to Admin Panel.' };
    res.redirect('/admin/dashboard');
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/'));
});

app.get('/admin/logout', (req, res) => {
    req.session.adminId = null;
    res.redirect('/shinex-admin');
});

// ============================================================
// FORGOT PASSWORD – REDIRECTED
// ============================================================
app.get('/forgot-password', (req, res) => {
    res.redirect('/');
});

app.post('/forgot-password', (req, res) => {
    res.redirect('/');
});

app.get('/reset-password/:token', (req, res) => {
    res.redirect('/');
});

app.post('/reset-password/:token', (req, res) => {
    res.redirect('/');
});

// ============================================================
// TERMS & PRIVACY (Public – Keep)
// ============================================================
app.get('/terms', (req, res) => {
    const view = isMobile(req) ? 'mobile/terms' : 'terms';
    res.render(view, { user: null, messages: req.session.messages || {}, showBack: true, title: 'Terms' });
    req.session.messages = {};
});

app.get('/privacy', (req, res) => {
    const view = isMobile(req) ? 'mobile/privacy' : 'privacy';
    res.render(view, { user: null, messages: req.session.messages || {}, showBack: true, title: 'Privacy' });
    req.session.messages = {};
});

// ============================================================
// HOME
// ============================================================
app.get('/', async (req, res) => {
    const user = req.session.userId ? await User.findOne({ id: req.session.userId }) : null;
    const courses = await Course.find();
    const view = isMobile(req) ? 'mobile/index' : 'index';
    res.render(view, {
        user,
        courses,
        messages: req.session.messages || {},
        showBack: false,
        title: 'Home'
    });
    req.session.messages = {};
});

// ============================================================
// SETTINGS
// ============================================================
app.get('/settings', requireAuth, async (req, res) => {
    const user = await User.findOne({ id: req.user.id });
    const view = isMobile(req) ? 'mobile/settings' : 'settings';
    res.render(view, {
        user,
        messages: req.session.messages || {},
        showBack: true,
        title: 'Settings'
    });
    req.session.messages = {};
});

app.post('/settings/update', requireAuth, async (req, res) => {
    const { firstName, lastName, bio, currentPassword, newPassword, confirmPassword } = req.body;
    const user = await User.findOne({ id: req.user.id });
    if (!user) return res.redirect('/settings');

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (bio !== undefined) user.bio = bio;

    if (currentPassword && newPassword && confirmPassword) {
        if (!(await bcrypt.compare(currentPassword, user.password))) {
            req.session.messages = { error: 'Current password is incorrect.' };
            return res.redirect('/settings');
        }
        if (newPassword !== confirmPassword || newPassword.length < 6) {
            req.session.messages = { error: 'New password must be at least 6 characters and match.' };
            return res.redirect('/settings');
        }
        user.password = await bcrypt.hash(newPassword, 10);
    }

    await user.save();
    req.session.messages = { success: 'Settings updated successfully!' };
    res.redirect('/settings');
});

// ============================================================
// DASHBOARD
// ============================================================
app.get('/dashboard', requireAuth, async (req, res) => {
    const user = await User.findOne({ id: req.user.id });
    const courses = await Course.find();
    const enrolledCourse = user.courseId ? await Course.findOne({ id: user.courseId }) : null;

    let totalClasses = 0, completedClasses = 0, score = 0;
    if (enrolledCourse && enrolledCourse.levels) {
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
        user,
        enrolledCourse,
        progress,
        completedClasses,
        totalClasses,
        score,
        messages: req.session.messages || {},
        showBack: false,
        title: 'Dashboard'
    });
    req.session.messages = {};
});

// ============================================================
// COURSE PAGE (Student)
// ============================================================
app.get('/course/:courseId', requireAuth, async (req, res) => {
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/dashboard');
    }
    const view = isMobile(req) ? 'mobile/course' : 'course';
    res.render(view, {
        user: req.user,
        course,
        messages: req.session.messages || {},
        showBack: true,
        title: course.title
    });
    req.session.messages = {};
});

// ============================================================
// LEVEL PAGE (Student Learning)
// ============================================================
app.get('/level/:courseId/:levelId', requireAuth, async (req, res) => {
    const user = await User.findOne({ id: req.user.id });
    const course = await Course.findOne({ id: req.params.courseId });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/dashboard');
    }

    const level = course.levels.find(l => l.id === req.params.levelId);
    if (!level) {
        req.session.messages = { error: 'Level not found.' };
        return res.redirect('/course/' + req.params.courseId);
    }

    let allClasses = [];
    if (level.lessons) {
        level.lessons.forEach(lesson => {
            if (lesson.classes) {
                lesson.classes.forEach(cls => {
                    allClasses.push({
                        id: cls.id,
                        lessonId: lesson.id,
                        lessonTitle: lesson.title,
                        title: cls.title,
                        content: cls.content,
                        imageUrl: cls.imageUrl,
                        videoUrl: cls.videoUrl,
                        externalLink: cls.externalLink,
                        completed: !!(user.progress && user.progress[cls.id])
                    });
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

    const view = isMobile(req) ? 'mobile/level' : 'level';
    res.render(view, {
        user,
        course,
        level,
        currentClass,
        currentLesson,
        allClasses,
        totalClasses,
        completedClasses,
        progress,
        score,
        messages: req.session.messages || {},
        showBack: true,
        title: level.name + ' - ' + course.title
    });
    req.session.messages = {};
});

// ============================================================
// MARK CLASS COMPLETE
// ============================================================
app.post('/level/complete/:classId', requireAuth, async (req, res) => {
    const user = await User.findOne({ id: req.user.id });
    const { classId } = req.params;
    if (!user.progress) user.progress = {};
    user.progress[classId] = true;
    await user.save();

    req.session.messages = { success: '✅ Class completed! +10 points!' };
    res.redirect('back');
});

// ============================================================
// NEXT CLASS
// ============================================================
app.post('/level/next/:courseId/:levelId/:classId', requireAuth, async (req, res) => {
    const user = await User.findOne({ id: req.user.id });
    const { courseId, levelId, classId } = req.params;

    if (!user.progress) user.progress = {};
    user.progress[classId] = true;
    await user.save();

    const course = await Course.findOne({ id: courseId });
    const level = course.levels.find(l => l.id === levelId);

    let allClasses = [];
    if (level && level.lessons) {
        level.lessons.forEach(lesson => {
            if (lesson.classes) {
                lesson.classes.forEach(cls => {
                    allClasses.push(cls.id);
                });
            }
        });
    }

    let currentIndex = allClasses.indexOf(classId);
    let nextClassId = null;
    if (currentIndex !== -1 && currentIndex < allClasses.length - 1) {
        nextClassId = allClasses[currentIndex + 1];
    }

    if (nextClassId) {
        req.session.messages = { success: '✅ Class completed! Moving to next...' };
        res.redirect(`/level/${courseId}/${levelId}?classId=${nextClassId}`);
    } else {
        req.session.messages = { success: '🎉 All classes completed! You finished this level!' };
        res.redirect(`/course/${courseId}`);
    }
});

// ============================================================
// ADMIN ROUTES (All admin routes here – desktop only)
// ============================================================

// Admin middleware to block mobile
function blockMobileAdmin(req, res, next) {
    if (isMobile(req)) {
        req.session.messages = { error: 'Admin panel is only available on desktop.' };
        return res.redirect('/');
    }
    next();
}

app.get('/admin/dashboard', blockMobileAdmin, requireAdmin, async (req, res) => {
    const users = await User.find();
    const courses = await Course.find();
    const totalStudents = users.filter(u => !u.isAdmin).length;
    const totalCourses = courses.length;
    const totalEnrollments = users.filter(u => u.courseId && !u.isAdmin).length;

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
        admin: req.admin,
        totalStudents,
        totalCourses,
        totalEnrollments,
        totalClasses,
        studentsByCourse,
        courses,
        users,
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
    const { title, description, duration, review } = req.body;
    if (!title || !description || !duration) {
        req.session.messages = { error: 'All fields required.' };
        return res.redirect('/admin/courses');
    }

    const newCourse = new Course({
        id: generateId(),
        title,
        description,
        duration,
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
    const { title, description, duration, review } = req.body;
    const course = await Course.findOne({ id: req.params.id });
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    course.title = title || course.title;
    course.description = description || course.description;
    course.duration = duration || course.duration;
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
    const adminExists = await User.findOne({ email: 'balogunmustaphaaddeji@gmail.com' });
    if (!adminExists) {
        const hashed = await bcrypt.hash('SHINEXAdmin@2026', 10);
        const admin = new User({
            id: generateId(),
            fullName: 'Admin User',
            email: 'balogunmustaphaaddeji@gmail.com',
            password: hashed,
            firstName: 'Admin',
            lastName: 'User',
            gender: 'Male',
            dob: '1990-01-01',
            country: 'USA',
            experienceLevel: 'Advanced',
            courseId: null,
            interests: [],
            bio: 'System Administrator',
            termsAccepted: true,
            isAdmin: true,
            progress: {},
            isVerified: true,
            createdAt: new Date()
        });
        await admin.save();
        console.log('✅ Admin created: balogunmustaphaaddeji@gmail.com / SHINEXAdmin@2026');
    }

    app.listen(PORT, () => {
        console.log(`🚀 SHINEX running on http://localhost:${PORT}`);
        console.log(`🔐 Admin: balogunmustaphaaddeji@gmail.com / SHINEXAdmin@2026`);
        console.log(`📚 Admin Login: http://localhost:${PORT}/shinex-admin`);
        console.log(`📚 MongoDB connected. Data is now PERSISTENT!`);
    });
}

startServer();