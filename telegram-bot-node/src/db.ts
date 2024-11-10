import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Налаштування підключення до бази даних
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'bot_database',
    user: process.env.DB_USER || 'bot_user',
    password: process.env.DB_PASSWORD || 'bot_password',
});

export async function initDb() {
    const client = await pool.connect();
    try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        score INTEGER DEFAULT 0
      );
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS tasks (
        task_id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(user_id),
        task_description TEXT NOT NULL,
        points INTEGER NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS tasks_info (
        task_id SERIAL PRIMARY KEY,
        task_description TEXT UNIQUE NOT NULL,
        points INTEGER NOT NULL
      );
    `);
        await client.query(`
      CREATE TABLE IF NOT EXISTS admin (
        admin_id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL
      );
    `);
    } finally {
        client.release();
    }
}

export async function addOrUpdateUser(username: string) {
    await pool.query(
        `
    INSERT INTO users (username) VALUES ($1)
    ON CONFLICT (username) DO NOTHING;
  `,
        [username]
    );
}

export async function saveTask(
    username: string,
    taskDescription: string,
    mentorUsername: string
) {
    const client = await pool.connect();
    try {
        await addOrUpdateUser(username);

        // Знайти бали за завдання з tasks_info
        const res = await client.query(
            `
      SELECT points FROM tasks_info WHERE task_description = $1;
    `,
            [taskDescription]
        );
        const points = res.rows[0]?.points || 0;

        // Додати завдання для користувача
        await client.query(
            `
      INSERT INTO tasks (user_id, task_description, points, timestamp)
      VALUES ((SELECT user_id FROM users WHERE username=$1), $2, $3, NOW());
    `,
            [username, taskDescription, points]
        );

        // Оновити бали користувача
        await client.query(
            `
      UPDATE users
      SET score = score + $1
      WHERE username = $2;
    `,
            [points, username]
        );
    } finally {
        client.release();
    }
}

export async function getUserScore(username: string): Promise<number> {
    const res = await pool.query(
        `
    SELECT score FROM users WHERE username = $1;
  `,
        [username]
    );
    return res.rows[0]?.score || 0;
}

export async function getAllUserScores() {
    const res = await pool.query(
        `
    SELECT username, score FROM users ORDER BY score DESC;
  `
    );
    return res.rows;
}

export async function getUserTasks(username: string) {
    const res = await pool.query(
        `
    SELECT task_description, points, timestamp
    FROM tasks
    WHERE user_id = (SELECT user_id FROM users WHERE username = $1)
    ORDER BY timestamp;
  `,
        [username]
    );
    return res.rows;
}

export async function setAdmin(username: string) {
    const client = await pool.connect();
    try {
        await client.query(`DELETE FROM admin;`);
        await client.query(
            `
      INSERT INTO admin (username) VALUES ($1)
    `,
            [username]
        );
    } finally {
        client.release();
    }
}

export async function getAdmin(): Promise<string | null> {
    const res = await pool.query(`SELECT username FROM admin LIMIT 1;`);
    return res.rows[0]?.username || null;
}

export async function loadTasksFromCsv(filePath: string) {
    // Для зчитування CSV використаємо модуль 'csv-parser' або 'fast-csv'
    // Або можна використати 'csvtojson'
    const csv = require('csvtojson');
    const tasks = await csv().fromFile(filePath);

    const client = await pool.connect();
    try {
        for (const task of tasks) {
            await client.query(
                `
        INSERT INTO tasks_info (task_description, points)
        VALUES ($1, $2)
        ON CONFLICT (task_description) DO UPDATE SET points = EXCLUDED.points;
      `,
                [task.task_description, task.points]
            );
        }
    } finally {
        client.release();
    }
}
