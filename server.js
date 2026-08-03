const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const Joi = require('joi');
const app = express();

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./history.db', (err) => {
    if (err) console.error('Error opening database', err);
    else console.log('Connected to SQLite database.');
});

db.run(`CREATE TABLE IF NOT EXISTS calculations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    weight REAL,
    height REAL,
    waist REAL,
    neck REAL,
    body_fat REAL,
    goal TEXT,
    calories INTEGER,
    protein INTEGER,
    carbs INTEGER,
    fats INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

const calculationSchema = Joi.object({
    weight: Joi.number().min(30).max(300).required(),
    height: Joi.number().min(100).max(250).required(),
    waist: Joi.number().min(40).max(200).optional().allow('', null),
    neck: Joi.number().min(20).max(100).optional().allow('', null),
    goal: Joi.string().valid('muscle', 'fat_loss', 'maintenance').required()
});

app.post('/api/calculate', (req, res) => {
    const { error, value } = calculationSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const { weight, height, waist, neck, goal } = value;

    // חישוב אחוז שומן מוערך (נוסחת הצי האמריקאי לגברים) אם הוגדרו היקפים
    let bodyFatPercentage = null;
    if (waist && neck && waist > neck) {
        bodyFatPercentage = Math.round(
            (86.010 * Math.log10(waist - neck) - 70.041 * Math.log10(height) + 36.76) * 10
        ) / 10;
        if (bodyFatPercentage < 3) bodyFatPercentage = 3; // מינימום פיזיולוגי
    }

    // חישוב קלוריות בסיסי (Mifflin-St Jeor)
    const baseCalories = Math.round((10 * weight + 6.25 * height - 5 * 25 + 5) * 1.2);
    let recommendedCalories = baseCalories;
    let proteinMultiplier = 2.0;

    if (goal === 'muscle') {
        recommendedCalories = baseCalories + 300;
        proteinMultiplier = 2.0;
    } else if (goal === 'fat_loss') {
        recommendedCalories = baseCalories - 400;
        proteinMultiplier = 2.0;
    } else if (goal === 'maintenance') {
        recommendedCalories = baseCalories;
        proteinMultiplier = 1.8;
    }

    const proteinGrams = Math.round(weight * proteinMultiplier);
    const fatGrams = Math.round(weight * 0.9);
    const proteinCalories = proteinGrams * 4;
    const fatCalories = fatGrams * 9;
    const carbCalories = Math.max(0, recommendedCalories - (proteinCalories + fatCalories));
    const carbGrams = Math.round(carbCalories / 4);

    db.run(
        `INSERT INTO calculations (weight, height, waist, neck, body_fat, goal, calories, protein, carbs, fats) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [weight, height, waist || null, neck || null, bodyFatPercentage, goal, recommendedCalories, proteinGrams, carbGrams, fatGrams],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });

            res.json({
                id: this.lastID,
                weight,
                height,
                waist,
                neck,
                bodyFatPercentage,
                goal,
                dailyProteinGrams: proteinGrams,
                dailyFatGrams: fatGrams,
                dailyCarbGrams: carbGrams,
                recommendedCalories
            });
        }
    );
});

app.get('/api/history', (req, res) => {
    const { goal } = req.query;
    let query = `SELECT id, weight, height, waist, neck, body_fat, goal, calories, protein, carbs, fats, strftime('%Y-%m-%d %H:%M', created_at) as created_at FROM calculations `;
    let params = [];

    if (goal && goal !== 'all') {
        query += `WHERE goal = ? `;
        params.push(goal);
    }

    query += `ORDER BY id DESC LIMIT 15`;

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.delete('/api/history/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM calculations WHERE id = ?`, [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'Deleted successfully' });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;