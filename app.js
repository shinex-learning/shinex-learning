const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sanitizeHtml = require('sanitize-html');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'shinex-super-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true }
}));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================================================
// DATA HELPERS
// ============================================================
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const usersFile = path.join(DATA_DIR, 'users.json');
const coursesFile = path.join(DATA_DIR, 'courses.json');

function readUsers() {
    try {
        const data = fs.readFileSync(usersFile, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function writeUsers(users) {
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2));
}

function readCourses() {
    try {
        const data = fs.readFileSync(coursesFile, 'utf8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function writeCourses(courses) {
    fs.writeFileSync(coursesFile, JSON.stringify(courses, null, 2));
}

function findUserByEmail(email) {
    const users = readUsers();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

function findCourseById(id) {
    const courses = readCourses();
    return courses.find(c => c.id === id);
}

function getUserById(id) {
    const users = readUsers();
    return users.find(u => u.id === id);
}

function initDefaultCourses() {
    const courses = readCourses();
    if (courses.length === 0) {
        writeCourses([]);
        return [];
    }
    return courses;
}

async function initAdminUser() {
    const users = readUsers();
    const adminExists = users.some(u => u.isAdmin === true);
    if (!adminExists) {
        const hashed = await bcrypt.hash('admin123', 10);
        const admin = {
            id: uuidv4(),
            fullName: 'Admin User',
            email: 'admin@shinex.com',
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
            createdAt: new Date().toISOString()
        };
        users.push(admin);
        writeUsers(users);
        console.log('✅ Admin created: admin@shinex.com / admin123');
    }
}

function sanitize(content) {
    return sanitizeHtml(content, {
        allowedTags: ['b', 'strong', 'i', 'em', 'u', 'p', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'br', 'img', 'a', 'blockquote', 'pre', 'code', 'span', 'div'],
        allowedAttributes: {
            img: ['src', 'alt', 'title', 'style'],
            a: ['href', 'target', 'rel'],
            span: ['style'],
            div: ['style']
        }
    });
}

// ============================================================
// OTP SYSTEM (Phone Verification)
// ============================================================
const otpStore = {};

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function storeOTP(phone, otp) {
    otpStore[phone] = {
        otp: otp,
        expires: Date.now() + 5 * 60 * 1000
    };
    console.log(`📱 OTP for ${phone}: ${otp}`);
}

function verifyOTP(phone, otp) {
    const record = otpStore[phone];
    if (!record) return false;
    if (record.otp !== otp) return false;
    if (Date.now() > record.expires) return false;
    delete otpStore[phone];
    return true;
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================
function requireAuth(req, res, next) {
    if (!req.session.userId) {
        req.session.messages = { error: 'Please log in to access this page.' };
        return res.redirect('/login');
    }
    next();
}

function requireAdmin(req, res, next) {
    if (!req.session.userId) {
        req.session.messages = { error: 'Please log in as admin.' };
        return res.redirect('/admin/login');
    }
    const user = getUserById(req.session.userId);
    if (!user || !user.isAdmin) {
        req.session.messages = { error: 'Admin access required.' };
        return res.redirect('/dashboard');
    }
    next();
}

// ============================================================
// HOME ROUTES
// ============================================================

app.get('/', (req, res) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    const courses = readCourses();
    res.render('index', {
        user,
        courses,
        messages: req.session.messages || {},
        showBack: false
    });
    req.session.messages = {};
});

// ============================================================
// REGISTRATION - STEP 1
// ============================================================

app.get('/register/step1', (req, res) => {
    if (req.session.userId) return res.redirect('/dashboard');
    res.render('register-step1', {
        messages: req.session.messages || {},
        showBack: false
    });
    req.session.messages = {};
});

app.post('/register/step1', async (req, res) => {
    const { fullName, email, password, confirmPassword } = req.body;
    
    if (!fullName || !email || !password || !confirmPassword) {
        req.session.messages = { error: 'All fields are required.' };
        return res.redirect('/register/step1');
    }
    if (password !== confirmPassword) {
        req.session.messages = { error: 'Passwords do not match.' };
        return res.redirect('/register/step1');
    }
    if (password.length < 6) {
        req.session.messages = { error: 'Password must be at least 6 characters.' };
        return res.redirect('/register/step1');
    }
    
    const existing = findUserByEmail(email);
    if (existing) {
        req.session.messages = { error: 'Email already registered.' };
        return res.redirect('/register/step1');
    }
    
    req.session.tempUser = {
        fullName,
        email,
        password: await bcrypt.hash(password, 10)
    };
    
    res.redirect('/register/step2');
});

// ============================================================
// REGISTRATION - STEP 2
// ============================================================

app.get('/register/step2', (req, res) => {
    if (req.session.userId) return res.redirect('/dashboard');
    if (!req.session.tempUser) {
        req.session.messages = { error: 'Please start from step 1.' };
        return res.redirect('/register/step1');
    }
    const courses = readCourses();
    res.render('register-step2', {
        tempUser: req.session.tempUser,
        courses,
        messages: req.session.messages || {},
        showBack: true
    });
    req.session.messages = {};
});

app.post('/register/step2', async (req, res) => {
    if (!req.session.tempUser) {
        req.session.messages = { error: 'Session expired.' };
        return res.redirect('/register/step1');
    }
    
    const { firstName, lastName, gender, dob, country, experienceLevel, courseId, interests, bio, terms, phone, otp } = req.body;
    
    if (!firstName || !lastName || !gender || !dob || !country || !experienceLevel || !courseId || !terms || !phone) {
        req.session.messages = { error: 'All fields including phone number are required.' };
        return res.redirect('/register/step2');
    }
    
    // Verify OTP
    if (!verifyOTP(phone, otp)) {
        req.session.messages = { error: 'Invalid or expired OTP. Please verify your phone.' };
        return res.redirect('/register/step2');
    }
    
    if (gender !== 'Male' && gender !== 'Female') {
        req.session.messages = { error: 'Please select Male or Female.' };
        return res.redirect('/register/step2');
    }
    
    const interestsArray = interests ? (Array.isArray(interests) ? interests : [interests]) : [];
    const temp = req.session.tempUser;
    
    const newUser = {
        id: uuidv4(),
        fullName: temp.fullName,
        email: temp.email,
        password: temp.password,
        firstName,
        lastName,
        gender,
        dob,
        country,
        phone: phone,
        experienceLevel,
        courseId,
        interests: interestsArray,
        bio: bio || '',
        termsAccepted: true,
        isAdmin: false,
        progress: {},
        createdAt: new Date().toISOString()
    };
    
    const users = readUsers();
    users.push(newUser);
    writeUsers(users);
    delete req.session.tempUser;
    req.session.userId = newUser.id;
    req.session.messages = { success: '🎉 Registration complete!' };
    res.redirect('/dashboard');
});

// ============================================================
// OTP ROUTES
// ============================================================

app.post('/send-otp', (req, res) => {
    const { phone } = req.body;
    if (!phone || phone.length < 10) {
        return res.json({ success: false, message: 'Invalid phone number.' });
    }
    
    const otp = generateOTP();
    storeOTP(phone, otp);
    console.log(`📱 OTP for ${phone}: ${otp}`);
    res.json({ success: true, message: 'OTP sent!', otp: otp });
});

app.post('/verify-otp', (req, res) => {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
        return res.json({ success: false, message: 'Phone and OTP required.' });
    }
    
    const isValid = verifyOTP(phone, otp);
    if (isValid) {
        req.session.phoneVerified = true;
        req.session.verifiedPhone = phone;
        res.json({ success: true, message: 'Phone verified!' });
    } else {
        res.json({ success: false, message: 'Invalid or expired OTP.' });
    }
});

// ============================================================
// LOGIN / LOGOUT
// ============================================================

app.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/dashboard');
    res.render('login', {
        messages: req.session.messages || {},
        showBack: false
    });
    req.session.messages = {};
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        req.session.messages = { error: 'Email and password required.' };
        return res.redirect('/login');
    }
    
    const user = findUserByEmail(email);
    if (!user) {
        req.session.messages = { error: 'Invalid credentials.' };
        return res.redirect('/login');
    }
    
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
        req.session.messages = { error: 'Invalid credentials.' };
        return res.redirect('/login');
    }
    
    req.session.userId = user.id;
    req.session.messages = { success: `Welcome back, ${user.firstName}!` };
    
    if (user.isAdmin) {
        return res.redirect('/admin/dashboard');
    }
    res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/');
    });
});

// ============================================================
// TERMS & PRIVACY
// ============================================================

app.get('/terms', (req, res) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    res.render('terms', {
        user,
        messages: req.session.messages || {},
        showBack: true
    });
    req.session.messages = {};
});

app.get('/privacy', (req, res) => {
    const user = req.session.userId ? getUserById(req.session.userId) : null;
    res.render('privacy', {
        user,
        messages: req.session.messages || {},
        showBack: true
    });
    req.session.messages = {};
});

// ============================================================
// STUDENT DASHBOARD
// ============================================================

app.get('/dashboard', requireAuth, (req, res) => {
    const user = getUserById(req.session.userId);
    if (!user) {
        req.session.destroy();
        return res.redirect('/login');
    }
    
    const courses = readCourses();
    const enrolledCourse = user.courseId ? findCourseById(user.courseId) : null;
    
    let totalClasses = 0;
    let completedClasses = 0;
    let progress = 0;
    
    if (enrolledCourse && enrolledCourse.lessons) {
        enrolledCourse.lessons.forEach(lesson => {
            if (lesson.classes) {
                lesson.classes.forEach(cls => {
                    totalClasses++;
                    if (user.progress && user.progress[cls.id]) {
                        completedClasses++;
                    }
                });
            }
        });
        progress = totalClasses > 0 ? Math.round((completedClasses / totalClasses) * 100) : 0;
    }
    
    res.render('dashboard', {
        user,
        enrolledCourse,
        progress,
        completedClasses,
        totalClasses,
        messages: req.session.messages || {},
        showBack: false
    });
    req.session.messages = {};
});

// ============================================================
// STUDENT COURSE VIEW
// ============================================================

app.get('/course', requireAuth, (req, res) => {
    const user = getUserById(req.session.userId);
    if (!user) {
        req.session.destroy();
        return res.redirect('/login');
    }
    
    const course = user.courseId ? findCourseById(user.courseId) : null;
    if (!course) {
        req.session.messages = { error: 'No course enrolled.' };
        return res.redirect('/dashboard');
    }
    
    const numberedCourse = {
        ...course,
        lessons: course.lessons.map((lesson, lIdx) => ({
            ...lesson,
            number: (lIdx + 1),
            classes: lesson.classes ? lesson.classes.map((cls, cIdx) => ({
                ...cls,
                number: `${lIdx + 1}.${cIdx + 1}`
            })) : []
        }))
    };
    
    res.render('course', {
        user,
        course: numberedCourse,
        progress: user.progress || {},
        messages: req.session.messages || {},
        showBack: true
    });
    req.session.messages = {};
});

// ============================================================
// MARK CLASS COMPLETE
// ============================================================

app.post('/course/complete/:classId', requireAuth, (req, res) => {
    const user = getUserById(req.session.userId);
    if (!user) {
        req.session.destroy();
        return res.redirect('/login');
    }
    
    const { classId } = req.params;
    if (!user.progress) user.progress = {};
    user.progress[classId] = true;
    
    const users = readUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx !== -1) {
        users[idx].progress = user.progress;
        writeUsers(users);
    }
    
    req.session.messages = { success: '✅ Class completed!' };
    res.redirect('/course');
});

// ============================================================
// ADMIN - LOGIN
// ============================================================

app.get('/admin/login', (req, res) => {
    if (req.session.userId) {
        const user = getUserById(req.session.userId);
        if (user && user.isAdmin) return res.redirect('/admin/dashboard');
    }
    res.render('admin/login', {
        messages: req.session.messages || {},
        showBack: false
    });
    req.session.messages = {};
});

app.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;
    const user = findUserByEmail(email);
    if (!user || !user.isAdmin) {
        req.session.messages = { error: 'Invalid admin credentials.' };
        return res.redirect('/admin/login');
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
        req.session.messages = { error: 'Invalid admin credentials.' };
        return res.redirect('/admin/login');
    }
    req.session.userId = user.id;
    req.session.messages = { success: 'Welcome to Admin Panel.' };
    res.redirect('/admin/dashboard');
});

// ============================================================
// ADMIN - DASHBOARD
// ============================================================

app.get('/admin/dashboard', requireAdmin, (req, res) => {
    const admin = getUserById(req.session.userId);
    const users = readUsers();
    const courses = readCourses();
    
    const totalStudents = users.filter(u => !u.isAdmin).length;
    const totalCourses = courses.length;
    const totalEnrollments = users.filter(u => u.courseId && !u.isAdmin).length;
    
    let totalLessons = 0;
    let totalClasses = 0;
    courses.forEach(c => {
        if (c.lessons) {
            totalLessons += c.lessons.length;
            c.lessons.forEach(l => {
                if (l.classes) totalClasses += l.classes.length;
            });
        }
    });
    
    const studentsByCourse = {};
    courses.forEach(c => {
        studentsByCourse[c.id] = {
            course: c,
            students: users.filter(u => u.courseId === c.id && !u.isAdmin)
        };
    });
    
    res.render('admin/dashboard', {
        admin,
        totalStudents,
        totalCourses,
        totalEnrollments,
        totalLessons,
        totalClasses,
        studentsByCourse,
        courses,
        users,
        messages: req.session.messages || {},
        showBack: true
    });
    req.session.messages = {};
});

// ============================================================
// ADMIN - STUDENTS
// ============================================================

app.get('/admin/students', requireAdmin, (req, res) => {
    const users = readUsers();
    const students = users.filter(u => !u.isAdmin);
    const courses = readCourses();
    const courseMap = {};
    courses.forEach(c => { courseMap[c.id] = c.title; });
    
    res.render('admin/students', {
        students,
        courseMap,
        messages: req.session.messages || {},
        showBack: true
    });
    req.session.messages = {};
});

// ============================================================
// ADMIN - COURSES
// ============================================================

app.get('/admin/courses', requireAdmin, (req, res) => {
    const courses = readCourses();
    res.render('admin/courses', {
        courses,
        messages: req.session.messages || {},
        showBack: true
    });
    req.session.messages = {};
});

app.post('/admin/courses/add', requireAdmin, (req, res) => {
    const { title, description, level, duration, review } = req.body;
    if (!title || !description || !level || !duration) {
        req.session.messages = { error: 'All fields required.' };
        return res.redirect('/admin/courses');
    }
    
    const courses = readCourses();
    const newCourse = {
        id: uuidv4(),
        title,
        description,
        level,
        duration,
        lessons: [],
        test: null,
        review: review || ''
    };
    courses.push(newCourse);
    writeCourses(courses);
    req.session.messages = { success: '✅ Course added!' };
    res.redirect('/admin/courses');
});

app.post('/admin/courses/delete/:id', requireAdmin, (req, res) => {
    let courses = readCourses();
    courses = courses.filter(c => c.id !== req.params.id);
    writeCourses(courses);
    
    const users = readUsers();
    users.forEach(u => {
        if (u.courseId === req.params.id) {
            u.courseId = null;
            u.progress = {};
        }
    });
    writeUsers(users);
    
    req.session.messages = { success: '🗑️ Course deleted.' };
    res.redirect('/admin/courses');
});

app.post('/admin/courses/delete-all', requireAdmin, (req, res) => {
    writeCourses([]);
    const users = readUsers();
    users.forEach(u => {
        u.courseId = null;
        u.progress = {};
    });
    writeUsers(users);
    req.session.messages = { success: '🗑️ All courses deleted!' };
    res.redirect('/admin/courses');
});

app.get('/admin/courses/edit/:id', requireAdmin, (req, res) => {
    const course = findCourseById(req.params.id);
    if (!course) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    res.render('admin/course-edit', {
        course,
        messages: req.session.messages || {},
        showBack: true
    });
    req.session.messages = {};
});

app.post('/admin/courses/edit/:id', requireAdmin, (req, res) => {
    const { title, description, level, duration } = req.body;
    const courses = readCourses();
    const idx = courses.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    courses[idx].title = title || courses[idx].title;
    courses[idx].description = description || courses[idx].description;
    courses[idx].level = level || courses[idx].level;
    courses[idx].duration = duration || courses[idx].duration;
    writeCourses(courses);
    req.session.messages = { success: '✅ Course updated!' };
    res.redirect('/admin/courses');
});

// ============================================================
// ADMIN - LESSONS
// ============================================================

app.post('/admin/courses/:id/lessons/add', requireAdmin, (req, res) => {
    const { title, description } = req.body;
    if (!title) {
        req.session.messages = { error: 'Lesson title required.' };
        return res.redirect(`/admin/courses/edit/${req.params.id}`);
    }
    
    const courses = readCourses();
    const idx = courses.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    
    const newLesson = {
        id: uuidv4(),
        title,
        description: description || '',
        classes: []
    };
    courses[idx].lessons.push(newLesson);
    writeCourses(courses);
    req.session.messages = { success: '✅ Lesson added!' };
    res.redirect(`/admin/courses/edit/${req.params.id}`);
});

app.post('/admin/courses/:courseId/lessons/delete/:lessonId', requireAdmin, (req, res) => {
    const courses = readCourses();
    const idx = courses.findIndex(c => c.id === req.params.courseId);
    if (idx === -1) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    courses[idx].lessons = courses[idx].lessons.filter(l => l.id !== req.params.lessonId);
    writeCourses(courses);
    req.session.messages = { success: '🗑️ Lesson deleted.' };
    res.redirect(`/admin/courses/edit/${req.params.courseId}`);
});

// ============================================================
// ADMIN - CLASSES
// ============================================================

app.post('/admin/courses/:courseId/lessons/:lessonId/classes/add', requireAdmin, (req, res) => {
    const { title, content, imageUrl, videoUrl, externalLink } = req.body;
    if (!title || !content) {
        req.session.messages = { error: 'Class title and content required.' };
        return res.redirect(`/admin/courses/edit/${req.params.courseId}`);
    }
    
    const courses = readCourses();
    const cIdx = courses.findIndex(c => c.id === req.params.courseId);
    if (cIdx === -1) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    
    const lesson = courses[cIdx].lessons.find(l => l.id === req.params.lessonId);
    if (!lesson) {
        req.session.messages = { error: 'Lesson not found.' };
        return res.redirect(`/admin/courses/edit/${req.params.courseId}`);
    }
    
    const newClass = {
        id: uuidv4(),
        title,
        content: sanitize(content),
        imageUrl: imageUrl || '',
        videoUrl: videoUrl || '',
        externalLink: externalLink || ''
    };
    lesson.classes.push(newClass);
    writeCourses(courses);
    req.session.messages = { success: '✅ Class added!' };
    res.redirect(`/admin/courses/edit/${req.params.courseId}`);
});

app.post('/admin/courses/:courseId/lessons/:lessonId/classes/delete/:classId', requireAdmin, (req, res) => {
    const courses = readCourses();
    const cIdx = courses.findIndex(c => c.id === req.params.courseId);
    if (cIdx === -1) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    const lesson = courses[cIdx].lessons.find(l => l.id === req.params.lessonId);
    if (!lesson) {
        req.session.messages = { error: 'Lesson not found.' };
        return res.redirect(`/admin/courses/edit/${req.params.courseId}`);
    }
    lesson.classes = lesson.classes.filter(cl => cl.id !== req.params.classId);
    writeCourses(courses);
    req.session.messages = { success: '🗑️ Class deleted.' };
    res.redirect(`/admin/courses/edit/${req.params.courseId}`);
});

app.post('/admin/courses/:courseId/lessons/:lessonId/classes/edit/:classId', requireAdmin, (req, res) => {
    const { title, content, imageUrl, videoUrl, externalLink } = req.body;
    const courses = readCourses();
    const cIdx = courses.findIndex(c => c.id === req.params.courseId);
    if (cIdx === -1) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    const lesson = courses[cIdx].lessons.find(l => l.id === req.params.lessonId);
    if (!lesson) {
        req.session.messages = { error: 'Lesson not found.' };
        return res.redirect(`/admin/courses/edit/${req.params.courseId}`);
    }
    const cls = lesson.classes.find(cl => cl.id === req.params.classId);
    if (!cls) {
        req.session.messages = { error: 'Class not found.' };
        return res.redirect(`/admin/courses/edit/${req.params.courseId}`);
    }
    cls.title = title || cls.title;
    cls.content = sanitize(content || cls.content);
    cls.imageUrl = imageUrl || '';
    cls.videoUrl = videoUrl || '';
    cls.externalLink = externalLink || '';
    writeCourses(courses);
    req.session.messages = { success: '✅ Class updated!' };
    res.redirect(`/admin/courses/edit/${req.params.courseId}`);
});

// ============================================================
// ADMIN - COURSE REVIEW & TEST
// ============================================================

app.post('/admin/courses/review/:id', requireAdmin, (req, res) => {
    const { review } = req.body;
    const courses = readCourses();
    const idx = courses.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    courses[idx].review = review || '';
    writeCourses(courses);
    req.session.messages = { success: '✅ Review saved!' };
    res.redirect(`/admin/courses/edit/${req.params.id}`);
});

app.post('/admin/courses/:id/test', requireAdmin, (req, res) => {
    const { question, option1, option2, option3, option4, correct } = req.body;
    if (!question || !option1 || !option2 || !option3 || !option4 || correct === undefined) {
        req.session.messages = { error: 'All test fields required.' };
        return res.redirect(`/admin/courses/edit/${req.params.id}`);
    }
    
    const courses = readCourses();
    const idx = courses.findIndex(c => c.id === req.params.id);
    if (idx === -1) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    
    if (!courses[idx].test) {
        courses[idx].test = { questions: [] };
    }
    courses[idx].test.questions.push({
        id: uuidv4(),
        question,
        options: [option1, option2, option3, option4],
        correct: parseInt(correct)
    });
    writeCourses(courses);
    req.session.messages = { success: '✅ Test question added!' };
    res.redirect(`/admin/courses/edit/${req.params.id}`);
});

app.post('/admin/courses/:courseId/test/delete/:questionId', requireAdmin, (req, res) => {
    const courses = readCourses();
    const idx = courses.findIndex(c => c.id === req.params.courseId);
    if (idx === -1) {
        req.session.messages = { error: 'Course not found.' };
        return res.redirect('/admin/courses');
    }
    if (courses[idx].test) {
        courses[idx].test.questions = courses[idx].test.questions.filter(q => q.id !== req.params.questionId);
        if (courses[idx].test.questions.length === 0) {
            courses[idx].test = null;
        }
        writeCourses(courses);
    }
    req.session.messages = { success: '🗑️ Test question deleted.' };
    res.redirect(`/admin/courses/edit/${req.params.courseId}`);
});

// ============================================================
// START SERVER
// ============================================================

async function startServer() {
    initDefaultCourses();
    await initAdminUser();
    app.listen(PORT, () => {
        console.log(`🚀 SHINEX Learning Circle running on http://localhost:${PORT}`);
        console.log(`🔐 Admin: admin@shinex.com / admin123`);
        console.log(`📚 No default courses - add your own!`);
        console.log(`📱 OTP System: Phone verification enabled!`);
    });
}

startServer();