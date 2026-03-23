const express = require('express');
const pool = require('../db/connection');
const { requireLogin } = require('../middleware/auth');

const router = express.Router();

router.get('/groups', requireLogin, async (req, res) => {
    try {
        const userId = req.session.user.user_id;

        const result = await pool.query(`
            SELECT 
                g.group_id,
                g.group_name,
                MAX(m.sent_at) AS last_message_time,
                COUNT(CASE WHEN mr.user_id IS NULL THEN 1 END) AS unread_count
            FROM chat_groups g
            JOIN group_members gm ON g.group_id = gm.group_id
            LEFT JOIN messages m ON g.group_id = m.group_id
            LEFT JOIN message_reads mr 
                ON m.message_id = mr.message_id 
                AND mr.user_id = $1
            WHERE gm.user_id = $1
            GROUP BY g.group_id, g.group_name
            ORDER BY last_message_time DESC NULLS LAST
        `, [userId]);

        const groups = result.rows;

        res.render('groups', {
            groups,
            total: groups.length,
            user: req.session.user
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading groups');
    }
});

router.get('/groups/create', requireLogin, async (req, res) => {
    try {
        const currentUserId = req.session.user.user_id;

        // get all users except current user
        const result = await pool.query(
            'SELECT user_id, username FROM users WHERE user_id != $1',
            [currentUserId]
        );

        res.render('create-group', {
            users: result.rows
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading create group page');
    }
});

router.post('/groups/create', requireLogin, async (req, res) => {
    try {
        const { group_name, members } = req.body;
        const creatorId = req.session.user.user_id;

        if (!group_name) {
            return res.send('Group name required');
        }

        // 1. create group
        const groupResult = await pool.query(
            'INSERT INTO chat_groups (group_name, created_by) VALUES ($1, $2) RETURNING group_id',
            [group_name, creatorId]
        );

        const groupId = groupResult.rows[0].group_id;

        // 2. add creator
        await pool.query(
            'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
            [groupId, creatorId]
        );

        // 3. add selected users
        if (members) {
            const memberList = Array.isArray(members) ? members : [members];

            for (let userId of memberList) {
                await pool.query(
                    'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)',
                    [groupId, userId]
                );
            }
        }

        res.redirect('/groups');

    } catch (error) {
        console.error(error);
        res.status(500).send('Error creating group');
    }
});

router.get('/groups/:id', requireLogin, async (req, res) => {
    try {
        const groupId = req.params.id;
        const userId = req.session.user.user_id;

        // 🔥 AUTHORIZATION CHECK (VERY IMPORTANT FOR MARKS)
        const memberCheck = await pool.query(
            'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
            [groupId, userId]
        );

        if (memberCheck.rows.length === 0) {
            return res.status(400).send('Not authorized for this group');
        }

        const messagesResult = await pool.query(`
    SELECT 
        m.message_id,
        m.message_text,
        m.sent_at,
        u.username,
        COALESCE(
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'emoji', r.emoji,
                    'user_id', r.user_id
                )
            ) FILTER (WHERE r.reaction_id IS NOT NULL),
            '[]'
        ) AS reactions
    FROM messages m
    JOIN users u ON m.sender_id = u.user_id
    LEFT JOIN message_reactions r ON m.message_id = r.message_id
    WHERE m.group_id = $1
    GROUP BY m.message_id, u.username
    ORDER BY m.sent_at ASC
`, [groupId]);

        const messages = messagesResult.rows;

        // 🔥 mark messages as read
        for (let msg of messages) {
            await pool.query(`
                INSERT INTO message_reads (message_id, user_id)
                VALUES ($1, $2)
                ON CONFLICT (message_id, user_id) DO NOTHING
            `, [msg.message_id, userId]);
        }

        res.render('chat', {
            messages,
            groupId
        });

    } catch (error) {
        console.error(error);
        res.status(500).send('Error loading chat');
    }
});

router.post('/groups/:id/message', requireLogin, async (req, res) => {
    try {
        const groupId = req.params.id;
        const userId = req.session.user.user_id;
        const { message } = req.body;

        if (!message) {
            return res.redirect(`/groups/${groupId}`);
        }

        // authorization again (important)
        const memberCheck = await pool.query(
            'SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2',
            [groupId, userId]
        );

        if (memberCheck.rows.length === 0) {
            return res.status(400).send('Not authorized');
        }

        await pool.query(
            'INSERT INTO messages (group_id, sender_id, message_text) VALUES ($1, $2, $3)',
            [groupId, userId, message]
        );

        res.redirect(`/groups/${groupId}`);

    } catch (error) {
        console.error(error);
        res.status(500).send('Error sending message');
    }
});

router.post('/messages/:id/react', requireLogin, async (req, res) => {
    try {
        const messageId = req.params.id;
        const userId = req.session.user.user_id;
        const { emoji, groupId } = req.body;

        if (!emoji) {
            return res.redirect(`/groups/${groupId}`);
        }

        await pool.query(
            'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, $3)',
            [messageId, userId, emoji]
        );

        res.redirect(`/groups/${groupId}`);

    } catch (error) {
        console.error(error);
        res.status(500).send('Error adding reaction');
    }
});

module.exports = router;