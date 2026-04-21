const pool = require('../../../db/connection');
const { verifyApiKey } = require('../../../middleware/auth');
const { getVideoIdByYoutubeId, getVideoIdByTwitchId } = require('../../../services/chat_db');

/**
 * @swagger
 * /admin/chat/shift/{videoId}:
 *   post:
 *     summary: Shift all chat message times for a video by a fixed offset
 *     description: |
 *       Adds `offset` seconds (may be negative) to every chat message's
 *       `time_seconds` for the given video. Messages whose adjusted time
 *       would be < 0 are deleted. Also updates the chat_metadata `duration`
 *       to match the new max time.
 *     tags: [Admin]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: true
 *         schema: { type: string }
 *         description: Internal video DB id (digits) or YouTube video id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [offset]
 *             properties:
 *               offset:
 *                 type: integer
 *                 description: Seconds to add to every message time (may be negative)
 *     responses:
 *       200:
 *         description: Chat shifted successfully
 *       400:
 *         description: Missing/invalid offset or unknown video
 *       404:
 *         description: No chat data found for this video
 */
module.exports = (app) => {
  app.post('/admin/chat/shift/:videoId', verifyApiKey, async (req, res) => {
    try {
      const urlVideoId = req.params.videoId;
      const qYoutubeId = req.query.youtube_id;
      const qTwitchId = req.query.twitch_id;
      const offset = parseInt(req.body?.offset, 10);

      if (!Number.isFinite(offset) || Number.isNaN(offset)) {
        return res.status(400).json({ error: 'Body field `offset` (integer seconds) is required' });
      }

      let internalVideoId = null;
      if (urlVideoId) {
        if (/^\d+$/.test(urlVideoId)) {
          internalVideoId = parseInt(urlVideoId, 10);
        } else {
          internalVideoId = await getVideoIdByYoutubeId(urlVideoId);
        }
      }
      if (!internalVideoId && qYoutubeId) {
        internalVideoId = await getVideoIdByYoutubeId(qYoutubeId);
      }
      if (!internalVideoId && qTwitchId) {
        internalVideoId = await getVideoIdByTwitchId(qTwitchId);
      }
      if (!internalVideoId) {
        return res.status(400).json({ error: 'Could not find video' });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const meta = await client.query(
          `SELECT id FROM chat_metadata WHERE video_id = $1`,
          [internalVideoId]
        );
        if (meta.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'No chat data found for this video' });
        }
        const metadataId = meta.rows[0].id;

        // Drop messages that would go negative, then shift the rest.
        let removed = { rowCount: 0 };
        if (offset < 0) {
          removed = await client.query(
            `DELETE FROM chat_messages
             WHERE metadata_id = $1 AND time_seconds + $2 < 0`,
            [metadataId, offset]
          );
        }

        const updated = await client.query(
          `UPDATE chat_messages
           SET time_seconds = time_seconds + $2
           WHERE metadata_id = $1`,
          [metadataId, offset]
        );

        const durationResult = await client.query(
          `SELECT COALESCE(MAX(time_seconds), 0) AS max_time,
                  COUNT(*)::int AS total
           FROM chat_messages
           WHERE metadata_id = $1`,
          [metadataId]
        );

        await client.query(
          `UPDATE chat_metadata
           SET duration = $2, total_messages = $3, updated_at = NOW()
           WHERE id = $1`,
          [
            metadataId,
            durationResult.rows[0].max_time,
            durationResult.rows[0].total
          ]
        );

        await client.query('COMMIT');

        res.json({
          success: true,
          videoId: internalVideoId,
          offset,
          messagesShifted: updated.rowCount,
          messagesRemoved: removed.rowCount,
          newMaxTime: durationResult.rows[0].max_time,
          totalMessages: durationResult.rows[0].total
        });
      } catch (dbError) {
        await client.query('ROLLBACK');
        throw dbError;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error in POST /admin/chat/shift:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};
