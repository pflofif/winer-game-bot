-- Створення таблиці для збереження інформації про користувачів
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    score INTEGER DEFAULT 0
);

-- Створення таблиці для збереження виконаних завдань
CREATE TABLE IF NOT EXISTS tasks (
    task_id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(user_id),
    task_description TEXT NOT NULL,
    points INTEGER NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Створення таблиці для збереження інформації про завдання та їхні бали
CREATE TABLE IF NOT EXISTS tasks_info (
    task_id SERIAL PRIMARY KEY,
    task_description TEXT UNIQUE NOT NULL,
    points INTEGER NOT NULL
);

-- Створення таблиці для збереження адміністратора
CREATE TABLE IF NOT EXISTS admin (
    admin_id SERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL
);
