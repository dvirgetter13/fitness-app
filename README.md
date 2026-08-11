# 🏋️‍♂️ Fitness App - AI Powered Nutrition & Fitness Calculator

A full-stack web application designed to calculate daily nutritional needs (Calories & Protein) and generate fully customized, AI-driven daily meal plans based on user goals, physical metrics, and dietary restrictions.

🌐 **Live Demo:** [https://fitness-app-ngza.onrender.com](https://fitness-app-ngza.onrender.com)

---

## ✨ Key Features
* **Nutritional Calculator:** Calculates recommended daily calories and protein intake based on user metrics and fitness goals (Muscle Gain, Fat Loss, Maintenance).
* **AI Meal Plan Generator:** Powered by LLM (Groq API / Llama 3.3) to create highly structured, realistic daily menus without unwanted macros/ingredients.
* **Smart Dietary Filtering:** Handles specific constraints (e.g., No-Carb, Dairy-Free, Vegetarian) with strict logical safeguards for realistic meal distribution.
* **User Authentication:** Supports secure User Registration/Login and Google OAuth 2.0 integration.
* **History Tracking:** Stores user calculation history in a SQLite database.

---

## 🛠️ Tech Stack
* **Frontend:** HTML5, CSS3, JavaScript (ES6+), Responsive UI
* **Backend:** Node.js, Express.js
* **Database:** SQLite3
* **AI Integration:** Groq API (Llama 3.3 70B model)
* **Authentication:** Passport.js (Google OAuth 2.0, Local Session Management), Bcrypt
* **Deployment:** Render