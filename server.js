const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(session({
    secret: 'fitness_app_secret_key_12345',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60 * 1000
    }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// חיבור לבסיס הנתונים SQLite
const dbPath = path.join(__dirname, 'history.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) console.error('שגיאה בחיבור לבסיס הנתונים:', err.message);
    else console.log('מחובר לבסיס הנתונים SQLite');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        google_id TEXT UNIQUE,
        username TEXT UNIQUE NOT NULL,
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        weight REAL,
        height REAL,
        body_fat REAL,
        goal TEXT,
        calories INTEGER,
        protein INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Google OAuth
const callbackURL = process.env.NODE_ENV === 'production'
    ? 'https://fitness-app-ngza.onrender.com/api/auth/google/callback'
    : 'http://localhost:3000/api/auth/google/callback';

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'DUMMY_ID',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'DUMMY_SECRET',
    callbackURL: callbackURL
},
    (accessToken, refreshToken, profile, done) => {
        const googleId = profile.id;
        const displayName = profile.displayName || profile.emails[0].value.split('@')[0];

        db.get(`SELECT * FROM users WHERE google_id = ?`, [googleId], (err, user) => {
            if (user) {
                return done(null, user);
            } else {
                db.run(`INSERT INTO users (google_id, username) VALUES (?, ?)`, [googleId, displayName], function (err) {
                    if (err) return done(err);
                    return done(null, { id: this.lastID, username: displayName });
                });
            }
        });
    }
));

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/api/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/#tab-account' }),
    (req, res) => {
        req.session.userId = req.user.id;
        req.session.username = req.user.username;
        res.redirect('/#tab-account');
    }
);

// --- 💬 נתיב צ'אט תמיכה וייעוץ ---
app.post('/api/ai-chat', async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'יש להזין הודעה' });

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        console.error('שגיאה: GROQ_API_KEY אינו מוגדר במשתני הסביבה!');
        return res.status(500).json({ error: 'מפתח GROQ_API_KEY אינו מוגדר בשרת' });
    }

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: 'אתה עוזר ויועץ מומחה לתזונה, כושר ובניית שריר באפליקציית Fitness App. ענה בצורה מקצועית, תמציתית, מעודדת ובשפה העברית בלבד. אל תציין שאתה AI או מודל שפה.'
                    },
                    {
                        role: 'user',
                        content: message
                    }
                ],
                max_tokens: 500
            })
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('Groq API Error Response:', JSON.stringify(data));
            return res.status(response.status).json({ error: data.error?.message || 'שגיאה בעיבוד הבקשה' });
        }

        const replyText = data.choices?.[0]?.message?.content || 'לא התקבלה תשובה.';
        res.json({ reply: replyText });

    } catch (error) {
        console.error('שגיאה בתקשורת עם ה-AI:', error.message || error);
        res.status(500).json({ error: 'שגיאה בעיבוד הבקשה.' });
    }
});

// --- 🥗 נתיב בניית תפריט תזונה מותאם אישית (FOOLPROOF & NO-MATH-EXPOSURE) ---
app.post('/api/generate-menu', async (req, res) => {
    let { goal, weight, calories, protein, dislikedFoods } = req.body;

    if (!calories || !protein) {
        return res.status(400).json({ error: 'יש לבצע חישוב במחשבון התזונה תחילה' });
    }

    // הגנת גבולות
    calories = Math.max(1200, Math.min(4000, Number(calories)));
    protein = Math.max(60, Math.min(250, Number(protein)));

    // ניקוי קלט
    let cleanDisliked = (dislikedFoods || '')
        .replace(/[<>{}[\]\\\/]/g, '')
        .trim()
        .slice(0, 150);

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        return res.status(500).json({ error: 'מפתח GROQ_API_KEY אינו מוגדר בשרת' });
    }

    const prompt = `
בנה תפריט תזונה יומי יחיד, נקי ומדויק בלבד.

נתונים:
- יעד: ${goal === 'muscle' ? 'בניית מסת שריר' : goal === 'fat_loss' ? 'חיטוב וירידה באחוז שומן' : 'שמירה על המשקל'}
- יעד קלוריות: ${calories} קלוריות
- יעד חלבון: ${protein} גרם חלבון
- רשימת מאכלים אסורים: ${cleanDisliked || 'אין'}

חוקי עיצוב וניסוח (קשיחים):
1. אל תרשום חישובים בסוגריים! אל תפרט קלוריות של כל רכיב בנפרד (אל תרשום "140 קלוריות + 140 קלוריות").
2. אל תרשום שום הודעות תיקון, חישובים פנימיים, או "תיקון נדרש:"! הדפס אך ורק תפריט יחיד וסופי.
3. אל תשתמש ב-Markdown (ללא **, #, -).

חוקי כמויות להגעה ל-${calories} קלוריות:
- אל תיתן מנות פצפונות של 100 גרם עוף/אורז. כדי להגיע ל-${calories} קלוריות, הגדל את הכמויות בצלחת (למשל: 200-250 גרם חזה עוף/פרגית/בקר, 250-300 גרם אורז/תפו"א, 3-4 פרוסות לחם, 30 גרם שקדים).
- ודא שסכום הקלוריות הרשום בסוף 4 הארוחות מסתכם באמת סביב ${calories} קלוריות!

חוקי סינון:
- אסור להשתמש באף מאכל המופיע ברשימה: "${cleanDisliked}".
- אם צוין "חלב" - אסור להשתמש ביוגורט, גבינות, קוטג' ומעדנים.
- אם צוין "טחינה" - אסור להשתמש בטחינה.
- אם צוין "ביצים" - אסור להשתמש בביצים.

פורמט יציאה קשיח (התחל ישר מהשורה הראשונה):
🍳 ארוחת בוקר: [רכיבים וכמויות] - [סך קלוריות לארוחה] קלוריות, [סך חלבון] גרם חלבון
🥗 ארוחת צהריים: [רכיבים וכמויות] - [סך קלוריות לארוחה] קלוריות, [סך חלבון] גרם חלבון
🏋️‍♂️ ארוחת ביניים: [רכיבים וכמויות] - [סך קלוריות לארוחה] קלוריות, [סך חלבון] גרם חלבון
🍴 ארוחת ערב: [רכיבים וכמויות] - [סך קלוריות לארוחה] קלוריות, [סך חלבון] גרם חלבון
📊 סיכום: ${calories} קלוריות, ${protein} גרם חלבון.
💡 טיפ זהב: [טיפ קצר]
    `;

    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [
                    {
                        role: 'system',
                        content: 'אתה מנוע תזונה קלינית וספורטיבית מתקדם. תפקידך להפיק תפריט יחיד, נקי לחלוטין ללא חישובים בסוגריים, ללא הודעות תיקון וללא פסקאות כפולות.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 1000
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ error: data.error?.message || 'שגיאה ביצירת התפריט' });
        }

        let menuText = data.choices?.[0]?.message?.content || 'לא ניתן היה לייצר תפריט.';

        // 🧹 ניקוי Backend סופי
        menuText = menuText.replace(/\*/g, '');
        menuText = menuText.replace(/#/g, '');
        menuText = menuText.replace(/קווייקר אובל|אובל/g, 'שיבולת שועל');
        menuText = menuText.replace(/אגוזי אלה/g, 'אגוזי לוז');
        menuText = menuText.replace(/אלמונד|Almond/gi, 'שקדים');
        menuText = menuText.replace(/(תיקון נדרש:|תיקון:)/g, ''); // הסרת מילות תיקון אם נותרו
        menuText = menuText.replace(/(טיפ:|💡 טיפ)/g, '\n💡 טיפ');

        res.json({ menu: menuText });

    } catch (error) {
        console.error('שגיאה ביצירת תפריט:', error.message || error);
        res.status(500).json({ error: 'שגיאה בעיבוד הבקשה ליצירת תפריט.' });
    }
});

// Auth API
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password || password.length < 4) {
        return res.status(400).json({ error: 'שם משתמש וסיסמה (לפחות 4 תווים) חובה' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username.trim(), hashedPassword], function (err) {
            if (err) {
                if (err.message.includes('UNIQUE')) return res.status(400).json({ error: 'שם המשתמש כבר תפוס' });
                return res.status(500).json({ error: 'שגיאה ביצירת המשתמש' });
            }
            req.session.userId = this.lastID;
            req.session.username = username.trim();
            res.json({ message: 'הרשמה בוצעה בהצלחה', username: req.session.username });
        });
    } catch (e) {
        res.status(500).json({ error: 'שגיאה בשרת' });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'יש להזין שם משתמש וסיסמה' });

    db.get(`SELECT * FROM users WHERE username = ?`, [username.trim()], async (err, user) => {
        if (err || !user) return res.status(400).json({ error: 'שם משתמש או סיסמה שגויים' });

        if (!user.password) return res.status(400).json({ error: 'משתמש זה נרשם באמצעות Google' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'שם משתמש או סיסמה שגויים' });

        req.session.userId = user.id;
        req.session.username = user.username;
        res.json({ message: 'התחברת בהצלחה', username: user.username });
    });
});

app.get('/api/me', (req, res) => {
    if (req.session.userId) {
        res.json({ loggedIn: true, username: req.session.username });
    } else {
        res.json({ loggedIn: false });
    }
});

app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ message: 'התנתקת בהצלחה' });
});

// Calculations & History API
app.post('/api/calculate', (req, res) => {
    const { weight, height, waist, neck, goal } = req.body;
    if (!weight || !height) return res.status(400).json({ error: 'משקל וגובה הם שדות חובה' });

    let bmr = (10 * weight) + (6.25 * height) - (5 * 25) + 5;
    let tdee = Math.round(bmr * 1.375);

    let recommendedCalories = tdee;
    let dailyProteinGrams = Math.round(weight * 2.0);

    if (goal === 'muscle') recommendedCalories += 300;
    else if (goal === 'fat_loss') recommendedCalories -= 400;

    let remainingCals = recommendedCalories - (dailyProteinGrams * 4);
    let dailyFatGrams = Math.round((recommendedCalories * 0.25) / 9);
    let dailyCarbGrams = Math.round((remainingCals - (dailyFatGrams * 9)) / 4);

    let bodyFatPercentage = null;
    if (waist && neck && waist > neck) {
        bodyFatPercentage = (495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height))) - 461;
        bodyFatPercentage = Math.round(bodyFatPercentage * 10) / 10;
    }

    const userId = req.session.userId || null;

    db.run(`INSERT INTO history (user_id, weight, height, body_fat, goal, calories, protein) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, weight, height, bodyFatPercentage, goal, recommendedCalories, dailyProteinGrams],
        function (err) {
            if (err) console.error('שגיאה בשמירת היסטוריה:', err.message);
        }
    );

    res.json({ recommendedCalories, dailyProteinGrams, dailyCarbGrams, dailyFatGrams, bodyFatPercentage });
});

app.get('/api/history', (req, res) => {
    const { goal } = req.query;
    const userId = req.session.userId || null;

    let sql = `SELECT * FROM history WHERE 1=1`;
    let params = [];

    if (userId) {
        sql += ` AND user_id = ?`;
        params.push(userId);
    } else {
        sql += ` AND user_id IS NULL`;
    }

    if (goal && goal !== 'all') {
        sql += ` AND goal = ?`;
        params.push(goal);
    }

    sql += ` ORDER BY id ASC`;

    db.all(sql, params, (err, rows) => {
        if (err) return res.status(500).json({ error: 'שגיאה בשליפת היסטוריה' });
        res.json(rows);
    });
});

app.delete('/api/history/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM history WHERE id = ?`, [id], function (err) {
        if (err) return res.status(500).json({ error: 'שגיאה במחיקת פריט' });
        res.json({ message: 'הפריט נמחק' });
    });
});

app.listen(PORT, () => {
    console.log(`השרת רץ בהצלחה בפורט ${PORT}`);
});