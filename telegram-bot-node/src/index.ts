import { Telegraf, Context } from 'telegraf';
import cron from 'node-cron';
import dotenv from 'dotenv';
import {
    initDb,
    saveTask,
    getAllUserScores,
    getUserTasks,
    setAdmin,
    getAdmin,
    loadTasksFromCsv
} from './db';
import fs from 'fs';
import { Message } from 'telegraf/typings/core/types/typegram';

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
    throw new Error('Помилка: Змінна середовища BOT_TOKEN не встановлена.');
}

const bot = new Telegraf(BOT_TOKEN);

// Ініціалізація бази даних
initDb().catch((err) => {
    console.error('Помилка при ініціалізації бази даних:', err);
});

bot.start((ctx) => {
    ctx.reply(
        'Привіт! Я бот для підрахунку балів за виконані завдання.\n' +
        'Використовуйте команду /new_admin <username> для призначення адміністратора.'
    );
});

bot.command('new_admin', async (ctx) => {
    const args = ctx.message.text.split(' ');
    if (args.length < 2) {
        return ctx.reply(
            'Будь ласка, введіть username нового адміністратора після команди /new_admin.'
        );
    }

    const newAdmin = args[1].replace('@', '');
    const currentAdmin = await getAdmin();

    if (ctx.message.from?.username === currentAdmin || !currentAdmin) {
        await setAdmin(newAdmin);
        ctx.reply(`Новий адміністратор встановлений: @${newAdmin}`);
    } else {
        ctx.reply('Тільки поточний адміністратор може змінити адміністратора.');
    }
});

// Команда для завантаження CSV файлу
bot.command('upload_csv', async (ctx) => {
    const adminUsername = await getAdmin();
    if (ctx.message.from?.username !== adminUsername) {
        return ctx.reply('Тільки адміністратор може використовувати цю команду.');
    }

    const replyMessage = ctx.message.reply_to_message;

    // Перевірка на наявність reply_to_message та document
    if (!replyMessage || !('document' in replyMessage)) {
        return ctx.reply(
            'Будь ласка, відповідайте на повідомлення з прикріпленим CSV-файлом.'
        );
    }

    // Тепер TypeScript знає, що replyMessage має тип DocumentMessage
    const documentMessage = replyMessage as Message.DocumentMessage;

    const fileId = documentMessage.document.file_id;
    const link = await ctx.telegram.getFileLink(fileId);
    const filePath = `/tmp/${documentMessage.document.file_name}`;

    // Завантаження файлу
    const response = await fetch(link.href);
    const buffer = await response.arrayBuffer();
    fs.writeFileSync(filePath, Buffer.from(buffer));

    try {
        await loadTasksFromCsv(filePath);
        ctx.reply('Дані з CSV успішно завантажені в базу даних.');
    } catch (error) {
        ctx.reply(`Помилка при завантаженні даних: ${error}`);
    } finally {
        fs.unlinkSync(filePath);
    }
});

bot.on('text', async (ctx) => {
    const messageText = ctx.message.text;
    const username = ctx.message.from?.username;
    const chatType = ctx.chat.type;

    if ((chatType === 'group' || chatType === 'supergroup') && username) {
        const mentorMatch = messageText.match(/Ментор: @(.*)/);

        if (
            messageText.includes('Завдання') &&
            messageText.includes('#WienerGame') &&
            mentorMatch
        ) {
            const taskDescription = messageText.split('\n')[0];
            const mentorUsername = mentorMatch[1];
            await saveTask(username, taskDescription, mentorUsername);
            ctx.reply(`@${username}, ваше завдання збережено!`);
        }
    }
});

// Планування щотижневого звіту
cron.schedule(
    '0 13 * * 4',
    async () => {
        await sendWeeklySummary();
    },
    {
        timezone: 'Europe/Kyiv',
    }
);

// Функція відправки щотижневого звіту
async function sendWeeklySummary() {
    const adminUsername = await getAdmin();
    if (!adminUsername) {
        console.log('Адміністратор не встановлений.');
        return;
    }

    const results = await getAllUserScores();
    const resultsText = results
        .map((user: any) => `${user.username} - ${user.score}`)
        .join('\n');

    // Відправка адміністратору
    await bot.telegram.sendMessage(
        `@${adminUsername}`,
        `Щотижневий звіт:\n${resultsText}`
    );

    // Відправка менторам
    const mentorSummaries: { [key: string]: string[] } = {};

    for (const user of results) {
        const tasks = await getUserTasks(user.username);
        const taskList = tasks
            .map(
                (task: any) => `${task.task_description} - ${task.points} балів`
            )
            .join('\n\t');
        const mentor = tasks[0]?.mentor_username;

        if (mentor) {
            if (!mentorSummaries[mentor]) {
                mentorSummaries[mentor] = [];
            }
            mentorSummaries[mentor].push(
                `${user.username} - ${user.score}\n\t${taskList}`
            );
        }
    }

    for (const mentor in mentorSummaries) {
        await bot.telegram.sendMessage(
            `@${mentor}`,
            `Звіт по ваших менті:\n${mentorSummaries[mentor].join('\n')}`
        );
    }
}

// Запуск бота
bot.launch()
    .then(() => console.log('Бот запущений'))
    .catch((err) => console.error('Помилка при запуску бота:', err));

// Безпечне завершення роботи бота
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
