require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo').default || require('connect-mongo');

const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

app.use(
    session({
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({
            mongoUrl: process.env.MONGO_URL,
            crypto: {
                secret: process.env.SESSION_SECRET
            }
        }),
        cookie: {
            maxAge: 1000 * 60 * 60
        }
    })
);

app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

const authRoutes = require('./routes/auth');
app.use('/', authRoutes);

const groupRoutes = require('./routes/groups');
app.use('/', groupRoutes);

app.get('/', (req, res) => {
    if (req.session.user) {
        return res.redirect('/groups');
    }
    res.redirect('/login');
});

const pool = require('./db/connection');

app.get('/test-db', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json(result.rows);
    } catch (error) {
        console.error('TEST DB ERROR:', error);
        res.status(500).send('DB connection failed');
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});