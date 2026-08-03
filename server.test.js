const request = require('supertest');
const app = require('./server');

describe('Full-Stack Fitness API Tests', () => {
    
    // בדיקה 1: חישוב קלוריות ומקרואים תקין
    test('POST /api/calculate - Valid input returns calculated macros', async () => {
        const res = await request(app)
            .post('/api/calculate')
            .send({
                weight: 80,
                height: 180,
                goal: 'muscle'
            });

        expect(res.statusCode).toEqual(200);
        expect(res.body).toHaveProperty('recommendedCalories');
        expect(res.body).toHaveProperty('dailyProteinGrams');
        expect(res.body.dailyProteinGrams).toBe(160); // 80kg * 2.0
    });

    // בדיקה 2: אימות קלט לא תקין דרך Joi
    test('POST /api/calculate - Invalid input (negative weight) returns 400', async () => {
        const res = await request(app)
            .post('/api/calculate')
            .send({
                weight: -10,
                height: 180,
                goal: 'muscle'
            });

        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('error');
    });

    // בדיקה 3: שליפת היסטוריה
    test('GET /api/history - Returns array of calculation history', async () => {
        const res = await request(app).get('/api/history');
        
        expect(res.statusCode).toEqual(200);
        expect(Array.isArray(res.body)).toBeTruthy();
    });
});