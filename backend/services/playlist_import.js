const pool = require('../db/connection');

/**
 * Import a playlist + its videos + upsert the stream (game) entry.
 *
 * Accepts the "parseChat playlist" schema:
 *   {
 *     gameName: string,
 *     gameCover: ["igdb", "<id>"] | string | null,
 *     tags: string[],
 *     countOverride: number,     // added to videos.length for streams.stream_count
 *     dateOverride: string,      // ISO date, overrides date_completed
 *     playlistId: string,        // YouTube playlist id
 *     videos: [
 *       { videoId: string, title: string, publishedAt: string, duration: number, description: string }
 *     ]
 *   }
 *
 * Options:
 *   - existingStreamId: if provided, attach to this stream row instead of
 *     creating/matching by playlistId or gameName.
 *   - log: optional logger (defaults to noop). Receives string messages.
 *
 * Returns { playlistId, videoIds, streamId, created } where `created` is true
 * when a new stream row was inserted (false when updated in place or attached).
 */
async function importPlaylist(playlist, { existingStreamId = null, log = () => {} } = {}) {
  if (!playlist || typeof playlist !== 'object') {
    throw new Error('playlist payload is required');
  }
  if (!playlist.gameName) throw new Error('playlist.gameName is required');
  if (!playlist.playlistId) throw new Error('playlist.playlistId is required');
  if (!Array.isArray(playlist.videos) || playlist.videos.length === 0) {
    throw new Error('playlist.videos must be a non-empty array');
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    log(`Importing: ${playlist.gameName}`);
    log(`  Playlist ID: ${playlist.playlistId}`);
    log(`  Videos: ${playlist.videos.length}`);

    const playlistResult = await client.query(
      `INSERT INTO playlists (youtube_id, name, tags)
       VALUES ($1, $2, $3)
       ON CONFLICT (youtube_id) DO UPDATE SET
         name = EXCLUDED.name,
         tags = EXCLUDED.tags
       RETURNING id`,
      [playlist.playlistId, playlist.gameName, JSON.stringify(playlist.tags || [])]
    );
    const playlistRowId = playlistResult.rows[0].id;
    log(`  Playlist DB ID: ${playlistRowId}`);

    const videoIds = [];

    for (let i = 0; i < playlist.videos.length; i++) {
      const video = playlist.videos[i];

      let subTitle = null;
      let description = video.description || null;

      if (description) {
        const match = description.match(/Stream Title :: (.*?) ::/s);
        if (match) {
          subTitle = match[1].trim();
          description = description.replace(match[0], '').trim();
        }
      }

      const videoResult = await client.query(
        `INSERT INTO videos (yt_id, name, sub_title, description, duration, published_at, playlist_id, playlist_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (yt_id) DO UPDATE SET
           name = EXCLUDED.name,
           sub_title = EXCLUDED.sub_title,
           description = EXCLUDED.description,
           duration = EXCLUDED.duration,
           published_at = EXCLUDED.published_at,
           playlist_id = EXCLUDED.playlist_id,
           playlist_order = EXCLUDED.playlist_order
         RETURNING id`,
        [
          video.videoId,
          video.title,
          subTitle,
          description || null,
          video.duration || null,
          video.publishedAt ? new Date(video.publishedAt) : null,
          playlistRowId,
          i
        ]
      );

      videoIds.push(videoResult.rows[0].id);
      log(`  Video ${i}: ${video.title} -> ID ${videoResult.rows[0].id}`);
    }

    // countOverride is added to videos.length (commonly a negative int)
    const streamCount = playlist.videos.length + (playlist.countOverride || 0);

    const gameCoverValue = playlist.gameCover
      ? (Array.isArray(playlist.gameCover) ? JSON.stringify(playlist.gameCover) : playlist.gameCover)
      : null;

    const lastVideo = playlist.videos[playlist.videos.length - 1];
    const dateCompleted = playlist.dateOverride
      ? new Date(playlist.dateOverride)
      : (lastVideo && lastVideo.publishedAt ? new Date(lastVideo.publishedAt) : null);

    let streamId;
    let created = false;

    if (existingStreamId) {
      await client.query(
        `UPDATE streams SET
           playlist_id = $1, first_video_id = $2, stream_count = $3,
           game_cover = COALESCE($4, game_cover), date_completed = COALESCE($5, date_completed),
           tags = $6
         WHERE id = $7`,
        [
          playlistRowId,
          videoIds[0],
          streamCount,
          gameCoverValue,
          dateCompleted,
          JSON.stringify(playlist.tags || []),
          existingStreamId
        ]
      );
      streamId = existingStreamId;
      log(`  Attached to existing stream/game (ID: ${existingStreamId})`);
    } else {
      // Match existing stream first by playlist YouTube id, then by game name (ci)
      let existing = await client.query(
        `SELECT s.id FROM streams s
         JOIN playlists p ON s.playlist_id = p.id
         WHERE p.youtube_id = $1`,
        [playlist.playlistId]
      );

      if (existing.rows.length === 0) {
        existing = await client.query(
          `SELECT id FROM streams WHERE LOWER(game_name) = LOWER($1)`,
          [playlist.gameName]
        );
      }

      if (existing.rows.length === 0) {
        const result = await client.query(
          `INSERT INTO streams (game_name, tags, stream_count, playlist_id, first_video_id, game_cover, date_completed)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            playlist.gameName,
            JSON.stringify(playlist.tags || []),
            streamCount,
            playlistRowId,
            videoIds[0],
            gameCoverValue,
            dateCompleted
          ]
        );
        streamId = result.rows[0].id;
        created = true;
        log(`  Created new stream entry (ID: ${streamId})`);
      } else {
        streamId = existing.rows[0].id;
        await client.query(
          `UPDATE streams SET
             game_name = $1, tags = $2, stream_count = $3, playlist_id = $4,
             first_video_id = $5, game_cover = COALESCE($6, game_cover),
             date_completed = COALESCE($7, date_completed)
           WHERE id = $8`,
          [
            playlist.gameName,
            JSON.stringify(playlist.tags || []),
            streamCount,
            playlistRowId,
            videoIds[0],
            gameCoverValue,
            dateCompleted,
            streamId
          ]
        );
        log(`  Updated existing stream entry (ID: ${streamId})`);
      }
    }

    await client.query('COMMIT');

    return { playlistId: playlistRowId, videoIds, streamId, created };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { importPlaylist };
