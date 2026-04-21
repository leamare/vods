const { verifyApiKey } = require('../../../middleware/auth');
const { parseOrPassthrough, isAlreadyParsed } = require('../../../services/chat_parser');
const { saveChatData, getVideoIdByYoutubeId, getVideoIdByTwitchId } = require('../../../services/chat_db');

/**
 * @swagger
 * /admin/chat/upload/{videoId}:
 *   post:
 *     summary: Upload chat log for a video
 *     description: |
 *       Accepts a parseChat JSON document (same format as the files in
 *       parseChat/test_data/*_playlist_chat/*.json — `{ badgeList, emoteList,
 *       userList, chatList }`) directly as the request body.
 *
 *       Upload a local file with:
 *       `curl -X POST .../admin/chat/upload/<videoId> \`
 *       `  -H "x-api-key: $KEY" \`
 *       `  -H "Content-Type: application/json" \`
 *       `  --data-binary @0.json`
 *
 *       Also accepted for backward compatibility:
 *       - `{ "chat_data": <parseChat json> }` wrapper
 *       - Raw twitch-chat-downloader array (will be parsed server-side)
 *       - Identification via body `{ video_id | youtube_id | twitch_id }` when
 *         not provided in URL / query
 *     tags: [Admin]
 *     security:
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: videoId
 *         required: false
 *         schema: { type: string }
 *         description: Internal video DB id (digits) or YouTube video id
 *       - in: query
 *         name: youtube_id
 *         schema: { type: string }
 *       - in: query
 *         name: twitch_id
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             description: parseChat JSON document
 *             type: object
 *             properties:
 *               badgeList: { type: array }
 *               emoteList: { type: array }
 *               userList: { type: array }
 *               chatList: { type: array }
 *     responses:
 *       200:
 *         description: Chat uploaded
 *       400:
 *         description: Missing chat data or unable to identify video
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
module.exports = (app) => {
  app.post('/admin/chat/upload/:videoId?', verifyApiKey, async (req, res) => {
    try {
      const urlVideoId = req.params.videoId;
      const qYoutubeId = req.query.youtube_id;
      const qTwitchId = req.query.twitch_id;
      const body = req.body;

      // Determine chat data: prefer raw parseChat-shaped body, fall back to
      // legacy wrapper, fall back to raw twitch-downloader array.
      let chatData;
      let bodyVideoId = null;
      let bodyYoutubeId = null;
      let bodyTwitchId = null;

      if (Array.isArray(body)) {
        chatData = body;
      } else if (isAlreadyParsed(body)) {
        chatData = body;
      } else if (body && typeof body === 'object' && body.chat_data) {
        chatData = body.chat_data;
        bodyVideoId = body.video_id || null;
        bodyYoutubeId = body.youtube_id || null;
        bodyTwitchId = body.twitch_id || null;
      } else {
        return res.status(400).json({
          error: 'Request body must be a parseChat JSON document (with chatList), a raw chat array, or `{ chat_data: ... }`'
        });
      }

      // Resolve internal video id from (in order): path param, query params, body fields
      let internalVideoId = null;
      let twitchVideoId = qTwitchId || bodyTwitchId || null;

      if (urlVideoId) {
        if (/^\d+$/.test(urlVideoId)) {
          internalVideoId = parseInt(urlVideoId);
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

      if (!internalVideoId && bodyVideoId) {
        internalVideoId = parseInt(bodyVideoId);
      }

      if (!internalVideoId && bodyYoutubeId) {
        internalVideoId = await getVideoIdByYoutubeId(bodyYoutubeId);
      }

      if (!internalVideoId && bodyTwitchId) {
        internalVideoId = await getVideoIdByTwitchId(bodyTwitchId);
      }

      if (!internalVideoId) {
        return res.status(400).json({
          error: 'Could not find video. Provide internal id / YouTube id in URL path, or ?youtube_id= / ?twitch_id= query param.'
        });
      }

      const parsedData = parseOrPassthrough(chatData);

      if (!parsedData.chatList || parsedData.chatList.length === 0) {
        return res.status(400).json({ error: 'No chat messages found in data' });
      }

      const result = await saveChatData(internalVideoId, parsedData, twitchVideoId);

      res.json({
        success: true,
        videoId: internalVideoId,
        messageCount: result.messageCount,
        metadataId: result.metadataId
      });
    } catch (error) {
      console.error('Error in POST /admin/chat/upload:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
};
