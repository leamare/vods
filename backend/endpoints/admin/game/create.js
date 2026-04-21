const { verifyApiKey } = require('../../../middleware/auth');
const { importPlaylist } = require('../../../services/playlist_import');

/**
 * @swagger
 * /admin/game/create:
 *   post:
 *     summary: Create or update a game stream (alias of /admin/playlist/import)
 *     description: |
 *       Accepts the same new-schema payload as /admin/playlist/import. Upserts the
 *       stream (game) entry together with the backing playlist and videos in a
 *       single transaction. Provided for discoverability; prefer /admin/playlist/import
 *       for clarity.
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
 *         description: Existing game updated
 *       201:
 *         description: New game created
 *       400:
 *         description: Missing or invalid fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
module.exports = (app) => {
  app.post('/admin/game/create', verifyApiKey, async (req, res) => {
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
        id: result.streamId,
        message: result.created ? 'Game created' : 'Game updated',
        playlistId: result.playlistId,
        streamId: result.streamId,
        videoIds: result.videoIds,
        created: result.created
      });
    } catch (error) {
      console.error('Error in POST /admin/game/create:', error);
      const isBadInput = /required|must be/.test(error.message);
      res.status(isBadInput ? 400 : 500).json({
        error: isBadInput ? error.message : 'Internal server error'
      });
    }
  });
};
