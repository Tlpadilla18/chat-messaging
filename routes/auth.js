const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/connection');

const router = express.Router();

function isValidPassword(password) {
    const passwordRegex =
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{10,}$/;
    return passwordRegex.test(password);
}

router.get('/signup', (req, res) => {
    res.render('signup', { error: null });
});

router.post('/signup', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.render('signup', { error: 'All fields are required.' });
        }

        if (!isValidPassword(password)) {
            return res.render('signup', {
                error: 'Password must be at least 10 characters and include uppercase, lowercase, number, and symbol.'
            });
        }

        const existingUser = await pool.query(
            'SELECT user_id FROM users WHERE username = $1',
            [username]
        );

        if (existingUser.rows.length > 0) {
            return res.render('signup', { error: 'Username already exists.' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        await pool.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
            [username, hashedPassword]
        );

        res.redirect('/login');
    } catch (error) {
    console.error('SIGNUP ERROR:', error);
    res.status(500).send('Server error during signup.');
}
});

router.get('/login', (req, res) => {
    res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.render('login', { error: 'All fields are required.' });
        }

        const result = await pool.query(
            'SELECT user_id, username, password_hash FROM users WHERE username = $1',
            [username]
        );

        if (result.rows.length === 0) {
            return res.render('login', { error: 'Invalid username or password.' });
        }

        const user = result.rows[0];

        const match = await bcrypt.compare(password, user.password_hash);

        if (!match) {
            return res.render('login', { error: 'Invalid username or password.' });
        }

        req.session.user = {
            user_id: user.user_id,
            username: user.username
        };

        res.redirect('/groups');
    } catch (error) {
        console.error('LOGIN ERROR FULL:', error);
        res.render('login', { error: 'Something went wrong. Please try again.' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error(error);
            return res.status(500).send('Could not log out.');
        }

        res.clearCookie('connect.sid');
        res.redirect('/login');
    });
});

module.exports = router;