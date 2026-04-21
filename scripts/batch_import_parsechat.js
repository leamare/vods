#!/usr/bin/env node
/**
 * Batch Import Script for parseChat Test Data
 * 
 * This script imports playlists and chat logs from the parseChat test_data folder
 * into the vods database. It automatically updates existing entries if they exist.
 * 
 * Usage:
 *   node scripts/batch_import_parsechat.js                    # Import all playlists
 *   node scripts/batch_import_parsechat.js <playlist_name>    # Import specific playlist
 *   node scripts/batch_import_parsechat.js --list             # List available playlists
 *   node scripts/batch_import_parsechat.js <name> --game-id=N # Attach to existing game
 * 
 * Examples:
 *   node scripts/batch_import_parsechat.js
 *   node scripts/batch_import_parsechat.js alien__isolation_playlist
 *   node scripts/batch_import_parsechat.js mass_effect_playlist --game-id=45
 * 
 * The --game-id option attaches the playlist to an existing stream entry (by streams.id)
 * instead of creating/updating based on game name.
 */

const fs = require('fs');
const path = require('path');

// Load env from vods directory
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = require('../backend/db/connection');
const { saveChatData } = require('../backend/services/chat_db');
const { importPlaylist } = require('../backend/services/playlist_import');

const PARSECHAT_TEST_DATA = path.join(__dirname, '../../parseChat/test_data');

function listAvailablePlaylists() {
  const files = fs.readdirSync(PARSECHAT_TEST_DATA);
  const playlists = files
    .filter(f => f.endsWith('_playlist.json'))
    .map(f => {
      const name = f.replace('.json', '');
      const chatDir = path.join(PARSECHAT_TEST_DATA, name.replace('_playlist', '_playlist_chat'));
      const hasChat = fs.existsSync(chatDir);
      const data = JSON.parse(fs.readFileSync(path.join(PARSECHAT_TEST_DATA, f), 'utf8'));
      return {
        filename: name,
        gameName: data.gameName,
        videoCount: data.videos.length,
        hasChat
      };
    });
  
  console.log('\nAvailable playlists in parseChat/test_data:\n');
  console.log('Filename                                      | Game Name                        | Videos | Chat');
  console.log('-'.repeat(100));
  
  playlists.forEach(p => {
    const fn = p.filename.padEnd(45);
    const gn = p.gameName.padEnd(32);
    const vc = String(p.videoCount).padStart(6);
    const hc = p.hasChat ? '  ✓' : '  -';
    console.log(`${fn} | ${gn} | ${vc} | ${hc}`);
  });
  
  console.log(`\nTotal: ${playlists.length} playlists`);
}

async function importPlaylistFromParseChat(playlistName, existingStreamId = null) {
  const playlistPath = path.join(PARSECHAT_TEST_DATA, `${playlistName}.json`);

  if (!fs.existsSync(playlistPath)) {
    throw new Error(`Playlist file not found: ${playlistPath}`);
  }

  const playlist = JSON.parse(fs.readFileSync(playlistPath, 'utf8'));

  const { playlistId, videoIds } = await importPlaylist(playlist, {
    existingStreamId,
    log: (msg) => console.log(msg)
  });

  // Import chat logs if they exist alongside the playlist json
  const chatDirName = playlistName.replace('_playlist', '_playlist_chat');
  const chatDirPath = path.join(PARSECHAT_TEST_DATA, chatDirName);

  if (fs.existsSync(chatDirPath)) {
    console.log(`  Importing chat logs from: ${chatDirName}/`);

    const chatFiles = fs.readdirSync(chatDirPath)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => parseInt(a) - parseInt(b));

    for (let i = 0; i < chatFiles.length && i < videoIds.length; i++) {
      const chatFilePath = path.join(chatDirPath, chatFiles[i]);
      const chatData = JSON.parse(fs.readFileSync(chatFilePath, 'utf8'));

      if (chatData.chatList && chatData.chatList.length > 0) {
        const result = await saveChatData(videoIds[i], chatData);
        console.log(`    Chat ${i}: ${result.messageCount} messages saved`);
      } else {
        console.log(`    Chat ${i}: No messages`);
      }
    }
  } else {
    console.log(`  No chat directory found`);
  }

  return { playlistId, videoIds };
}

async function importAllPlaylists() {
  const files = fs.readdirSync(PARSECHAT_TEST_DATA);
  const playlists = files
    .filter(f => f.endsWith('_playlist.json'))
    .map(f => f.replace('.json', ''))
    .sort();
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Importing ${playlists.length} playlists from parseChat/test_data`);
  console.log(`${'='.repeat(60)}`);
  
  let success = 0;
  let failed = 0;
  const errors = [];
  
  for (let i = 0; i < playlists.length; i++) {
    const playlist = playlists[i];
    console.log(`\n[${i + 1}/${playlists.length}] ${playlist}`);
    
    try {
      await importPlaylistFromParseChat(playlist);
      success++;
    } catch (error) {
      console.error(`  ❌ ERROR: ${error.message}`);
      errors.push({ playlist, error: error.message });
      failed++;
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Import complete: ${success} success, ${failed} failed`);
  
  if (errors.length > 0) {
    console.log(`\nFailed imports:`);
    errors.forEach(e => console.log(`  - ${e.playlist}: ${e.error}`));
  }
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage:');
    console.log('  node scripts/batch_import_parsechat.js                    # Import all playlists');
    console.log('  node scripts/batch_import_parsechat.js <playlist_name>    # Import specific playlist');
    console.log('  node scripts/batch_import_parsechat.js --list             # List available playlists');
    console.log('  node scripts/batch_import_parsechat.js <name> --game-id=N # Attach to existing game');
    console.log('');
    console.log('Examples:');
    console.log('  node scripts/batch_import_parsechat.js');
    console.log('  node scripts/batch_import_parsechat.js alien__isolation_playlist');
    console.log('  node scripts/batch_import_parsechat.js mass_effect_playlist --game-id=45');
    console.log('');
    console.log('The script automatically updates existing playlists/streams if they exist.');
    console.log('The --game-id option attaches the playlist to an existing stream/game entry.');
    process.exit(0);
  }
  
  if (args.includes('--list')) {
    listAvailablePlaylists();
    process.exit(0);
  }
  
  try {
    // Filter out flags to get the playlist name
    const playlistName = args.find(a => !a.startsWith('--'));
    const gameIdArg = args.find(a => a.startsWith('--game-id='));
    const gameId = gameIdArg ? parseInt(gameIdArg.split('=')[1]) : null;
    
    if (!playlistName || args.includes('--all')) {
      // Import all playlists
      await importAllPlaylists();
    } else {
      // Import specific playlist
      await importPlaylistFromParseChat(playlistName, gameId);
    }
    
    console.log('\nDone!');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
  
  await pool.end();
}

if (require.main === module) {
  main();
}

module.exports = { importPlaylistFromParseChat, listAvailablePlaylists };
