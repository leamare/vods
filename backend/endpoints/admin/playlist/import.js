const { verifyApiKey } = require('../../../middleware/auth');
const { importPlaylist } = require('../../../services/playlist_import');

/**
 * @swagger
 * components:
 *   schemas:
 *     PlaylistImportRequest:
 *       type: object
 *       required:
 *         - gameName
 *         - playlistId
 *         - videos
 *       properties:
 *         gameName:
 *           type: string
 *         gameCover:
 *           oneOf:
 *             - type: string
 *             - type: array
 *               items:
 *                 type: string
 *           description: "URL string, or tuple like ['igdb', 'co8fkf']"
 *         tags:
 *           type: array
 *           items: { type: string }
 *         countOverride:
 *           type: integer
 *           description: "Added to videos.length to compute the displayed stream count (usually negative)"
 *         dateOverride:
 *           type: string
 *           format: date-time
 *           description: "Overrides the derived date_completed"
 *         playlistId:
 *           type: string
 *           description: "YouTube playlist id"
 *         videos:
 *           type: array
 *           items:
 *             type: object
 *             required: [videoId, title]
 *             properties:
 *               videoId: { type: string }
 *               title: { type: string }
 *               publishedAt: { type: string, format: date-time }
 *               duration: { type: integer }
 *               description: { type: string }
 *         existingStreamId:
 *           type: integer
 *           description: "Optional. Attach to an existing stream row instead of matching by playlistId/gameName."
 */

/**
 * @swagger
 * /admin/playlist/import:
 *   post:
 *     summary: Import or update a playlist (new schema)
 *     description: |
 *       Upserts a playlist, all of its videos, and the matching stream (game) entry
 *       in a single transaction. Matches by YouTube playlist id first, then by
 *       case-insensitive game_name; creates a new stream row if neither matches.
 *       Chat logs should be uploaded separately via POST /admin/chat/upload/:videoId.
 *     tags: [Admin]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PlaylistImportRequest'
 *     responses:
 *       200:
 *         description: Playlist imported (existing records updated)
 *       201:
 *         description: Playlist imported (new stream row created)
 *       400:
 *         description: Missing or invalid fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
module.exports = (app) => {
  app.post('/admin/playlist/import', verifyApiKey, async (req, res) => {
    try {
      const { existingStreamId, ...playlist } = req.body || {};

      if (!playlist.gameName || !playlist.playlistId || !Array.isArray(playlist.videos) || playlist.videos.length === 0) {
        return res.status(400).json({
          error: 'Missing required fields: gameName, playlistId, videos (non-empty array)'
        });
      }

      const result = await importPlaylist(playlist, {
        existingStreamId: existingStreamId || null
      });

      res.status(result.created ? 201 : 200).json({
        message: result.created
          ? 'Playlist imported and new stream created'
          : 'Playlist imported and existing stream updated',
        playlistId: result.playlistId,
        streamId: result.streamId,
        videoIds: result.videoIds,
        created: result.created
      });
    } catch (error) {
      console.error('Error in POST /admin/playlist/import:', error);
      const isBadInput = /required|must be/.test(error.message);
      res.status(isBadInput ? 400 : 500).json({
        error: isBadInput ? error.message : 'Internal server error'
      });
    }
  });
};
